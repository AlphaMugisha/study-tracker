package flow.study.ui.kit;

import javafx.scene.control.Label;

/**
 * The website's type scale.
 *
 * ---------------------------------------------------------------------------
 * Six roles, and the hierarchy between them is the point. The eyebrow is the
 * smallest thing on a page and the display heading is the largest, and the
 * gap between them is what tells somebody where they are before they have
 * read a word.
 *
 * The desktop app had none of this: every heading was 23px bold and every
 * screen therefore looked like a form. These sizes are the web ones.
 *
 * Sizes live in CSS, not here. A method that returns a Label with a style
 * class is a name for a role; a method that sets a font size is a second
 * stylesheet in Java.
 * ---------------------------------------------------------------------------
 */
public final class Type {

    private Type() {
    }

    /**
     * The small capitalised line above a heading.
     *
     * "TUESDAY 24 NOVEMBER". It carries the context so the heading beneath it
     * can be short, which is the only reason a heading that short works.
     */
    public static Label eyebrow(String text) {
        return styled(text, "eyebrow");
    }

    /** The oversized heading a page opens with. "Good morning, Alpha." */
    public static Label display(String text) {
        Label label = styled(text, "display");
        label.setWrapText(true);
        return label;
    }

    /** A page heading where a display heading would be too loud. */
    public static Label pageTitle(String text) {
        return styled(text, "page-title");
    }

    /** The heading on a block within a page. */
    public static Label sectionTitle(String text) {
        return styled(text, "section-title");
    }

    /** Running text. Wraps, because prose that does not wrap is not prose. */
    public static Label body(String text) {
        Label label = styled(text, "body");
        label.setWrapText(true);
        return label;
    }

    /** The quiet line under something: a room, a teacher, a timestamp. */
    public static Label meta(String text) {
        return styled(text, "meta");
    }

    /** A number meant to be read as a number. Tabular, in Geist Mono. */
    public static Label numeric(String text) {
        return styled(text, "numeric");
    }

    /**
     * The big number on a stat tile.
     *
     * Separate from {@link #numeric} because it is a different job: that one
     * is a time in a row of times, this one is the whole point of its card.
     */
    public static Label figure(String text) {
        return styled(text, "figure");
    }

    private static Label styled(String text, String styleClass) {
        Label label = new Label(text);
        label.getStyleClass().add(styleClass);
        return label;
    }
}
