"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ImageUp, Info, Trash2, Upload } from "lucide-react";

import { Field, FormAlert, fieldA11yProps } from "@/components/auth/form-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { Eyebrow, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  analyseTimetableAction,
  confirmTimetableAction,
  type AnalyseState,
  type ConfirmState,
} from "@/lib/actions/timetable-import";
import { MAX_IMAGE_BYTES, type ExtractedEntry } from "@/lib/timetable/import-constants";
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

type Row = ExtractedEntry & { key: string };

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
  const [name, setName] = useState("My timetable");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const fieldErrors = analysis.fieldErrors ?? {};

  // --- Step one -------------------------------------------------------------
  if (!rows) {
    return (
      <Surface inset="roomy" className="max-w-2xl">
        <Eyebrow tone="brand">Step 1 of 2</Eyebrow>
        <h2 className="mt-4 text-display font-semibold text-ink">
          {studentName ? `Upload ${studentName}'s timetable.` : "Upload your timetable."}
        </h2>
        <p className="mt-4 max-w-[52ch] text-body text-ink-muted">
          A photo or screenshot works. Nothing is saved until you have checked
          what was read.
        </p>

        <form action={analyse} className="mt-9 grid gap-7" noValidate>
          {studentId ? <input type="hidden" name="studentId" value={studentId} /> : null}
          {analysis.formError ? <FormAlert>{analysis.formError}</FormAlert> : null}

          {/*
            The long explanation sits OUTSIDE the Field, not inside it. Field
            renders its hint after its children, so a paragraph passed as a
            child pushes the hint to the bottom and leaves it stranded under
            an unrelated block of text.
          */}
          <div>
            <Field
              id="classContext"
              label="Which class is she in?"
              error={fieldErrors.classContext}
              hint="Exactly as it is printed on the timetable"
            >
              <Input
                {...fieldA11yProps(
                  "classContext",
                  fieldErrors.classContext,
                  "Exactly as it is printed on the timetable",
                )}
                name="classContext"
                required
                placeholder="S3 MCB"
                className="h-11"
              />
            </Field>
            <p className="mt-3 max-w-[54ch] text-[0.85rem] leading-relaxed text-ink-subtle">
              A school timetable usually covers every class at once. This is how
              the reader knows which block of the grid is{" "}
              {studentName ? `${studentName}'s` : "yours"} — without it, it would
              be guessing.
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
                setFileName(dropped.name);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center",
                "transition-colors duration-200 ease-out-flat",
                dragging
                  ? "border-brand bg-brand-soft"
                  : fieldErrors.image
                    ? "border-danger/50 bg-danger/5"
                    : "border-border bg-surface-sunken hover:border-border-strong hover:bg-surface-raised",
                "focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/40",
              )}
            >
              <input
                {...fieldA11yProps("image", fieldErrors.image)}
                ref={fileRef}
                name="image"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />

              <span
                className={cn(
                  "grid size-12 place-items-center rounded-xl border border-border",
                  fileName ? "bg-brand-soft" : "bg-card",
                )}
              >
                <Upload
                  aria-hidden="true"
                  className={cn("size-5", fileName ? "text-brand-ink" : "text-ink-subtle")}
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
                    Choose a photo, or drop one here
                  </span>
                  <span className="mt-1.5 text-[0.85rem] text-ink-subtle">
                    {`JPEG, PNG, WebP or GIF, under ${MAX_IMAGE_BYTES / 1_000_000}MB`}
                  </span>
                </>
              )}
            </label>

            {fieldErrors.image ? (
              <p
                id="image-error"
                role="alert"
                className="mt-2.5 text-[13px] leading-5 text-danger"
              >
                {fieldErrors.image}
              </p>
            ) : (
              <p id="image-hint" className="mt-2.5 text-[0.85rem] text-ink-subtle">
                PDFs are not supported yet — a screenshot of one works.
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
            <SubmitButton pendingLabel="Reading the timetable" className="w-fit">
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
  const days = [...byDay.keys()].sort((a, b) => a - b);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) =>
      (current ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  const remove = (key: string) =>
    setRows((current) => (current ?? []).filter((r) => r.key !== key));

  const lowCount = rows.filter((r) => r.confidence === "low").length;
  const lessons = rows.filter((r) => r.activityType === "class").length;

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
            This is sample data. <code className="text-ink">TIMETABLE_EXTRACTOR</code>{" "}
            is set to <code className="text-ink">mock</code>, so the image was not
            actually read. Set it to <code className="text-ink">anthropic</code> with
            an API key to read real timetables.
          </Notice>
        ) : null}

        {lowCount > 0 ? (
          <Notice tone="pause" icon={AlertTriangle}>
            {lowCount} row{lowCount === 1 ? " was" : "s were"} hard to read and{" "}
            {lowCount === 1 ? "is" : "are"} outlined below. Those are the ones
            worth checking against the photo.
          </Notice>
        ) : null}

        {(analysis.clashCount ?? 0) > 0 ? (
          <Notice tone="danger" icon={AlertTriangle}>
            {analysis.clashCount} pair of lessons overlap. Fix or delete one of
            each — the database will refuse a timetable that contradicts itself.
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
            . Add {analysis.dropped.length === 1 ? "it" : "them"} by hand afterwards.
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
                  "grid gap-3 rounded-xl border p-4 sm:grid-cols-[7rem_7rem_1fr_8rem_auto] sm:items-center",
                  row.confidence === "low"
                    ? "border-pause/50 bg-pause/6"
                    : "border-border bg-surface-sunken",
                )}
              >
                <Input
                  aria-label="Start time"
                  value={row.startTime}
                  onChange={(e) => update(row.key, { startTime: e.target.value })}
                  className="h-10"
                  data-numeric
                />
                <Input
                  aria-label="End time"
                  value={row.endTime}
                  onChange={(e) => update(row.key, { endTime: e.target.value })}
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

      <Surface inset="roomy">
        {confirmation.formError ? <FormAlert>{confirmation.formError}</FormAlert> : null}

        <form action={confirm} className="grid gap-6">
          {studentId ? <input type="hidden" name="studentId" value={studentId} /> : null}
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

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRows(null)}>
              Start again
            </Button>
            <SubmitButton pendingLabel="Saving" className="w-fit">
              {`Save ${rows.length} row${rows.length === 1 ? "" : "s"}`}
            </SubmitButton>
          </div>
        </form>
      </Surface>
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
