package flow.study.ui.kit;

import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;

/**
 * Things you click, and things that tell you something.
 *
 * ---------------------------------------------------------------------------
 * Every interactive control here gets {@link Motion#interactive}, so hover
 * and press behave the same way across the app rather than wherever somebody
 * remembered to add it. That consistency is most of what "feels designed"
 * means -- a product where three buttons respond three ways reads as three
 * products.
 * ---------------------------------------------------------------------------
 */
public final class Controls {

    private Controls() {
    }

    // -----------------------------------------------------------------------
    // Buttons
    // -----------------------------------------------------------------------

    /** The one thing this screen wants you to do. At most one per view. */
    public static Button primary(String text, Node icon) {
        return button(text, icon, "button-primary");
    }

    /** An action with a visible edge. The usual choice. */
    public static Button outline(String text, Node icon) {
        return button(text, icon, "button-outline");
    }

    /** An action that should not compete: Copy, Sync, Cancel. */
    public static Button quiet(String text, Node icon) {
        return button(text, icon, "button-quiet");
    }

    /** Destructive. Coral, and never the default button. */
    public static Button danger(String text, Node icon) {
        return button(text, icon, "button-danger");
    }

    private static Button button(String text, Node icon, String modifier) {
        Button button = new Button(text);
        button.getStyleClass().addAll("button", modifier);
        if (icon != null) button.setGraphic(Glyph.medium(icon));
        return Motion.interactive(button);
    }

    /** An icon on its own, with the name it would have had as its tooltip. */
    public static Button iconButton(Node icon, String accessibleName) {
        Button button = new Button();
        button.getStyleClass().addAll("button", "button-icon");
        button.setGraphic(Glyph.medium(icon));
        button.setAccessibleText(accessibleName);
        button.setTooltip(new javafx.scene.control.Tooltip(accessibleName));
        return Motion.interactive(button);
    }

    // -----------------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------------

    /**
     * One row of the sidebar: icon, label, and an active state.
     *
     * A Button rather than a styled Label because it has to be reachable by
     * keyboard and disableable during school hours, and reimplementing both
     * on a Label is how a nav stops being a nav for anybody not using a mouse.
     */
    public static Button navRow(String text, Node icon) {
        Button button = new Button(text);
        button.getStyleClass().add("nav-row");
        button.setGraphic(Glyph.medium(icon));
        button.setMaxWidth(Double.MAX_VALUE);
        button.setAlignment(Pos.CENTER_LEFT);
        return Motion.interactive(button);
    }

    /** Mark exactly one nav row as the one you are on. */
    public static void setActive(Button row, boolean active) {
        row.getStyleClass().remove("nav-row-active");
        if (active) row.getStyleClass().add("nav-row-active");
    }

    // -----------------------------------------------------------------------
    // Status
    // -----------------------------------------------------------------------

    /** The small rounded status chip in the header. */
    public static Label pill(String text, String modifier) {
        Label label = new Label(text);
        label.getStyleClass().setAll("pill", modifier);
        return label;
    }

    /**
     * A tag on a row: `badge-lesson`, `badge-revise`, `badge-pause`,
     * `badge-danger`.
     */
    public static Label badge(String text, String modifier) {
        Label label = new Label(text);
        label.getStyleClass().addAll("badge", modifier);
        return label;
    }

    // -----------------------------------------------------------------------
    // Layout
    // -----------------------------------------------------------------------

    /** A row where the first thing is pushed left and the rest sit right. */
    public static HBox row(Node... children) {
        HBox box = new HBox(10, children);
        box.setAlignment(Pos.CENTER_LEFT);
        return box;
    }

    /** The gap that pushes everything after it to the far edge. */
    public static Region spacer() {
        Region region = new Region();
        HBox.setHgrow(region, Priority.ALWAYS);
        return region;
    }

    /**
     * One line of a list: a time, a name, a detail, and actions.
     *
     * Not animated. Forty of these on the homework screen is exactly where
     * per-row motion stops being polish and starts being lag.
     */
    public static VBox listRow(Node... children) {
        VBox box = new VBox(4, children);
        box.getStyleClass().add("list-row");
        return box;
    }
}
