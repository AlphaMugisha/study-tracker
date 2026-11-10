package flow.study.domain.presence;

/**
 * What she SHOULD be doing right now.
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE CHANGING THE COPY.
 *
 * Every string produced here is an EXPECTATION derived from her timetable and
 * her own settings. It is not an observation. StudyFlow cannot see whether she
 * is in the room, awake, or holding a pen, and the wording must never suggest
 * otherwise. "Should be in class" is true and useful; "is in class" is a claim
 * the app has no basis for and would be believed.
 *
 * The distinction is the whole design. A parent gets two things side by side:
 * what the timetable EXPECTS (this module, derived) and when she was LAST
 * ACTIVE in the app (the activity log, observed). Those are different kinds of
 * fact and the interface keeps them apart, because the failure mode of merging
 * them is a parent confidently believing something the software never knew.
 * ---------------------------------------------------------------------------
 */
public record Presence(
        Kind kind,
        /** Short state, always phrased as expectation. */
        String headline,
        /** The specifics: subject, what is next, how long left. */
        String detail,
        /** Minutes until this state changes, when the timetable says. */
        Integer endsInMinutes,
        /**
         * 0 to 1 through the current lesson, or null when nothing is running.
         * "24 min left" alone does not say whether that is most of the lesson
         * or the tail of it.
         */
        Double progress,
        /**
         * False when this is the app admitting it does not know, rather than a
         * real status. The card sizes the headline off this: "Should be in
         * class" is the loudest thing on the page, "No timetable saved" is a
         * non-event and must not be set in the same display type.
         */
        boolean known,
        /** True while the school-day lock applies to her. */
        boolean atSchool,
        Tone tone,
        Icon icon) {

    public enum Kind {
        ASLEEP, GETTING_READY, HEADING_IN, IN_LESSON, AT_BREAK,
        HEADING_HOME, SETTLING, STUDY_TIME, FREE_EVENING, FREE_DAY, UNKNOWN
    }

    public enum Tone { LESSON, BRAND, REVISE, PAUSE, MUTED }

    public enum Icon { MOON, SUNRISE, WALK, BOOK, COFFEE, HOME, PENCIL, STAR }
}
