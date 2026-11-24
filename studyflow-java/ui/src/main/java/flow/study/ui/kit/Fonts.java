package flow.study.ui.kit;

import javafx.scene.text.Font;

import java.io.InputStream;

/**
 * Geist, the typeface the website is set in.
 *
 * ---------------------------------------------------------------------------
 * Not a lookalike. `node_modules/geist` ships real TrueType alongside the
 * woff2 the browser gets, and JavaFX loads TrueType, so the desktop app can
 * be set in the same metal rather than in whatever Segoe approximates it to.
 *
 * Static weights, not `Geist-Variable.ttf`. JavaFX's variable-font support is
 * not something to stake a design on, and four weights is what the type scale
 * actually uses.
 *
 * Missing fonts are not fatal. A build that lost its resources should still
 * open a readable window -- the family name falls back through the list in
 * theme.css to Segoe UI, which is the right failure.
 * ---------------------------------------------------------------------------
 */
public final class Fonts {

    /** The family name JavaFX will know these by. Must match theme.css. */
    public static final String SANS = "Geist";
    public static final String MONO = "Geist Mono";

    private static final String[] FILES = {
            "Geist-Regular.ttf",
            "Geist-Medium.ttf",
            "Geist-SemiBold.ttf",
            "Geist-Bold.ttf",
            "GeistMono-Regular.ttf",
            "GeistMono-Medium.ttf",
    };

    private static boolean loaded;

    private Fonts() {
    }

    /**
     * Register every weight with the JavaFX font system.
     *
     * Called once, before the first scene is built: a font loaded after a
     * label exists does not retrofit itself onto that label.
     */
    public static synchronized void load() {
        if (loaded) return;
        loaded = true;

        for (String file : FILES) {
            try (InputStream in = Fonts.class.getResourceAsStream("/flow/study/ui/font/" + file)) {
                if (in == null) continue;
                // Size here is irrelevant -- it registers the family, and
                // every actual size comes from CSS.
                Font.loadFont(in, 12);
            } catch (Exception ignored) {
                // See the class comment: a readable window beats no window.
            }
        }
    }
}
