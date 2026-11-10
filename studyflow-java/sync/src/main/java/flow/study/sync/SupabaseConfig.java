package flow.study.sync;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * Which Supabase project this copy talks to.
 *
 * Only two values, and only ever the two the browser already gets: the project
 * URL and the ANON key. The anon key is public by design -- it is inlined into
 * the web bundle and is bounded entirely by RLS, so baking it into the desktop
 * app is exactly as safe as shipping the website. The service role key is a
 * different thing and must never appear here; it would bypass every policy in
 * supabase/migrations.
 *
 * Resolution order, most specific first:
 *
 *   1. Environment variables, so a developer can point a build at a scratch
 *      project without editing anything.
 *   2. supabase.properties in the data directory, which is how a user would
 *      move an installed copy to another project.
 *   3. supabase.properties on the classpath, written at packaging time from
 *      .env.local. This is the one that makes a fresh install work with no
 *      setup screen.
 */
public record SupabaseConfig(String url, String anonKey) {

    private static final String URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
    private static final String ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
    private static final String RESOURCE = "/flow/study/sync/supabase.properties";

    /** True when there is something to talk to. */
    public boolean configured() {
        return url != null && !url.isBlank() && anonKey != null && !anonKey.isBlank();
    }

    public String restUrl() {
        return trimTrailingSlash(url) + "/rest/v1";
    }

    public String authUrl() {
        return trimTrailingSlash(url) + "/auth/v1";
    }

    private static String trimTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    public static SupabaseConfig resolve(Path dataDirectory) {
        String url = System.getenv(URL_KEY);
        String anon = System.getenv(ANON_KEY);
        if (present(url) && present(anon)) return new SupabaseConfig(url, anon);

        SupabaseConfig fromDisk = fromFile(dataDirectory.resolve("supabase.properties"));
        if (fromDisk != null && fromDisk.configured()) return fromDisk;

        SupabaseConfig bundled = fromClasspath();
        if (bundled != null && bundled.configured()) return bundled;

        return new SupabaseConfig(null, null);
    }

    private static boolean present(String value) {
        return value != null && !value.isBlank();
    }

    private static SupabaseConfig fromFile(Path path) {
        if (!Files.exists(path)) return null;
        Properties properties = new Properties();
        try (var in = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            properties.load(in);
        } catch (IOException e) {
            return null;
        }
        return read(properties);
    }

    private static SupabaseConfig fromClasspath() {
        try (InputStream in = SupabaseConfig.class.getResourceAsStream(RESOURCE)) {
            if (in == null) return null;
            Properties properties = new Properties();
            properties.load(in);
            return read(properties);
        } catch (IOException e) {
            return null;
        }
    }

    private static SupabaseConfig read(Properties properties) {
        return new SupabaseConfig(
                properties.getProperty(URL_KEY, properties.getProperty("url")),
                properties.getProperty(ANON_KEY, properties.getProperty("anonKey")));
    }
}
