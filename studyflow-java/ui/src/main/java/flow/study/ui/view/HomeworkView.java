package flow.study.ui.view;

import flow.study.domain.model.Subject;
import flow.study.domain.model.TaskPriority;
import flow.study.domain.model.TaskStatus;
import flow.study.domain.tasks.AssignmentView;
import flow.study.domain.tasks.TaskOrdering;
import flow.study.domain.text.Display;
import flow.study.ui.AppContext;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.CheckBox;
import javafx.scene.control.ComboBox;
import javafx.scene.control.DatePicker;
import javafx.scene.control.Label;
import javafx.scene.control.Spinner;
import javafx.scene.control.SpinnerValueFactory;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Homework, and the one thing she can do at school.
 *
 * Writing a task down is the only write school mode allows, which is why this
 * screen is reachable during a lesson and the others are not: the moment a
 * teacher sets homework is the moment it gets forgotten.
 *
 * The grouping and the order come from TaskOrdering -- the same comparator the
 * evening planner uses, so the top of this list is the top of the plan. A
 * second sort here would let the two disagree about what is most urgent.
 */
public final class HomeworkView implements DataView {

    private final AppContext context;
    private final VBox body = new VBox(16);
    private final VBox list = new VBox(10);
    private final Label status = new Label();
    private boolean syncing;

    public HomeworkView(AppContext context) {
        this.context = context;
        body.setPadding(Ui.PAGE_PADDING);
        status.getStyleClass().add("meta");

        body.getChildren().addAll(
                Ui.row(Ui.pageTitle("Homework"), Ui.grow()),
                addForm(),
                status,
                list);

        refresh();
    }

    @Override
    public Node root() {
        return Ui.page(body);
    }

    @Override
    public void setSyncing(boolean syncing) {
        this.syncing = syncing;
        refresh();
    }

    // -----------------------------------------------------------------------
    // Writing it down
    // -----------------------------------------------------------------------

    /**
     * Inline rather than a dialog.
     *
     * A modal is one more tap and one more thing to dismiss, and this form is
     * used standing up in a corridor between lessons. Everything but the title
     * has a working default, so the fast path is type and press Enter.
     */
    private Node addForm() {
        TextField title = new TextField();
        title.setPromptText("What were you given?");
        HBox.setHgrow(title, javafx.scene.layout.Priority.ALWAYS);

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

        DatePicker due = new DatePicker(LocalDate.now(context.zone()).plusDays(1));
        due.setPrefWidth(150);

        Spinner<Integer> minutes = new Spinner<>(
                new SpinnerValueFactory.IntegerSpinnerValueFactory(5, 600, 30, 5));
        minutes.setPrefWidth(95);
        minutes.setEditable(true);

        ComboBox<TaskPriority> priority = new ComboBox<>();
        priority.getItems().addAll(TaskPriority.values());
        priority.setValue(TaskPriority.MEDIUM);
        priority.setPrefWidth(110);

        Button add = new Button("Add");
        add.getStyleClass().add("button-primary");
        add.setDefaultButton(true);

        Runnable submit = () -> {
            if (title.getText().isBlank()) {
                say("Give the task a title.");
                return;
            }
            if (due.getValue() == null) {
                say("Pick a due date.");
                return;
            }

            context.tasks().createAssignment(
                    context.userId(),
                    title.getText().trim(),
                    subject.getValue() == null ? null : subject.getValue().id(),
                    null,
                    due.getValue(),
                    null,
                    priority.getValue(),
                    minutes.getValue());

            title.clear();
            refresh();
        };

        add.setOnAction(event -> submit.run());
        title.setOnAction(event -> submit.run());

        VBox card = Ui.card(
                Ui.sectionTitle("Write it down"),
                title,
                Ui.row(subject, due, minutes, priority, Ui.grow(), add));
        return card;
    }

    private void say(String message) {
        status.setText(message);
    }

    // -----------------------------------------------------------------------
    // The list
    // -----------------------------------------------------------------------

    @Override
    public void refresh() {
        list.getChildren().clear();

        Instant now = Instant.now();
        List<AssignmentView> all = context.tasks().assignments(context.zone(), now);
        TaskOrdering.Groups groups = TaskOrdering.group(all, context.zone(), now);

        if (all.isEmpty()) {
            /*
             * Nothing to show is not the same as nothing to do. Before the
             * first pull has landed, "nothing written down yet" is the app
             * asserting something it has not been told, and she would believe
             * it -- so while a sync is running it says what is actually true.
             */
            list.getChildren().add(syncing
                    ? Ui.loadingState("Getting your homework...")
                    : Ui.emptyState("Nothing written down yet."));
            say("");
            return;
        }

        int waiting = context.outbox().pendingCount();
        say(waiting == 0 ? "" : waiting == 1
                ? "1 change waiting to be sent."
                : waiting + " changes waiting to be sent.");

        section("Overdue", groups.overdue());
        section("Due soon", groups.dueSoon());
        section("Upcoming", groups.upcoming());
        section("Done", groups.completed());
    }

    private void section(String name, List<AssignmentView> tasks) {
        if (tasks.isEmpty()) return;

        VBox card = Ui.card(Ui.sectionTitle(name + "  (" + tasks.size() + ")"));
        for (AssignmentView task : tasks) card.getChildren().add(taskRow(task));
        list.getChildren().add(card);
    }

    private Node taskRow(AssignmentView task) {
        CheckBox tick = new CheckBox();
        tick.setSelected(task.done());
        tick.setOnAction(event -> {
            context.tasks().setAssignmentStatus(task.id(),
                    tick.isSelected() ? TaskStatus.COMPLETED : TaskStatus.NOT_STARTED);
            refresh();
        });

        Label title = new Label(task.title());
        title.setWrapText(true);
        if (task.done()) title.setStyle("-fx-strikethrough: true;");

        VBox lines = new VBox(2, title);

        String subject = task.subjectName();
        String dueLabel = task.overdue()
                ? Display.overdueLabel(task.dueDate(), LocalDate.now(context.zone()))
                : "Due " + Display.dueLabel(task.dueDate(), task.row().dueTime(),
                        LocalDate.now(context.zone()));

        lines.getChildren().add(Ui.meta(
                (subject == null ? "" : subject + " · ") + dueLabel
                        + " · " + task.estimatedMinutes() + " min"));

        HBox row = Ui.row(tick, lines, Ui.grow());
        row.setAlignment(Pos.CENTER_LEFT);

        if (task.overdue()) row.getChildren().add(Ui.badge("Overdue", "badge-overdue"));
        else if (task.priority() == TaskPriority.HIGH && !task.done()) {
            row.getChildren().add(Ui.badge("High", "badge-pause"));
        }

        Button remove = new Button("Delete");
        remove.getStyleClass().add("button-quiet");
        remove.setOnAction(event -> {
            context.tasks().deleteAssignment(task.id());
            refresh();
        });
        row.getChildren().add(remove);

        return row;
    }
}
