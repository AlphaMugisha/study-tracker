package flow.study.store;

import org.bouncycastle.crypto.generators.Argon2BytesGenerator;
import org.bouncycastle.crypto.params.Argon2Parameters;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Turning what she types into the key that opens the file.
 *
 * Argon2id through Bouncy Castle, which is pure Java -- the same reason H2 was
 * chosen over SQLite with SQLCipher. A native library would mean shipping a
 * different binary per platform for the one part of the app that must never
 * fail to load.
 *
 * Two outputs from one passphrase, derived with different salts so neither
 * reveals the other:
 *
 *   The KEY       unlocks the AES-encrypted database file. Never stored.
 *   The VERIFIER  is stored, and only answers "was that the right
 *                 passphrase". Without it, a typo surfaces as a corrupt
 *                 database rather than as a wrong password, which is the
 *                 difference between a confusing bug report and a retry.
 */
public final class Passphrase {
    private Passphrase() {}

    /*
     * Interactive parameters. This runs once, on a laptop, while someone
     * watches a spinner -- so it is tuned to take a noticeable fraction of a
     * second rather than to be cheap. 64 MB and three passes is the
     * second-tier recommendation from the Argon2 RFC, and is comfortable on a
     * machine that can also run JavaFX.
     */
    private static final int MEMORY_KB = 64 * 1024;
    private static final int ITERATIONS = 3;
    private static final int PARALLELISM = 1;
    private static final int KEY_BYTES = 32;

    /** Domain separation, so the file key and the verifier cannot coincide. */
    private static final byte[] KEY_CONTEXT = "studyflow.filekey".getBytes(StandardCharsets.UTF_8);
    private static final byte[] VERIFIER_CONTEXT =
            "studyflow.verifier".getBytes(StandardCharsets.UTF_8);

    private static final SecureRandom RANDOM = new SecureRandom();

    public static String newSalt() {
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        return Base64.getEncoder().encodeToString(salt);
    }

    /**
     * The AES key for the database file, as the hex string H2 wants.
     *
     * H2 takes the file password as text, so the derived bytes are hex-encoded
     * rather than passed raw: a byte array through a String would be mangled
     * by whatever charset the JDBC layer assumed.
     */
    public static String fileKey(char[] passphrase, String salt) {
        return hex(derive(passphrase, salt, KEY_CONTEXT));
    }

    /** Stored, and compared in constant time. */
    public static String verifier(char[] passphrase, String salt) {
        return Base64.getEncoder().encodeToString(derive(passphrase, salt, VERIFIER_CONTEXT));
    }

    public static boolean matches(char[] passphrase, String salt, String expectedVerifier) {
        if (salt == null || expectedVerifier == null) return false;
        byte[] actual = Base64.getDecoder().decode(verifier(passphrase, salt));
        byte[] expected = Base64.getDecoder().decode(expectedVerifier);
        // Constant time, so the comparison does not leak how much of a guess
        // was right.
        return MessageDigest.isEqual(actual, expected);
    }

    private static byte[] derive(char[] passphrase, String salt, byte[] context) {
        Argon2Parameters parameters = new Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
                .withVersion(Argon2Parameters.ARGON2_VERSION_13)
                .withIterations(ITERATIONS)
                .withMemoryAsKB(MEMORY_KB)
                .withParallelism(PARALLELISM)
                .withSalt(Base64.getDecoder().decode(salt))
                .withAdditional(context)
                .build();

        Argon2BytesGenerator generator = new Argon2BytesGenerator();
        generator.init(parameters);

        byte[] out = new byte[KEY_BYTES];
        generator.generateBytes(passphrase, out);
        return out;
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
