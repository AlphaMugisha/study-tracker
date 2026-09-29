"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ImageUp,
  Info,
  LayoutGrid,
  ListPlus,
  Plus,
  Rows3,
  Trash2,
  Upload,
} from "lucide-react";

import { Field, FormAlert, fieldA11yProps } from "@/components/auth/form-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { FormPendingOverlay } from "@/components/shared/pending-overlay";
import { Eyebrow, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  analyseTimetableAction,
  confirmTimetableAction,
  type AnalyseState,
  type ConfirmState,
} from "@/lib/actions/timetable-import";
import {
  MAX_UPLOAD_BYTES,
  SUPPORTED_MEDIA_TYPES,
  SUPPORTED_UPLOAD_LABEL,
  type ExtractedEntry,
  type TimetableScope,
} from "@/lib/timetable/import-constants";
import { parseTimetableLines, type ParsedLine } from "@/lib/timetable/parse-lines";
import { findClashes, normaliseTime, rowProblem } from "@/lib/timetable/review";
import { DAY_NAMES } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

/**
 * Upload a photo, check what was read, then save it.
 *
 * The review step is the point of this component, not a formality. What comes
 * back is a machine's reading of a photograph of a grid — usually right, and
 * wrong in ways that are invisible once saved, because a timetable is exactly
 * the kind of data nobody re-reads. So the rows it was unsure about are
 * highlighted, overlaps are called out before the database rejects them, and
 * every field is editable in place. Confirming is one click; confirming
 * without looking should feel like skipping something.
 */

const EMPTY_ANALYSE: AnalyseState = {};
const EMPTY_CONFIRM: ConfirmState = {};

/**
 * The two shapes a timetable photo comes in, in the words of the person
 * holding the photo rather than the words of the prompt that reads it.
 *
 * This is asked first and answered by looking at the picture, because it
 * decides both what the reader is told to do and whether a class name is
 * needed at all. Guessing it from the image was tempting and wrong: the two
 * failure modes are silent in opposite directions, and the person uploading
 * can tell them apart at a glance.
 */
const SCOPE_OPTIONS: Array<{
  value: TimetableScope;
  icon: typeof Rows3;
  label: string;
  detail: string;
}> = [
  {
    value: "single",
    icon: Rows3,
    label: "Just one class",
    detail: "Periods down the side, days across the top, and every lesson on it is hers.",
  },
  {
    value: "shared",
    icon: LayoutGrid,
    label: "Several classes at once",
    detail: "The whole year on one sheet, a block per class. You will name which block is hers.",
  },
];

/** What a row can be, in the words the form uses rather than the enum's. */
const ACTIVITY_KINDS: Array<{ value: ExtractedEntry["activityType"]; label: string }> = [
  { value: "class", label: "Lesson" },
  { value: "break", label: "Break or lunch" },
  { value: "study", label: "Study period" },
  { value: "free", label: "Free period" },
  { value: "other", label: "Something else" },
];

const WEEK = [1, 2, 3, 4, 5, 6, 7];

type Row = ExtractedEntry & { key: string };

/** The add-a-lesson form, which holds strings until it is good enough to add. */
type Draft = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  activityType: ExtractedEntry["activityType"];
  name: string;
  room: string;
  teacher: string;
};

const BLANK_DRAFT: Draft = {
  dayOfWeek: 1,
  startTime: "",
  endTime: "",
  activityType: "class",
  name: "",
  room: "",
  teacher: "",
};

export function ImportWizard({
  studentId,
  studentName,
  returnTo,
}: {
  /** Omitted when a student is uploading their own. */
  studentId?: string;
  studentName?: string;
  returnTo: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [scope, setScope] = useState<TimetableScope>("single");
  const [mode, setMode] = useState<"photo" | "typed">("photo");
  const [typed, setTyped] = useState("");
  const [typedProblems, setTypedProblems] = useState<ParsedLine[] | null>(null);
  // What the saved version will record about how it was produced.
  const [source, setSource] = useState<"image" | "pdf" | "manual">("image");
  const [draft, setDraft] = useState<Draft>(BLANK_DRAFT);
  const [draftError, setDraftError] = useState<string | null>(null);
  // Rows the person typed need keys that cannot collide with the numeric ones
  // the extraction handed out, and must not shift when a row above is deleted.
  const addedCount = useRef(0);
  const [name, setName] = useState("My timetable");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Judge the file here, in the browser, before it is ever posted.
   *
   * The server checks this too and always did — but a Server Action's body is
   * capped by the framework, and that cap is enforced before the action runs.
   * An oversized photo therefore never reached the code that would have said
   * "that image is 8.2MB"; the page crashed with "Body exceeded 1 MB limit"
   * instead, naming no file and suggesting nothing to do about it. Raising the
   * cap to match MAX_UPLOAD_BYTES only moves that crash to a bigger number, so
   * the size has to be refused before it is sent.
   */
  const chooseFile = (file: File | null) => {
    setFileName(file?.name ?? null);
    setSource(file?.type === "application/pdf" ? "pdf" : "image");

    if (!file) return setFileError(null);
    if (!SUPPORTED_MEDIA_TYPES.includes(file.type as never)) {
      return setFileError(`Use a ${SUPPORTED_UPLOAD_LABEL.replace(" or ", ", ")}.`);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return setFileError(
        `That file is ${(file.size / 1_000_000).toFixed(1)}MB, and the limit is ${
          MAX_UPLOAD_BYTES / 1_000_000
        }MB. A screenshot, or a smaller photo, will go through.`,
      );
    }
    setFileError(null);
  };

  const [analysis, analyse] = useActionState<AnalyseState, FormData>(
    async (prev, formData) => {
      const result = await analyseTimetableAction(prev, formData);
      if (result.result) {
        setRows(result.result.entries.map((e, i) => ({ ...e, key: `${i}` })));
        setName(
          result.result.className
            ? `${result.result.className} timetable`
            : "My timetable",
        );
      }
      return result;
    },
    EMPTY_ANALYSE,
  );

  const [confirmation, confirm] = useActionState<ConfirmState, FormData>(
    async (prev, formData) => {
      const result = await confirmTimetableAction(prev, formData);
      if (result.ok) router.push(returnTo);
      return result;
    },
    EMPTY_CONFIRM,
  );

  /**
   * Turn the pasted lines into rows, or say which ones could not be read.
   *
   * No server call: the parser is pure and runs here, so a list of forty
   * lessons becomes a review screen instantly rather than after a round trip
   * to a model that has nothing to add. It lands on exactly the same step two
   * as a photograph, which is the point — the editing, the clash check and
   * the confirmation are already there and already tested.
   */
  const useTypedLines = () => {
    const { entries, problems } = parseTimetableLines(typed);

    setTypedProblems(problems);
    // Rows are kept even when some lines failed: thirty-eight lessons plus a
    // list of the two that did not parse beats being sent back to the box.
    if (entries.length === 0) return;

    setSource("manual");
    setRows(entries.map((entry, i) => ({ ...entry, key: `typed-${i}` })));
    setName("My timetable");
  };

  const fieldErrors = analysis.fieldErrors ?? {};
  // What the browser found takes precedence: it describes the file sitting in
  // the input now, where the server's complaint describes the last one posted.
  const imageError = fileError ?? fieldErrors.image;

  // --- Step one -------------------------------------------------------------
  if (!rows) {
    return (
      <Surface inset="roomy" className="max-w-2xl">
        <Eyebrow tone="brand">Step 1 of 2</Eyebrow>
        <h2 className="mt-4 text-display font-semibold text-ink">
          {studentName ? `Upload ${studentName}'s timetable.` : "Upload your timetable."}
        </h2>
        <p className="mt-4 max-w-[52ch] text-body text-ink-muted">
          A photo, a screenshot or the school&apos;s PDF all work — or type the
          lessons out if there is no copy to hand. Nothing is saved until you
          have checked it.
        </p>

        {/*
          Two ways in, one review screen. The tabs are here rather than on
          separate pages because what follows them is identical: the same
          rows, the same editing, the same confirmation. A second page would
          have meant a second copy of all of it.
        */}
        <div
          role="tablist"
          aria-label="How to add the timetable"
          className="mt-7 inline-flex rounded-lg border border-border bg-surface-sunken p-1"
        >
          {(
            [
              ["photo", "Upload a photo", ImageUp],
              ["typed", "Type them out", ListPlus],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium",
                "transition-colors duration-200 ease-out-flat",
                mode === value
                  ? "bg-surface-raised text-ink"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {mode === "typed" ? (
          <TypedLines
            value={typed}
            onChange={(next) => {
              setTyped(next);
              setTypedProblems(null);
            }}
            problems={typedProblems}
            onUse={useTypedLines}
            returnTo={returnTo}
          />
        ) : null}

        <form
          action={analyse}
          className={cn("mt-9 grid gap-7", mode === "typed" && "hidden")}
          noValidate
        >
          {/*
            The read is the one thing here that takes long enough to look
            broken. Measured at twenty-odd seconds for a photograph and up to
            two minutes when the free tier is busy, which is well past the
            point where a disabled button stops being a reassurance.
          */}
          <FormPendingOverlay
            title="Reading the timetable"
            stages={[
              { after: 12, text: "A full week is a lot of cells. It reads them all before answering." },
              { after: 40, text: "Still going. A busy free tier adds a minute to this more often than not." },
              { after: 90, text: "Close to the limit now. If this gives up, it is the tier being busy — not your photo." },
            ]}
          />
          {studentId ? <input type="hidden" name="studentId" value={studentId} /> : null}
          {analysis.formError ? <FormAlert>{analysis.formError}</FormAlert> : null}

          {/*
            Asked before the file, because the answer changes what the next
            field is for. A class name is the whole job on a shared grid and
            a label on a single-class sheet, and a form that asks for it the
            same way in both cases teaches the wrong thing about it.
          */}
          <fieldset>
            <legend className="mb-2.5 text-[13px] font-medium text-ink">
              What does the timetable cover?
            </legend>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {SCOPE_OPTIONS.map((option) => {
                const active = scope === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors duration-200 ease-out-flat",
                      "focus-within:ring-2 focus-within:ring-brand/40",
                      active
                        ? "border-brand/55 bg-brand-soft"
                        : "border-border bg-surface-sunken hover:border-border-strong hover:bg-surface-raised",
                    )}
                  >
                    <input
                      type="radio"
                      name="scope"
                      value={option.value}
                      checked={active}
                      onChange={() => setScope(option.value)}
                      className="sr-only"
                    />
                    <option.icon
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        active ? "text-brand-ink" : "text-ink-subtle",
                      )}
                    />
                    <span>
                      <span
                        className={cn(
                          "block text-body font-medium",
                          active ? "text-brand-ink" : "text-ink",
                        )}
                      >
                        {option.label}
                      </span>
                      <span className="mt-1 block text-[0.85rem] leading-relaxed text-ink-subtle">
                        {option.detail}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/*
            The long explanation sits OUTSIDE the Field, not inside it. Field
            renders its hint after its children, so a paragraph passed as a
            child pushes the hint to the bottom and leaves it stranded under
            an unrelated block of text.
          */}
          <div>
            <Field
              id="classContext"
              label={
                scope === "single"
                  ? "What is the class called?"
                  : studentName
                    ? `Which class is ${studentName} in?`
                    : "Which class are you in?"
              }
              error={fieldErrors.classContext}
              hint={
                scope === "single"
                  ? "Optional — it only names the saved timetable"
                  : "Exactly as it is printed on the timetable"
              }
            >
              <Input
                {...fieldA11yProps(
                  "classContext",
                  fieldErrors.classContext,
                  scope === "single"
                    ? "Optional — it only names the saved timetable"
                    : "Exactly as it is printed on the timetable",
                )}
                name="classContext"
                required={scope === "shared"}
                placeholder="S3 MCB"
                className="h-11"
              />
            </Field>
            <p className="mt-3 max-w-[54ch] text-[0.85rem] leading-relaxed text-ink-subtle">
              {scope === "single"
                ? "Every cell on the sheet is read. There is no other class to tell it apart from, so this is just what the timetable gets called."
                : `A school timetable usually covers every class at once. This is how the reader knows which block of the grid is ${
                    studentName ? `${studentName}'s` : "yours"
                  } — without it, it would be guessing.`}
            </p>
          </div>

          <div>
            <p className="mb-2.5 text-[13px] font-medium text-ink">The timetable</p>

            {/*
              A real target rather than the browser's "Choose File / no file
              chosen", which is unstyleable past a point and reads as a hole in
              the page. The input stays a real file input inside the label, so
              the form posts normally and keyboard focus still works.
            */}
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const dropped = e.dataTransfer.files?.[0];
                if (!dropped || !fileRef.current) return;
                // Assigning the DataTransfer list is what makes a dropped file
                // part of the form submission, not just of this component.
                fileRef.current.files = e.dataTransfer.files;
                chooseFile(dropped);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center",
                "transition-colors duration-200 ease-out-flat",
                dragging
                  ? "border-brand bg-brand-soft"
                  : imageError
                    ? "border-danger/50 bg-danger/5"
                    : "border-border bg-surface-sunken hover:border-border-strong hover:bg-surface-raised",
                "focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/40",
              )}
            >
              <input
                {...fieldA11yProps("image", imageError)}
                ref={fileRef}
                name="image"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                className="sr-only"
                onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
              />

              <span
                className={cn(
                  "grid size-12 place-items-center rounded-xl border border-border",
                  fileName && !imageError ? "bg-brand-soft" : "bg-card",
                )}
              >
                <Upload
                  aria-hidden="true"
                  className={cn(
                    "size-5",
                    fileName && !imageError ? "text-brand-ink" : "text-ink-subtle",
                  )}
                />
              </span>

              {fileName ? (
                <>
                  <span className="mt-4 max-w-full truncate text-body font-medium text-ink">
                    {fileName}
                  </span>
                  <span className="mt-1.5 text-[0.85rem] text-ink-subtle">
                    Click to choose a different one
                  </span>
                </>
              ) : (
                <>
                  <span className="mt-4 text-body font-medium text-ink">
                    Choose a photo or PDF, or drop one here
                  </span>
                  <span className="mt-1.5 text-[0.85rem] text-ink-subtle">
                    {`${SUPPORTED_UPLOAD_LABEL}, under ${MAX_UPLOAD_BYTES / 1_000_000}MB`}
                  </span>
                </>
              )}
            </label>

            {imageError ? (
              <p
                id="image-error"
                role="alert"
                className="mt-2.5 text-[13px] leading-5 text-danger"
              >
                {imageError}
              </p>
            ) : (
              <p id="image-hint" className="mt-2.5 text-[0.85rem] text-ink-subtle">
                A PDF is read directly — there is no need to screenshot it first.
              </p>
            )}
          </div>

          {/*
            `w-fit` on the submit: SubmitButton defaults to w-full for the auth
            forms, and at full width in a justify-end row it pushes Cancel out
            through the left edge of the card.
          */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button asChild type="button" variant="outline">
              <a href={returnTo}>Cancel</a>
            </Button>
            <SubmitButton
              pendingLabel="Reading the timetable"
              className="w-fit"
              disabled={Boolean(fileError)}
            >
              <ImageUp aria-hidden="true" />
              Read it
            </SubmitButton>
          </div>
        </form>
      </Surface>
    );
  }

  // --- Step two -------------------------------------------------------------
  const byDay = new Map<number, Row[]>();
  for (const row of rows) {
    byDay.set(row.dayOfWeek, [...(byDay.get(row.dayOfWeek) ?? []), row]);
  }
  // Sorted within the day, because an added row is appended to the end of the
  // list and would otherwise sit under the last lesson whatever time it is.
  for (const [day, dayRows] of byDay) {
    byDay.set(day, [...dayRows].sort((a, b) => a.startTime.localeCompare(b.startTime)));
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) =>
      (current ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  const remove = (key: string) =>
    setRows((current) => (current ?? []).filter((r) => r.key !== key));

  /**
   * Accept "8.30" the way the extractor does, on the way out of the field.
   *
   * These inputs were always free text, but until rows could be added it was
   * only ever the model filling them, and the model was told to return HH:MM.
   * A person typing 8.30 into a field that silently requires 08:30 would have
   * got "those entries could not be read" from the save button, pointing at
   * nothing in particular.
   */
  const normaliseOnBlur = (key: string, field: "startTime" | "endTime", value: string) => {
    const tidy = normaliseTime(value);
    if (tidy && tidy !== value) update(key, { [field]: tidy } as Partial<Row>);
  };

  const addRow = () => {
    const start = normaliseTime(draft.startTime);
    const end = normaliseTime(draft.endTime);
    const name = draft.name.trim();

    if (!name) return setDraftError("Give it a name.");
    if (!start) return setDraftError("The start time is not a time. Try 08:00.");
    if (!end) return setDraftError("The end time is not a time. Try 08:50.");
    if (end <= start) return setDraftError("It has to end after it starts.");

    const isLesson = draft.activityType === "class";
    setRows((current) => [
      ...(current ?? []),
      {
        key: `added-${(addedCount.current += 1)}`,
        dayOfWeek: draft.dayOfWeek,
        startTime: start,
        endTime: end,
        activityType: draft.activityType,
        subject: isLesson ? name : null,
        title: isLesson ? null : name,
        room: draft.room.trim() || null,
        teacher: draft.teacher.trim() || null,
        // Typed by a person looking at the timetable. Nothing was guessed, so
        // it must not come back outlined as a row that needs checking.
        confidence: "high",
      },
    ]);

    setDraftError(null);
    // Same day, starting where the last one ended — a timetable is entered as
    // a run of consecutive periods, not as seven unrelated forms.
    setDraft({ ...draft, startTime: end, endTime: "", name: "", room: "", teacher: "" });
  };

  const lowCount = rows.filter((r) => r.confidence === "low").length;
  const lessons = rows.filter((r) => r.activityType === "class").length;

  /*
    Checked here and not only on the server.

    Both of these were settled before the review screen opened, back when it
    could only delete rows: the extraction normalised every time and counted
    the overlaps once. Editing and adding rows moves both targets, so they are
    recomputed on every keystroke and the save button is held shut while
    either is unresolved. The alternative is the database refusing the insert
    with 23P01 after the wizard has already been dismissed.
  */
  const problems = rows
    .map((row) => ({ row, reason: rowProblem(row) }))
    .filter((p): p is { row: Row; reason: string } => p.reason !== null);
  const clashCount = findClashes(rows).length;
  const blocked = problems.length > 0 || clashCount > 0 || rows.length === 0;

  return (
    <div className="space-y-rhythm">
      <Surface inset="roomy">
        <Eyebrow tone="brand">Step 2 of 2</Eyebrow>
        <h2 className="mt-4 text-display font-semibold text-ink">
          Check this before it is saved.
        </h2>
        <p className="mt-4 max-w-[62ch] text-body text-ink-muted">
          {lessons} lesson{lessons === 1 ? "" : "s"} across {days.length} day
          {days.length === 1 ? "" : "s"}. Everything here is editable — fix
          anything that is wrong, delete anything that is not{" "}
          {studentName ? `${studentName}'s` : "yours"}.
        </p>

        {analysis.result?.provider === "mock" ? (
          <Notice tone="pause" icon={Info}>
            This is sample data — not your timetable.{" "}
            <code className="text-ink">TIMETABLE_EXTRACTOR</code> is set to{" "}
            <code className="text-ink">mock</code> on the server, so nothing was
            read. Set it to <code className="text-ink">google</code> with a free
            key from Google AI Studio, or <code className="text-ink">anthropic</code>{" "}
            with a funded key, and upload again.
          </Notice>
        ) : null}

        {lowCount > 0 ? (
          <Notice tone="pause" icon={AlertTriangle}>
            {lowCount} row{lowCount === 1 ? " was" : "s were"} hard to read and{" "}
            {lowCount === 1 ? "is" : "are"} outlined below. Those are the ones
            worth checking against the photo.
          </Notice>
        ) : null}

        {clashCount > 0 ? (
          <Notice tone="danger" icon={AlertTriangle}>
            {clashCount} pair{clashCount === 1 ? "" : "s"} of lessons overlap.
            Fix or delete one of each — the database will refuse a timetable
            that contradicts itself.
          </Notice>
        ) : null}

        {problems.length > 0 ? (
          <Notice tone="danger" icon={AlertTriangle}>
            {problems.length} row{problems.length === 1 ? "" : "s"} cannot be
            saved as {problems.length === 1 ? "it is" : "they are"}:{" "}
            {[...new Set(problems.map((p) => p.reason.toLowerCase().replace(/\.$/, "")))].join(
              "; ",
            )}
            . They are outlined in red below.
          </Notice>
        ) : null}

        {analysis.dropped && analysis.dropped.length > 0 ? (
          <Notice tone="danger" icon={AlertTriangle}>
            {analysis.dropped.length} row{analysis.dropped.length === 1 ? "" : "s"}{" "}
            could not be used at all:{" "}
            {analysis.dropped
              .slice(0, 3)
              .map((d) => `${d.entry.subject ?? d.entry.title ?? "a row"} (${d.reason.toLowerCase()})`)
              .join("; ")}
            . Add {analysis.dropped.length === 1 ? "it" : "them"} back at the
            bottom of this page.
          </Notice>
        ) : null}

        {analysis.result?.notes?.map((note) => (
          <Notice key={note} tone="subtle" icon={Info}>
            {note}
          </Notice>
        ))}
      </Surface>

      {days.map((day) => (
        <Surface key={day} inset="normal">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <h3 className="text-section text-ink">{DAY_NAMES[day]}</h3>
            <span className="text-[0.9rem] text-ink-subtle" data-numeric>
              {byDay.get(day)?.length}
            </span>
          </div>

          <ul className="space-y-3">
            {(byDay.get(day) ?? []).map((row) => (
              <li
                key={row.key}
                className={cn(
                  // Six columns is one too many for sm, so the row stacks
                  // until md rather than squeezing every input to nothing.
                  "grid gap-3 rounded-xl border p-4 md:grid-cols-[6rem_6rem_minmax(0,1fr)_6.5rem_6.5rem_auto] md:items-center",
                  // Unsaveable outranks unsure: a row that is merely hard to
                  // read still saves, and one the database will reject does not.
                  rowProblem(row)
                    ? "border-danger/55 bg-danger/6"
                    : row.confidence === "low"
                      ? "border-pause/50 bg-pause/6"
                      : "border-border bg-surface-sunken",
                )}
              >
                <Input
                  aria-label="Start time"
                  value={row.startTime}
                  onChange={(e) => update(row.key, { startTime: e.target.value })}
                  onBlur={(e) => normaliseOnBlur(row.key, "startTime", e.target.value)}
                  className="h-10"
                  data-numeric
                />
                <Input
                  aria-label="End time"
                  value={row.endTime}
                  onChange={(e) => update(row.key, { endTime: e.target.value })}
                  onBlur={(e) => normaliseOnBlur(row.key, "endTime", e.target.value)}
                  className="h-10"
                  data-numeric
                />
                <Input
                  aria-label={row.activityType === "class" ? "Subject" : "What this is"}
                  value={row.subject ?? row.title ?? ""}
                  onChange={(e) =>
                    update(
                      row.key,
                      row.activityType === "class"
                        ? { subject: e.target.value }
                        : { title: e.target.value },
                    )
                  }
                  className="h-10"
                />
                <Input
                  aria-label="Room"
                  value={row.room ?? ""}
                  placeholder="Room"
                  onChange={(e) => update(row.key, { room: e.target.value || null })}
                  className="h-10"
                />
                {/*
                  A single-class timetable prints the teacher in every cell,
                  and the reader now returns it. Without a field here it would
                  be saved unseen — the one piece of an entry that nobody could
                  correct, on the screen whose whole purpose is correcting.
                */}
                <Input
                  aria-label="Teacher"
                  value={row.teacher ?? ""}
                  placeholder="Teacher"
                  onChange={(e) => update(row.key, { teacher: e.target.value || null })}
                  className="h-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${row.subject ?? row.title ?? "this row"}`}
                  onClick={() => remove(row.key)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </Surface>
      ))}

      {/*
        Adding, not just correcting.

        The review step began as a veto — check what the reader found, fix it,
        drop what is not hers. But a reader that misses a row leaves no way to
        put it back, and a photo with a cut-off edge or a faint last column is
        exactly the case this screen exists for. Typing the missing period here
        is the difference between a timetable that is right and one that is
        nearly right, which the countdown will quietly report as fact.
      */}
      <Surface inset="normal">
        <div className="mb-5">
          <h3 className="text-section text-ink">Add one it missed.</h3>
          <p className="mt-2 max-w-[62ch] text-[0.9rem] leading-relaxed text-ink-subtle">
            Pick the day and the times, and it drops into place above. After
            each one the start time moves to where the last period ended, so a
            run of them is quick to enter.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <Field id="draft-day" label="Day">
            <Select
              value={String(draft.dayOfWeek)}
              onValueChange={(value) =>
                setDraft({ ...draft, dayOfWeek: Number(value) })
              }
            >
              <SelectTrigger id="draft-day" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEK.map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {DAY_NAMES[day]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="draft-start" label="Starts">
            <Input
              id="draft-start"
              value={draft.startTime}
              onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
              placeholder="08:00"
              className="h-10"
              data-numeric
            />
          </Field>

          <Field id="draft-end" label="Ends">
            <Input
              id="draft-end"
              value={draft.endTime}
              onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
              placeholder="08:50"
              className="h-10"
              data-numeric
            />
          </Field>

          <Field id="draft-kind" label="What is it?">
            <Select
              value={draft.activityType}
              onValueChange={(value) =>
                setDraft({ ...draft, activityType: value as Draft["activityType"] })
              }
            >
              <SelectTrigger id="draft-kind" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_KINDS.map((kind) => (
                  <SelectItem key={kind.value} value={kind.value}>
                    {kind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            id="draft-name"
            label={draft.activityType === "class" ? "Subject" : "Call it"}
            hint={
              draft.activityType === "class"
                ? "A new subject is created if there is not one already"
                : undefined
            }
          >
            <Input
              id="draft-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={
                draft.activityType === "class" ? "Advanced Database" : "Short break"
              }
              className="h-10"
              // Entering a run of periods should never need the mouse.
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRow();
                }
              }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="draft-room" label="Room">
              <Input
                id="draft-room"
                value={draft.room}
                onChange={(e) => setDraft({ ...draft, room: e.target.value })}
                placeholder="Optional"
                className="h-10"
              />
            </Field>
            <Field id="draft-teacher" label="Teacher">
              <Input
                id="draft-teacher"
                value={draft.teacher}
                onChange={(e) => setDraft({ ...draft, teacher: e.target.value })}
                placeholder="Optional"
                className="h-10"
              />
            </Field>
          </div>
        </div>

        {draftError ? (
          <p role="alert" className="mt-4 text-[13px] leading-5 text-danger">
            {draftError}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end">
          <Button type="button" variant="outline" onClick={addRow}>
            <Plus aria-hidden="true" />
            Add to {DAY_NAMES[draft.dayOfWeek]}
          </Button>
        </div>
      </Surface>

      <Surface inset="roomy">
        {confirmation.formError ? <FormAlert>{confirmation.formError}</FormAlert> : null}

        <form action={confirm} className="grid gap-6">
          {/*
            Shorter than the read, but it writes subjects, a version and every
            row in one go — and a second click during it would archive the
            timetable it is halfway through creating.
          */}
          <FormPendingOverlay
            title="Saving the timetable"
            stages={[{ after: 10, text: "Creating the subjects it needs as it goes." }]}
          />
          {studentId ? <input type="hidden" name="studentId" value={studentId} /> : null}
          {/* Recorded on the saved version, so a week that came back odd can
              later be traced to how the image was read. */}
          <input type="hidden" name="scope" value={scope} />
          {/* 'manual', 'pdf' or 'image' — the column has taken all three
              since the core schema, and only ever received 'image'. */}
          <input type="hidden" name="source" value={source} />
          <input
            type="hidden"
            name="entries"
            // `key` is local bookkeeping for React; the action validates a
            // strict schema and would reject an unexpected field.
            value={JSON.stringify(rows.map((row) => stripKey(row)))}
          />

          <Field id="name" label="Call this timetable">
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 max-w-md"
            />
          </Field>

          <p className="max-w-[62ch] text-[0.9rem] leading-relaxed text-ink-subtle">
            Saving replaces the current timetable. The old one is archived
            rather than deleted, so nothing already recorded against it is lost.
          </p>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {blocked ? (
              <p className="mr-auto text-[0.85rem] text-danger">
                {rows.length === 0
                  ? "There is nothing to save. Add at least one row."
                  : "Fix the rows marked in red before saving."}
              </p>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setRows(null)}>
              Start again
            </Button>
            <SubmitButton pendingLabel="Saving" className="w-fit" disabled={blocked}>
              {`Save ${rows.length} row${rows.length === 1 ? "" : "s"}`}
            </SubmitButton>
          </div>
        </form>
      </Surface>
    </div>
  );
}

const EXAMPLE = [
  "Mon 08:00-09:40 Embedded System Software (Willy)",
  "Mon 09:40-10:00 Short break",
  "Mon 10:00-11:40 Web3 (Emmanuel)",
  "Tue 08:50-09:40 Project Based Learning (Eric)",
  "Wed 1:30-2:20 PM Data Structures (Eric)",
].join("\n");

/**
 * The whole week, one lesson to a line.
 *
 * The format is described in one sentence and then shown, because an example
 * is read and a specification is not. Everything the parser forgives is
 * visible in those five lines — short day names, a bare start time, an
 * afternoon range written the way a timetable prints it — so nobody has to be
 * told that they are allowed.
 */
function TypedLines({
  value,
  onChange,
  problems,
  onUse,
  returnTo,
}: {
  value: string;
  onChange: (next: string) => void;
  problems: ParsedLine[] | null;
  onUse: () => void;
  returnTo: string;
}) {
  const lineCount = value.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#")).length;

  return (
    <div className="mt-8 grid gap-5">
      <div>
        <p className="mb-2.5 text-[13px] font-medium text-ink">
          One lesson per line: day, time, lesson, teacher
        </p>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder={EXAMPLE}
          className="min-h-[16rem] font-mono text-[0.85rem] leading-relaxed"
          aria-label="Your lessons, one per line"
        />
        <p className="mt-2.5 max-w-[62ch] text-[0.85rem] leading-relaxed text-ink-subtle">
          <code className="text-ink-muted">Mon 08:00-09:40 Java (Faustin)</code>.
          Short day names are fine, so are <code className="text-ink-muted">8-9:40</code>{" "}
          and <code className="text-ink-muted">1:30-2:20 PM</code>. The teacher can
          go in brackets, after a comma or after a dash, and can be left out.
          Breaks and study periods are recognised by name. Columns pasted from a
          spreadsheet work too.
        </p>
      </div>

      {problems && problems.length > 0 ? (
        <div className="rounded-xl border border-danger/45 bg-danger/8 px-5 py-4">
          <p className="text-[0.92rem] font-medium text-danger">
            {problems.length} line{problems.length === 1 ? "" : "s"} could not be
            read. The rest are fine — fix {problems.length === 1 ? "it" : "them"}{" "}
            and press the button again, or carry on without{" "}
            {problems.length === 1 ? "it" : "them"}.
          </p>
          <ul className="mt-3 space-y-2">
            {problems.slice(0, 8).map((problem) => (
              <li key={problem.lineNumber} className="text-[0.85rem] leading-relaxed">
                <span className="text-ink-subtle" data-numeric>
                  Line {problem.lineNumber}:
                </span>{" "}
                <code className="text-ink-muted">{problem.text}</code>
                <span className="block text-danger">{problem.reason}</span>
              </li>
            ))}
          </ul>
          {problems.length > 8 ? (
            <p className="mt-3 text-[0.85rem] text-ink-subtle">
              …and {problems.length - 8} more.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {lineCount > 0 ? (
          <span className="mr-auto text-[0.85rem] text-ink-subtle" data-numeric>
            {lineCount} line{lineCount === 1 ? "" : "s"}
          </span>
        ) : null}
        <Button asChild type="button" variant="outline">
          <a href={returnTo}>Cancel</a>
        </Button>
        <Button type="button" size="lg" className="w-fit" disabled={lineCount === 0} onClick={onUse}>
          <ListPlus aria-hidden="true" />
          Check these
        </Button>
      </div>
    </div>
  );
}

/** Drops the client-only `key` before the row crosses to the server. */
function stripKey(row: Row): ExtractedEntry {
  const { key, ...entry } = row;
  void key;
  return entry;
}

function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: "pause" | "danger" | "subtle";
  icon: typeof Info;
  children: React.ReactNode;
}) {
  const style = {
    pause: "border-pause/45 bg-pause/8 text-pause-ink",
    danger: "border-danger/45 bg-danger/8 text-danger",
    subtle: "border-border bg-surface-sunken text-ink-muted",
  }[tone];

  return (
    <div className={cn("mt-5 flex gap-3 rounded-xl border px-5 py-4", style)}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="text-[0.92rem] leading-relaxed">{children}</p>
    </div>
  );
}
