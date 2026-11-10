package flow.study.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * The cloud, over its REST API.
 *
 * This is the decision the whole design rests on. Going through PostgREST with
 * her own JWT means every policy in supabase/migrations still applies, exactly
 * as it does to the website: reads shared with a support account, writes
 * owner-only, her role not writable, the activity log append-only. A JDBC
 * connection straight to Postgres would have needed the database password and
 * would have bypassed all of it -- the desktop app would have been more
 * privileged than the browser, which is precisely backwards.
 *
 * So a rejection here is not a bug to work around. It is the schema doing its
 * job, and it gets reported rather than retried into submission.
 */
public final class PostgrestClient implements CloudApi {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Duration TIMEOUT = Duration.ofSeconds(30);

    private final SupabaseConfig config;
    private final HttpClient http;
    private final TokenSource tokens;

    /** Supplies a live access token, refreshing it when it has aged out. */
    public interface TokenSource {
        String accessToken();
    }

    public PostgrestClient(SupabaseConfig config, HttpClient http, TokenSource tokens) {
        this.config = config;
        this.http = http;
        this.tokens = tokens;
    }

    /**
     * A request the cloud refused, with the status that says why.
     *
     * The status matters to the caller: 401 means the token aged out and the
     * intent should be retried, while 403 and 409 mean the cloud will refuse
     * it every time and it should be shown to her instead of looped on.
     */
    public static final class RestException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        private final int status;

        public RestException(int status, String message) {
            super(message);
            this.status = status;
        }

        public int status() {
            return status;
        }

        /** True when retrying could plausibly work. */
        public boolean transientFailure() {
            return status == 0 || status == 401 || status == 408 || status == 429
                    || status >= 500;
        }

        /**
         * True when the cloud will never accept this intent.
         *
         * 403 is RLS refusing; 409 is a constraint; 404 and 400 mean the row
         * or the shape is wrong. All four need a decision from her, not
         * another attempt.
         */
        public boolean permanentRefusal() {
            return status == 400 || status == 403 || status == 404 || status == 409
                    || status == 422;
        }
    }

    /** Every row of a table she can see, as the pull needs it. */
    @Override
    public JsonNode selectAll(String table) {
        return send(request(table + "?select=*").GET().build());
    }

    /** Rows newer than a watermark, for the one table that is unbounded. */
    @Override
    public JsonNode selectSince(String table, String column, String watermark) {
        String query = watermark == null
                ? table + "?select=*&order=" + column + ".asc"
                : table + "?select=*&" + column + "=gt." + watermark
                        + "&order=" + column + ".asc";
        return send(request(query).GET().build());
    }

    @Override
    public JsonNode insert(String table, Map<String, Object> row) {
        return send(request(table)
                .header("Prefer", "return=representation")
                .POST(body(row))
                .build());
    }

    @Override
    public JsonNode update(String table, String id, Map<String, Object> fields) {
        return send(request(table + "?id=eq." + id)
                .header("Prefer", "return=representation")
                .method("PATCH", body(fields))
                .build());
    }

    @Override
    public void delete(String table, String id) {
        send(request(table + "?id=eq." + id).DELETE().build());
    }

    /**
     * A cheap authenticated round trip, to decide whether there is a network.
     *
     * Asks for a single row rather than pinging the host: a reachable host
     * with a paused project, an expired token or no DNS for the REST path are
     * all "cannot sync", and only a real request distinguishes that from a
     * working connection. InetAddress.isReachable would call all four online.
     */
    @Override
    public boolean reachable() {
        try {
            send(request("profiles?select=id&limit=1").GET().build());
            return true;
        } catch (RestException e) {
            // A refusal still proves the cloud answered. Only a transport
            // failure, which arrives as status 0, means genuinely offline.
            return e.status() != 0;
        }
    }

    private HttpRequest.Builder request(String query) {
        return HttpRequest.newBuilder()
                .uri(URI.create(config.restUrl() + "/" + query))
                .timeout(TIMEOUT)
                .header("apikey", config.anonKey())
                .header("Authorization", "Bearer " + tokens.accessToken())
                .header("Content-Type", "application/json")
                .header("Accept", "application/json");
    }

    private static HttpRequest.BodyPublisher body(Map<String, Object> value) {
        try {
            return HttpRequest.BodyPublishers.ofString(
                    JSON.writeValueAsString(value), StandardCharsets.UTF_8);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new RestException(400, "Cannot serialise that change: " + e.getMessage());
        }
    }

    private JsonNode send(HttpRequest request) {
        try {
            HttpResponse<String> response =
                    http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));

            if (response.statusCode() / 100 != 2) {
                throw new RestException(response.statusCode(), describe(response.body()));
            }

            String body = response.body();
            return body == null || body.isBlank()
                    ? JSON.createArrayNode()
                    : JSON.readTree(body);
        } catch (IOException e) {
            // Status 0 is reserved here for "never reached the cloud", which
            // is the one failure that is purely about the network.
            throw new RestException(0, "No connection: " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RestException(0, "Sync was interrupted.");
        }
    }

    /**
     * PostgREST error bodies carry the Postgres message, hint and constraint
     * name. The message is the useful half; the rest is for a log.
     */
    private static String describe(String body) {
        if (body == null || body.isBlank()) return "The cloud refused the change.";
        try {
            JsonNode node = JSON.readTree(body);
            StringBuilder sb = new StringBuilder();
            if (node.hasNonNull("message")) sb.append(node.get("message").asText());
            if (node.hasNonNull("details")) sb.append(" ").append(node.get("details").asText());
            if (node.hasNonNull("hint")) sb.append(" ").append(node.get("hint").asText());
            if (sb.length() > 0) return sb.toString().trim();
        } catch (IOException ignored) {
            // Not JSON; the raw body is the best description available.
        }
        return body.length() > 500 ? body.substring(0, 500) : body;
    }
}
