package flow.study.sync;

import flow.study.store.ProfileStore;

import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;

/**
 * Holds the access token, and renews it without being asked.
 *
 * The access token lasts about an hour and lives only in memory -- it is never
 * written down, because a stored bearer token is a stored credential and the
 * refresh token already serves that purpose inside the encrypted file.
 *
 * {@link #accessToken()} is what PostgrestClient calls on every request, so it
 * has to be cheap when the token is still good and silent when it is not.
 */
public final class CloudSession implements PostgrestClient.TokenSource {

    private final GoTrueClient auth;
    private final ProfileStore profiles;

    private GoTrueClient.Session current;

    public CloudSession(GoTrueClient auth, ProfileStore profiles) {
        this.auth = auth;
        this.profiles = profiles;
    }

    /** A client with a short connect timeout, so being offline is quick to find out. */
    public static HttpClient httpClient() {
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                // Supabase answers with a redirect on some misconfigurations,
                // and following it silently would turn a setup error into a
                // confusing auth failure.
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    /**
     * First run: sign in with a password, and keep the refresh token.
     *
     * The password is not stored, and the array is the caller to clear. The
     * refresh token goes into the encrypted database, which is the only place
     * in this app where a long-lived credential is written.
     */
    public GoTrueClient.Session signIn(String email, char[] password) {
        GoTrueClient.Session session = auth.signIn(email, password);
        current = session;
        profiles.saveSession(new ProfileStore.Session(
                session.userId(), session.email(), session.refreshToken(), Instant.now()));
        return session;
    }

    /**
     * Restore from what the encrypted file remembers.
     *
     * Returns false when there is nothing saved or the refresh token has been
     * revoked. Throws only when the network failed, because those two need
     * opposite responses from the caller: one needs her to sign in, the other
     * needs waiting until there is a connection.
     */
    public boolean restore() {
        ProfileStore.Session saved = profiles.session();
        if (saved == null || saved.refreshToken() == null) return false;

        GoTrueClient.Session renewed = auth.refresh(saved.refreshToken());
        if (renewed == null) return false;

        current = renewed;
        profiles.saveSession(new ProfileStore.Session(
                renewed.userId() != null ? renewed.userId() : saved.userId(),
                renewed.email() != null ? renewed.email() : saved.email(),
                renewed.refreshToken(),
                Instant.now()));
        return true;
    }

    @Override
    public String accessToken() {
        if (current == null) {
            // No live token. Returning the anon key instead would make every
            // request look anonymous, and anon has no privileges on any
            // academic table -- so the failure would arrive as an empty
            // result rather than as "not signed in".
            throw new PostgrestClient.RestException(401, "Not signed in.");
        }

        if (current.expired(Instant.now())) {
            if (!restore()) {
                throw new PostgrestClient.RestException(401, "The session has expired.");
            }
        }
        return current.accessToken();
    }

    /** Whose copy this is, from whichever of memory or the file knows. */
    public String userId() {
        if (current != null && current.userId() != null) return current.userId();
        ProfileStore.Session saved = profiles.session();
        return saved == null ? null : saved.userId();
    }

    public String email() {
        if (current != null && current.email() != null) return current.email();
        ProfileStore.Session saved = profiles.session();
        return saved == null ? null : saved.email();
    }

    /** True once there is a token good enough to try a request with. */
    public boolean live() {
        return current != null && !current.expired(Instant.now());
    }
}
