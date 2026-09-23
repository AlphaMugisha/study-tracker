"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { Field, FormAlert, fieldA11yProps } from "@/components/auth/form-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveTimetableEntryAction,
  type TimetableEntryFormState,
} from "@/lib/actions/timetable";
import { DAY_NAMES } from "@/lib/timetable/types";
import type { ResolvedEntry } from "@/lib/timetable/types";
import type { Subject } from "@/types/database";

const EMPTY: TimetableEntryFormState = {};
const NO_SUBJECT = "__none__";

const ACTIVITY_OPTIONS = [
  { value: "class", label: "Lesson" },
  { value: "break", label: "Break" },
  { value: "free", label: "Free period" },
  { value: "study", label: "Study" },
  { value: "other", label: "Other" },
] as const;

/**
 * Add or edit one slot in the school week.
 *
 * The subject field appears only for a lesson and the title field only for
 * everything else, because the database says exactly that: a lesson must name
 * a subject, and anything else must carry a title. Showing both at once and
 * failing on submit would be making the student guess a rule we already know.
 */
export function TimetableEntryDialog({
  subjects,
  entry,
  defaultDay,
  trigger,
}: {
  subjects: Subject[];
  /** Absent means create. */
  entry?: ResolvedEntry;
  defaultDay?: number;
  trigger?: React.ReactNode;
}) {
  const isEdit = Boolean(entry);
  const [open, setOpen] = useState(false);
  const [activityType, setActivityType] = useState<string>(entry?.activityType ?? "class");

  const [state, action] = useActionState<TimetableEntryFormState, FormData>(
    async (prev, formData) => {
      const result = await saveTimetableEntryAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    EMPTY,
  );
  const fieldErrors = state.fieldErrors ?? {};
  const isLesson = activityType === "class";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus aria-hidden="true" />
            Add to timetable
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit this slot" : "Add to your timetable"}</DialogTitle>
          <DialogDescription>
            {isLesson
              ? "A lesson, named by its subject."
              : "A break, free period or anything else in your day."}
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="grid gap-4" noValidate>
          {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
          {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="activityType" label="What is it?">
              <Select
                name="activityType"
                value={activityType}
                onValueChange={setActivityType}
              >
                <SelectTrigger id="activityType" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field id="dayOfWeek" label="Day">
              <Select
                name="dayOfWeek"
                defaultValue={String(entry?.dayOfWeek ?? defaultDay ?? 1)}
              >
                <SelectTrigger id="dayOfWeek" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {DAY_NAMES[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {isLesson ? (
            <Field id="entrySubject" label="Subject" error={fieldErrors.subjectId}>
              {subjects.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-3.5 text-[0.95rem] text-ink-muted">
                  You have no subjects yet. Add one in Settings, then come back.
                </p>
              ) : (
                <Select name="subjectId" defaultValue={entry?.subjectId ?? undefined}>
                  <SelectTrigger id="entrySubject" className="h-11 w-full">
                    <SelectValue placeholder="Choose a subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          ) : (
            <>
              {/* The action reads subjectId regardless; a non-lesson sends the
                  sentinel so it normalises to null. */}
              <input type="hidden" name="subjectId" value={NO_SUBJECT} />
              <Field id="entryTitle" label="Name" error={fieldErrors.title}>
                <Input
                  {...fieldA11yProps("entryTitle", fieldErrors.title)}
                  name="title"
                  required
                  defaultValue={entry?.label ?? ""}
                  placeholder="Morning break"
                  className="h-11"
                />
              </Field>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="startTime" label="Starts" error={fieldErrors.startTime}>
              <Input
                {...fieldA11yProps("startTime", fieldErrors.startTime)}
                name="startTime"
                type="time"
                required
                defaultValue={entry?.startLabel ?? "08:30"}
                className="h-11"
              />
            </Field>
            <Field id="endTime" label="Ends" error={fieldErrors.endTime}>
              <Input
                {...fieldA11yProps("endTime", fieldErrors.endTime)}
                name="endTime"
                type="time"
                required
                defaultValue={entry?.endLabel ?? "09:20"}
                className="h-11"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="room" label="Room" error={fieldErrors.room} hint="Optional.">
              <Input
                {...fieldA11yProps("room", fieldErrors.room, "Optional.")}
                name="room"
                defaultValue={entry?.room ?? ""}
                placeholder="B12"
                className="h-11"
              />
            </Field>
            <Field id="teacher" label="Teacher" error={fieldErrors.teacher} hint="Optional.">
              <Input
                {...fieldA11yProps("teacher", fieldErrors.teacher, "Optional.")}
                name="teacher"
                placeholder="Mr Uwase"
                className="h-11"
              />
            </Field>
          </div>

          <div className="mt-1 flex justify-end">
            <SubmitButton pendingLabel="Saving">
              {isEdit ? "Save changes" : "Add to timetable"}
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
