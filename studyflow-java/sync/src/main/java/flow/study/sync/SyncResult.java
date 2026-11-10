package flow.study.sync;

import java.time.Instant;
import java.util.List;

/**
 * What one sync did, in terms she can be shown.
 *
 * Rejections are first-class rather than a count. "7 changes sent" is a
 * status; "1 change was refused, here is which one and why" is the only
 * honest thing to say about an intent the cloud will never accept, and
 * swallowing it would leave her believing she made a change she did not.
 */
public record SyncResult(
        Outcome outcome,
        int sent,
        int rejected,
        int stillPending,
        int pulled,
        Instant at,
        /** Empty unless something was refused. */
        List<Refusal> refusals,
        /** Set when the whole sync could not start. */
        String message) {

    public enum Outcome {
        /** Everything went up and the local copy was refreshed. */
        SYNCED,
        /** Nothing to send and nothing new to pull. */
        UP_TO_DATE,
        /** No network. Not a failure -- the expected state most evenings. */
        OFFLINE,
        /** The refresh token is gone or revoked; she has to sign in again. */
        SIGN_IN_NEEDED,
        /** Sent what it could; at least one intent was refused. */
        PARTIAL,
        /** Could not sync at all, for a reason worth showing. */
        FAILED
    }

    /** @param reason the cloud message, kept verbatim so it is not re-guessed */
    public record Refusal(long seq, String entityType, String entityId,
                          String kind, String reason) {
    }

    public static SyncResult offline() {
        return new SyncResult(Outcome.OFFLINE, 0, 0, 0, 0, Instant.now(), List.of(), null);
    }

    public static SyncResult signInNeeded() {
        return new SyncResult(Outcome.SIGN_IN_NEEDED, 0, 0, 0, 0, Instant.now(), List.of(),
                "Your saved session has expired. Sign in again when you are online.");
    }

    public static SyncResult failed(String message) {
        return new SyncResult(Outcome.FAILED, 0, 0, 0, 0, Instant.now(), List.of(), message);
    }

    /** One line for the header pill. */
    public String summary() {
        return switch (outcome) {
            case OFFLINE -> "Offline";
            case SIGN_IN_NEEDED -> "Sign in needed";
            case FAILED -> "Sync failed";
            case UP_TO_DATE -> "Up to date";
            case SYNCED -> sent == 0
                    ? "Up to date"
                    : sent + (sent == 1 ? " change sent" : " changes sent");
            case PARTIAL -> rejected + (rejected == 1 ? " change refused" : " changes refused");
        };
    }
}
