package flow.study.ui.kit;

import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;

/**
 * Panels.
 *
 * ---------------------------------------------------------------------------
 * On a dark ground a drop shadow reads as mud, so elevation here is the same
 * thing the website does: a lighter surface plus a hairline border. That
 * decision is recorded in globals.css and the tokens are copied, not
 * re-derived -- a previous version of the web app passed every contrast check
 * and still rendered an invisible shell, because the page and the panels were
 * the same lightness apart.
 * ---------------------------------------------------------------------------
 */
public final class Cards {

    private Cards() {
    }

    /** The default panel. */
    public static VBox card(Node... children) {
        return card("card", children);
    }

    /** A panel with an extra style class: `card-problem`, `card-quiet`. */
    public static VBox card(String modifier, Node... children) {
        VBox box = new VBox(10, children);
        box.getStyleClass().addAll("card", modifier);
        return box;
    }

    /**
     * One number and what it counts. "LESSONS TODAY / 5".
     *
     * Three of these in a row is the first thing the dashboard says, and it
     * works because the number is enormous and the label is tiny. Equal
     * weighting would make it a table.
     */
    public static VBox statTile(String label, String value, String tone) {
        Label caption = Type.eyebrow(label);
        Label figure = Type.figure(value);
        if (tone != null) figure.getStyleClass().add(tone);

        VBox tile = new VBox(6, caption, figure);
        tile.getStyleClass().add("stat-tile");
        return tile;
    }

    /**
     * A row of stat tiles that share the width evenly.
     *
     * The ends are marked here rather than with a CSS `:first-child`, which
     * JavaFX stylesheets do not have. Without it the row has a square left
     * edge and no right border at all.
     */
    public static HBox stats(Node... tiles) {
        HBox row = new HBox(tiles);
        return layOutStats(row);
    }

    /**
     * The same, for a row that already holds its tiles.
     *
     * Views that re-render in place refill one HBox rather than building a
     * new one each tick; passing those children to {@link #stats} would
     * reparent them out of the row still on screen and leave it empty.
     */
    public static HBox layOutStats(HBox row) {
        row.getStyleClass().add("stat-row");
        var tiles = row.getChildren();
        for (int i = 0; i < tiles.size(); i++) {
            Node tile = tiles.get(i);
            HBox.setHgrow(tile, Priority.ALWAYS);
            if (tile instanceof Region region) region.setMaxWidth(Double.MAX_VALUE);
            tile.getStyleClass().removeAll("stat-tile-first", "stat-tile-last");
            if (i == 0) tile.getStyleClass().add("stat-tile-first");
            if (i == tiles.size() - 1) tile.getStyleClass().add("stat-tile-last");
        }
        return row;
    }

    /**
     * The gradient panel that opens a screen.
     *
     * Electric Blue into Mint, running through darker members of both hues so
     * white stays legible along the whole length -- the full-strength colours
     * are too light to carry white text, which is why this is not simply the
     * brand colour stretched.
     *
     * @param rest the calmer variant, used when the current thing is a break
     */
    public static VBox hero(boolean rest, Node... children) {
        VBox box = new VBox(12, children);
        box.getStyleClass().addAll("hero", rest ? "hero-rest" : "hero-work");
        return box;
    }

    /**
     * Nothing here yet, said in a way that is not an error.
     *
     * An icon, a headline and a sentence that says what would fill it. An
     * empty state that only says "no data" is a dead end.
     */
    public static VBox emptyState(Node icon, String headline, String body) {
        Label title = Type.sectionTitle(headline);
        Label detail = Type.body(body);
        detail.setMaxWidth(420);

        VBox box = new VBox(10);
        box.setAlignment(Pos.CENTER);
        box.getStyleClass().addAll("card", "empty-state");
        if (icon != null) {
            box.getChildren().add(Glyph.sized(icon, 28, "icon-empty"));
        }
        box.getChildren().addAll(title, detail);
        return box;
    }

    /** A labelled block within a page: heading, then content. */
    public static VBox block(String heading, Node... children) {
        VBox box = new VBox(12);
        box.getStyleClass().add("block");
        box.getChildren().add(Type.sectionTitle(heading));
        box.getChildren().addAll(children);
        return box;
    }
}
