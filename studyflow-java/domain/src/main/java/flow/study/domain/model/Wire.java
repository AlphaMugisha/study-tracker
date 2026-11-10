package flow.study.domain.model;

import java.util.Locale;

/**
 * Postgres speaks {@code snake_case}; Java enums shout. This is the one place
 * the two are reconciled.
 *
 * Every enum below carries its own {@code wire} string rather than relying on
 * {@code name().toLowerCase()}, because the mapping is not always mechanical
 * and a silent mismatch here would surface as a constraint violation on push,
 * hours later, with nothing pointing back at the cause.
 */
public final class Wire {
    private Wire() {}

    /** The wire form of a conventionally-named enum constant. */
    public static String of(Enum<?> value) {
        return value.name().toLowerCase(Locale.ROOT);
    }

    /**
     * Parse, or fail loudly.
     *
     * Deliberately not lenient: an unrecognised enum label means the cloud
     * schema has moved ahead of this build, and quietly substituting a default
     * would turn a migration we have not caught up with into wrong data on
     * the student's screen.
     */
    public static <E extends Enum<E>> E parse(Class<E> type, String wire) {
        if (wire == null) {
            throw new IllegalArgumentException("null is not a " + type.getSimpleName());
        }
        for (E candidate : type.getEnumConstants()) {
            if (((WireValued) candidate).wire().equals(wire)) return candidate;
        }
        throw new IllegalArgumentException(
                "unknown " + type.getSimpleName() + ": '" + wire + "'");
    }

    /** Implemented by every enum that crosses the wire. */
    public interface WireValued {
        String wire();
    }
}
