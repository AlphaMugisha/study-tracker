package flow.study.ui.view;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressIndicator;
import javafx.scene.control.ScrollPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;

/**
 * The handful of shapes every page is built from.
 *
 * Deliberately small. These exist so that a card, a page title and an empty
 * state look the same on all six screens without each one restating the
 * padding, and so the style class names live in one place next to the
 * stylesheet they refer to.
 */
public final class Ui {
    private Ui() {}

    public static final Insets PAGE_PADDING = new Insets(24, 28, 28, 28);

    public static Label pageTitle(String text) {
        Label label = new Label(text);
        label.getStyleClass().add("page-title");
        return label;
    }

    public static Label sectionTitle(String text) {
        Label label = new Label(text);
        label.getStyleClass().add("section-title");
        return label;
    }

    public static Label detail(String text) {
        Label label = new Label(text == null ? "" : text);
        label.getStyleClass().add("detail");
        label.setWrapText(true);
        return label;
    }

    public static Label meta(String text) {
        Label label = new Label(text == null ? "" : text);
        label.getStyleClass().add("meta");
        label.setWrapText(true);
        return label;
    }

    public static Label numeric(String text) {
        Label label = new Label(text);
        label.getStyleClass().addAll("detail", "numeric");
        return label;
    }

    public static Label badge(String text, String modifier) {
        Label label = new Label(text);
        label.getStyleClass().setAll("badge", modifier);
        return label;
    }

    /**
     * An empty state is a non-event, and is set as one.
     *
     * The same reasoning as the unknown headline: an app that shouts about
     * having nothing to show is worse than one that says so quietly.
     */
    public static Label emptyState(String text) {
        Label label = new Label(text);
        label.getStyleClass().add("empty-state");
        label.setWrapText(true);
        return label;
    }

    /** A small indeterminate spinner, sized to sit on a line of text. */
    public static ProgressIndicator spinner() {
        ProgressIndicator spinner = new ProgressIndicator();
        spinner.setPrefSize(15, 15);
        spinner.setMinSize(15, 15);
        spinner.setMaxSize(15, 15);
        return spinner;
    }

    /**
     * Still loading, which is NOT the same as empty.
     *
     * "Nothing written down yet" before the first pull has landed is the app
     * claiming something it does not know -- the same mistake the presence
     * wording exists to avoid. An empty list and an unanswered question look
     * identical on screen unless they are deliberately made to differ, so
     * every list that can be shown before its data arrives uses this instead.
     */
    public static Node loadingState(String text) {
        HBox box = new HBox(10, spinner(), emptyState(text));
        box.setAlignment(Pos.CENTER_LEFT);
        box.setPadding(new Insets(16, 0, 16, 0));
        return box;
    }

    public static VBox card(Node... children) {
        VBox box = new VBox(10, children);
        box.getStyleClass().add("card");
        return box;
    }

    public static VBox card(String modifier, Node... children) {
        VBox box = card(children);
        box.getStyleClass().add(modifier);
        return box;
    }

    public static Region grow() {
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        return spacer;
    }

    public static HBox row(Node... children) {
        HBox box = new HBox(10, children);
        box.setAlignment(Pos.CENTER_LEFT);
        return box;
    }

    /** A page body that scrolls vertically and never horizontally. */
    public static ScrollPane page(Node body) {
        ScrollPane scroll = new ScrollPane(body);
        scroll.setFitToWidth(true);
        scroll.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        scroll.getStyleClass().add("scroll-pane");
        return scroll;
    }

    public static VBox column(Node... children) {
        VBox box = new VBox(16, children);
        box.setPadding(PAGE_PADDING);
        return box;
    }

    /** The style modifier for a presence tone, so the mapping lives in one place. */
    public static String toneClass(flow.study.domain.presence.Presence.Tone tone) {
        return switch (tone) {
            case LESSON -> "card-lesson";
            case BRAND -> "card-brand";
            case REVISE -> "card-revise";
            case PAUSE -> "card-pause";
            case MUTED -> "card";
        };
    }
}
