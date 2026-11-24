package flow.study.ui.kit;

import javafx.animation.FadeTransition;
import javafx.animation.Interpolator;
import javafx.animation.KeyFrame;
import javafx.animation.KeyValue;
import javafx.animation.Timeline;
import javafx.scene.Node;
import javafx.util.Duration;

/**
 * The part of a hover that CSS here cannot do.
 *
 * ---------------------------------------------------------------------------
 * JavaFX stylesheets have `:hover`, `:pressed` and `:focused`, and no
 * `transition`. So a colour change lands on the next frame, whole, where the
 * website eases it over 150ms. Identical colours, and it still reads cheaper.
 *
 * The fix is not to animate colour in Java -- that means owning every state a
 * stylesheet already owns. It is to animate the one property CSS is not
 * setting. A row that lifts a pixel over 120ms while its background snaps
 * reads as a transition, because the eye attributes the easing to the whole
 * control.
 *
 * Confined to nav rows, buttons and cards. Not list items: forty animated
 * rows in a homework list is how a desktop app starts feeling slow, which is
 * the opposite of the thing being bought here.
 * ---------------------------------------------------------------------------
 */
public final class Motion {

    /** Matches the website's `transition-colors` duration. */
    private static final Duration QUICK = Duration.millis(120);

    private static final Duration PRESS = Duration.millis(70);

    /**
     * Off means instant, everywhere.
     *
     * A field rather than an OS lookup: JavaFX exposes no reduced-motion
     * preference, and a native call for one checkbox is not worth its own
     * platform branch. Settings owns this.
     */
    private static volatile boolean reduced;

    private Motion() {
    }

    public static void setReduced(boolean value) {
        reduced = value;
    }

    public static boolean reduced() {
        return reduced;
    }

    /**
     * Lift on hover, settle on exit.
     *
     * One pixel. Two reads as a button trying to leave the window, and zero
     * is what we already had.
     */
    public static <T extends Node> T hover(T node) {
        return hover(node, -1);
    }

    public static <T extends Node> T hover(T node, double lift) {
        node.setOnMouseEntered(event -> translateTo(node, lift));
        node.setOnMouseExited(event -> translateTo(node, 0));
        return node;
    }

    /** Push in on press. Pairs with {@link #hover}: the lift reverses. */
    public static <T extends Node> T press(T node) {
        node.addEventHandler(javafx.scene.input.MouseEvent.MOUSE_PRESSED,
                event -> translateTo(node, 1, PRESS));
        node.addEventHandler(javafx.scene.input.MouseEvent.MOUSE_RELEASED,
                event -> translateTo(node, node.isHover() ? -1 : 0, PRESS));
        return node;
    }

    /** Both, which is what every clickable thing in this app wants. */
    public static <T extends Node> T interactive(T node) {
        return press(hover(node));
    }

    /**
     * The website's staggered entrance, for a screen being shown.
     *
     * Index, not delay, so callers do not each invent their own rhythm.
     */
    public static <T extends Node> T reveal(T node, int index) {
        if (reduced) return node;

        node.setOpacity(0);
        node.setTranslateY(6);

        Timeline timeline = new Timeline(
                new KeyFrame(Duration.millis(index * 45L)),
                new KeyFrame(Duration.millis(index * 45L + 260),
                        new KeyValue(node.opacityProperty(), 1, Interpolator.EASE_OUT),
                        new KeyValue(node.translateYProperty(), 0, Interpolator.EASE_OUT)));
        timeline.play();
        return node;
    }

    /** A panel appearing in place, with nothing to stagger against. */
    public static <T extends Node> T fadeIn(T node) {
        if (reduced) return node;

        FadeTransition fade = new FadeTransition(Duration.millis(180), node);
        fade.setFromValue(0);
        fade.setToValue(1);
        fade.setInterpolator(Interpolator.EASE_OUT);
        fade.play();
        return node;
    }

    private static void translateTo(Node node, double y) {
        translateTo(node, y, QUICK);
    }

    private static void translateTo(Node node, double y, Duration over) {
        if (reduced) {
            node.setTranslateY(y);
            return;
        }
        new Timeline(new KeyFrame(over,
                new KeyValue(node.translateYProperty(), y, Interpolator.EASE_OUT))).play();
    }
}
