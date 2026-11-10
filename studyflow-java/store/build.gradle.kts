/*
 * The encrypted local copy.
 *
 * H2 in file mode with AES encryption, rather than SQLite + SQLCipher: pure
 * Java, so there is no per-platform native library to ship alongside the app.
 * Bouncy Castle supplies Argon2id in pure Java for the same reason.
 */
dependencies {
    implementation(project(":domain"))
    implementation("com.h2database:h2:2.3.232")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.18.2")
    implementation("org.bouncycastle:bcprov-jdk18on:1.79")
}
