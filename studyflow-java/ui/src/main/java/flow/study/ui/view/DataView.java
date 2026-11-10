package flow.study.ui.view;

/**
 * A screen that shows rows rather than the clock.
 *
 * These need telling two things the ticking views do not: that the rows
 * underneath them have changed, and that a sync is in flight. The second
 * matters because an empty list and a list that has not arrived yet look
 * identical on screen, and only one of them is a fact.
 */
public interface DataView extends Screen {

    /** Re-read from the local copy. Called after a pull replaces it. */
    void refresh();

    /**
     * Whether a sync is running right now.
     *
     * The view decides what to do with it. The rule everywhere is the same:
     * if there is nothing to show AND a sync is in flight, say so rather than
     * claiming the list is empty -- the app does not know yet.
     */
    void setSyncing(boolean syncing);
}
