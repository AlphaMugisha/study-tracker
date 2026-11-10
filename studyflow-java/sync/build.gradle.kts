/*
 * The cloud bridge. java.net.http is built in, so this is Jackson and
 * nothing else.
 */
dependencies {
    implementation(project(":domain"))
    implementation(project(":store"))
    implementation("com.fasterxml.jackson.core:jackson-databind:2.18.2")
}
