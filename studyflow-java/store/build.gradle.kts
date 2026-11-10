/*
 * The local copy.
 *
 * H2 in file mode, rather than SQLite: pure Java, so there is no per-platform
 * native library to ship alongside the app for the one component that must
 * never fail to load.
 *
 * The file is not encrypted -- see StoreLocation for the operator decision
 * behind that, and for what it costs.
 */
dependencies {
    implementation(project(":domain"))
    implementation("com.h2database:h2:2.3.232")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.18.2")
}
