/*
 * The brain. Depends on nothing.
 *
 * Jackson is a TEST dependency only: it reads the shared parity fixtures.
 * Nothing in src/main may import it, because the whole point of this module
 * is that the planner can be reasoned about without a serialiser, a database
 * or a clock it does not control.
 */
dependencies {
    testImplementation("com.fasterxml.jackson.core:jackson-databind:2.18.2")
}
