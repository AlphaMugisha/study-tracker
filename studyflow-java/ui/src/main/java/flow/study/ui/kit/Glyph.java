package flow.study.ui.kit;

import javafx.scene.Group;
import javafx.scene.Node;
import javafx.scene.layout.StackPane;

/**
 * An icon at a size, in a box that lays out.
 *
 * ---------------------------------------------------------------------------
 * {@link Icons} returns a {@link Group} of shapes on lucide's own 24x24
 * canvas. A Group has no layout bounds a parent can reason about and no
 * preferred size, so dropped straight into an HBox it either collides with
 * its neighbour or pushes it across.
 *
 * This wraps one in a fixed box and scales it. Scaling rather than redrawing
 * at the target size is deliberate: the stroke scales with the geometry, so a
 * 16px icon keeps lucide's proportion of weight to size instead of turning
 * into a 2px outline around a tiny shape.
 * ---------------------------------------------------------------------------
 */
public final class Glyph {

    private Glyph() {
    }

    /** The size icons are used at beside a label. */
    public static Node small(Node icon) {
        return sized(icon, 16, null);
    }

    /** The sidebar and button size. */
    public static Node medium(Node icon) {
        return sized(icon, 18, null);
    }

    public static Node sized(Node icon, double size, String styleClass) {
        double scale = size / Icons.BOX;
        icon.setScaleX(scale);
        icon.setScaleY(scale);

        StackPane box = new StackPane(icon);
        box.setMinSize(size, size);
        box.setPrefSize(size, size);
        box.setMaxSize(size, size);
        // The icon paints outside the box's own bounds once scaled from its
        // 24-unit canvas; nothing else is drawn there, so this is free.
        box.setMouseTransparent(true);
        box.getStyleClass().add("glyph");
        if (styleClass != null) box.getStyleClass().add(styleClass);
        return box;
    }
}
