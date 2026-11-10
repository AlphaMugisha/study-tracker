package flow.study.ui.view;

import flow.study.domain.model.HelpStatus;
import flow.study.domain.model.Subject;
import flow.study.store.SupportStore;
import flow.study.ui.AppContext;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.CheckBox;
import javafx.scene.control.ComboBox;
import javafx.scene.control.TextField;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;

import java.util.List;

/**
 * Things she does not understand.
 *
 * In the nav rather than hidden under Settings, because a page you have to go
 * looking for is a page nobody uses -- and the whole value of this list is
 * that writing something down is easier than saying it out loud.
 *
 * One field, one optional subject, no required choices. Anything more to fill
 * in and it stops getting used, which is the only way this feature fails.
 */
public final class StuckOnView {

    private final AppContext context;
    private final SupportStore support;
    private final VBox body = new VBox(16);
    private final VBox list = new VBox(10);

    public StuckOnView(AppContext context) {
        this.context = context;
        this.support = context.support();

        body.setPadding(Ui.PAGE_PADDING);
        body.getChildren().addAll(Ui.pageTitle("Stuck on"), addForm(), list);
        refresh();
    }

    public Node root() {
        return Ui.page(body);
    }

    private Node addForm() {
        TextField topic = new TextField();
        topic.setPromptText("What is not making sense?");
        javafx.scene.layout.HBox.setHgrow(topic, Priority.ALWAYS);

        ComboBox<Subject> subject = new ComboBox<>();
        subject.getItems().add(null);
        subject.getItems().addAll(context.timetable().subjects());
        subject.setPromptText("Subject");
        subject.setConverter(new javafx.util.StringConverter<>() {
            @Override public String toString(Subject value) {
                return value == null ? "No subject" : value.name();
            }

            @Override public Subject fromString(String value) {
                return null;
            }
        });

        Button add = new Button("Add");
        add.getStyleClass().add("button-primary");
        add.setDefaultButton(true);

        Runnable submit = () -> {
            if (topic.getText().isBlank()) return;
            support.log(context.userId(), topic.getText().trim(),
                    subject.getValue() == null ? null : subject.getValue().id(), null);
            topic.clear();
            refresh();
        };

        add.setOnAction(event -> submit.run());
        topic.setOnAction(event -> submit.run());

        return Ui.card(
                Ui.sectionTitle("Write it down now, work it out later"),
                topic,
                Ui.row(subject, Ui.grow(), add));
    }

    private void refresh() {
        list.getChildren().clear();
        List<SupportStore.Entry> entries = support.entries();

        if (entries.isEmpty()) {
            list.getChildren().add(Ui.emptyState("Nothing on the list."));
            return;
        }

        VBox open = Ui.card(Ui.sectionTitle("Open"));
        VBox sorted = Ui.card(Ui.sectionTitle("Sorted"));

        for (SupportStore.Entry entry : entries) {
            (entry.open() ? open : sorted).getChildren().add(entryRow(entry));
        }

        if (open.getChildren().size() > 1) list.getChildren().add(open);
        if (sorted.getChildren().size() > 1) list.getChildren().add(sorted);
    }

    private Node entryRow(SupportStore.Entry entry) {
        CheckBox tick = new CheckBox();
        tick.setSelected(!entry.open());
        tick.setOnAction(event -> {
            support.setStatus(entry.row().id(),
                    tick.isSelected() ? HelpStatus.RESOLVED : HelpStatus.OPEN);
            refresh();
        });

        javafx.scene.control.Label topic = new javafx.scene.control.Label(entry.row().topic());
        topic.setWrapText(true);
        if (!entry.open()) topic.setStyle("-fx-strikethrough: true;");

        VBox lines = new VBox(2, topic);
        if (entry.subjectName() != null) {
            lines.getChildren().add(Ui.meta(entry.subjectName()));
        }

        return Ui.row(tick, lines, Ui.grow());
    }

}
