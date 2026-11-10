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
import java.time.Instant;
import java.util.Map;

/**
 * Signing in, and staying signed in.
 *
 * Two grants and nothing else. A password grant on the first run, which is the
 * only time she is asked; a refresh grant afterwards, which is what lets the
 * app sync silently when a connection comes back.
 *
 * Note what this does NOT do: verify anything offline. A JWT lasts an hour and
 * cannot be renewed without a network, so the offline gate is her passphrase
 * against the encrypted file -- see the store. Pretending a locally-checked
 * token was an authentication would be security theatre; the real boundary is
 * that the cloud refuses every request without a live token.
 */
public final class GoTrueClient {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Duration TIMEOUT = Duration.ofSeconds(20);

    private final SupabaseConfig config;
    private final HttpClient http;

    public GoTrueClient(SupabaseConfig config, HttpClient http) {
        this.config = config;
        this.http = http;
    }

    /**
     * @param accessToken  the bearer token, good for about an hour
     * @param refreshToken stored inside the encrypted file, good for much longer
     * @param expiresAt    when the access token stops working
     */
    public record Session(String userId, String email, String accessToken,
                          String refreshToken, Instant expiresAt) {

        /**
         * Treated as expired a minute early.
         *
         * A token that expires between the check and the request arriving is a
         * 401 in the middle of a push, which looks to the caller exactly like
         * being refused by RLS. The minute of slack costs nothing and removes
         * a confusing failure.
         */
        public boolean expired(Instant now) {
            return expiresAt == null || now.plusSeconds(60).isAfter(expiresAt);
        }
    }

    /** Wrong password, no network, project paused -- all reported, never swallowed. */
    public static final class AuthException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public AuthException(String message) {
            super(message);
        }

        public AuthException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    public Session signIn(String email, char[] password) {
        Map<String, Object> body = Map.of("email", email, "password", new String(password));
        JsonNode response = post("/token?grant_type=password", body,
                "That email and password did not sign in.");
        return readSession(response, email);
    }

    /**
     * Renew. Returns null when the refresh token itself has expired or been
     * revoked, which means she has to sign in again -- distinguished from a
     * network failure, which throws, because the two call for opposite
     * responses: one needs her, the other needs waiting.
     */
    public Session refresh(String refreshToken) {
        try {
            JsonNode response = post("/token?grant_type=refresh_token",
                    Map.of("refresh_token", refreshToken),
                    "Could not renew the session.");
            return readSession(response, null);
        } catch (AuthException e) {
            if (e.getMessage() != null && e.getMessage().contains("refresh")) return null;
            throw e;
        }
    }

    private Session readSession(JsonNode response, String fallbackEmail) {
        JsonNode user = response.path("user");
        String email = user.path("email").asText(fallbackEmail);
        long expiresIn = response.path("expires_in").asLong(3600);

        return new Session(
                user.path("id").asText(null),
                email,
                response.path("access_token").asText(null),
                response.path("refresh_token").asText(null),
                Instant.now().plusSeconds(expiresIn));
    }

    private JsonNode post(String path, Map<String, Object> body, String failureMessage) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(config.authUrl() + path))
                    .timeout(TIMEOUT)
                    .header("Content-Type", "application/json")
                    .header("apikey", config.anonKey())
                    .POST(HttpRequest.BodyPublishers.ofString(
                            JSON.writeValueAsString(body), StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response =
                    http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));

            if (response.statusCode() / 100 != 2) {
                throw new AuthException(failureMessage + " " + describe(response.body()));
            }
            return JSON.readTree(response.body());
        } catch (IOException e) {
            throw new AuthException("Could not reach Supabase: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AuthException("Sign-in was interrupted.", e);
        }
    }

    /**
     * Turn an error body into one readable sentence.
     *
     * GoTrue returns several shapes depending on which layer refused, and the
     * raw JSON on an unlock screen is noise. Falls back to the body itself
     * rather than to a generic message, because a surprising failure is worth
     * seeing verbatim.
     */
    private static String describe(String body) {
        if (body == null || body.isBlank()) return "";
        try {
            JsonNode node = JSON.readTree(body);
            for (String field : new String[] {"error_description", "msg", "message", "error"}) {
                if (node.hasNonNull(field)) return node.get(field).asText();
            }
        } catch (IOException ignored) {
            // Not JSON. The body below is the best available description.
        }
        return body.length() > 300 ? body.substring(0, 300) : body;
    }
}
