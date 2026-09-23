"use client";

import { useActionState, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

import { Field, FormAlert, fieldA11yProps } from "@/components/auth/form-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { SubjectDot } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createSubjectAction,
  deleteSubjectAction,
  updateSubjectAction,
  type SubjectFormState,
} from "@/lib/actions/subjects";
import type { Subject } from "@/types/database";
import { cn } from "@/lib/utils";

const EMPTY: SubjectFormState = {};

/** The five palette slots a subject may use. Mirrors the check constraint. */
const COLOR_TOKENS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;

/**
 * Add, rename, recolour and remove subjects.
 *
 * Deleting a subject does not delete its homework — the foreign keys are
 * `ON DELETE SET NULL (subject_id)`, so the work survives and becomes
 * unfiled. The copy says so, because "delete" next to a subject that owns
 * eight assignments is otherwise a frightening button.
 */
export function SubjectManager({ subjects }: { subjects: Subject[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-5">
      {subjects.length === 0 ? (
        <p className="text-body text-ink-muted">
          No subjects yet. Add one and your homework, timetable and plan will start
          colour-coding themselves.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {subjects.map((subject) =>
            editingId === subject.id ? (
              <li key={subject.id} className="py-5">
                <SubjectForm
                  subject={subject}
                  onDone={() => setEditingId(null)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={subject.id} className="flex items-center gap-4 py-4">
                <SubjectDot colorToken={subject.color_token} className="size-3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-ink">
                    {subject.name}
                  </span>
                  {subject.short_name ? (
                    <span className="block text-[0.9rem] text-ink-subtle">
                      {subject.short_name}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Rename ${subject.name}`}
                    onClick={() => setEditingId(subject.id)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <form action={deleteSubjectAction}>
                    <input type="hidden" name="id" value={subject.id} />
                    <Button
                      type="submit"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${subject.name}`}
                      title="Homework keeps its place; it just becomes unfiled."
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </form>
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      {adding ? (
        <div className="rounded-xl border border-border bg-surface-sunken p-5">
          <SubjectForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" />
          Add a subject
        </Button>
      )}

      {subjects.length > 0 ? (
        <p className="text-[0.9rem] leading-relaxed text-ink-subtle">
          Removing a subject keeps its homework — those tasks simply become unfiled.
        </p>
      ) : null}
    </div>
  );
}

function SubjectForm({
  subject,
  onDone,
  onCancel,
}: {
  subject?: Subject;
  onDone: () => void;
  onCancel: () => void;
}) {
  // Closing is done inside the action rather than by reacting to `ok` in an
  // effect: the same pattern the assignment dialog uses, and it avoids both a
  // side effect during render and a setState inside useEffect.
  const [state, action] = useActionState<SubjectFormState, FormData>(
    async (prev, formData) => {
      const result = await (subject ? updateSubjectAction : createSubjectAction)(
        prev,
        formData,
      );
      if (result.ok) onDone();
      return result;
    },
    EMPTY,
  );
  const [color, setColor] = useState(subject?.color_token ?? "chart-1");
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-4" noValidate>
      {subject ? <input type="hidden" name="id" value={subject.id} /> : null}
      <input type="hidden" name="colorToken" value={color} />

      {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="subjectName" label="Name" error={fieldErrors.name}>
          <Input
            {...fieldA11yProps("subjectName", fieldErrors.name)}
            name="name"
            required
            defaultValue={subject?.name ?? ""}
            placeholder="Mathematics"
            className="h-11"
          />
        </Field>
        <Field
          id="subjectShortName"
          label="Short name"
          error={fieldErrors.shortName}
          hint="Optional. Used where space is tight."
        >
          <Input
            {...fieldA11yProps("subjectShortName", fieldErrors.shortName, "Optional.")}
            name="shortName"
            defaultValue={subject?.short_name ?? ""}
            placeholder="Maths"
            className="h-11"
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2.5 text-[0.9rem] font-medium text-ink">Colour</legend>
        <div className="flex flex-wrap gap-2.5">
          {COLOR_TOKENS.map((token) => (
            <button
              key={token}
              type="button"
              onClick={() => setColor(token)}
              aria-label={`Colour ${token}`}
              aria-pressed={color === token}
              className={cn(
                "flex size-10 items-center justify-center rounded-xl border transition-colors duration-150 ease-out-flat",
                color === token
                  ? "border-brand-ink bg-surface-raised"
                  : "border-border hover:border-border-strong",
              )}
            >
              <SubjectDot colorToken={token} className="size-4" />
              {color === token ? (
                <Check aria-hidden="true" className="sr-only" />
              ) : null}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-1 flex items-center gap-3">
        <SubmitButton pendingLabel="Saving">
          {subject ? "Save changes" : "Add subject"}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={onCancel}>
          <X aria-hidden="true" />
          Cancel
        </Button>
      </div>
    </form>
  );
}
