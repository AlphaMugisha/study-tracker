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
import { createRevisionAction, type RevisionFormState } from "@/lib/actions/revision";
import type { Subject } from "@/types/database";

const EMPTY: RevisionFormState = {};

/** The Select needs a non-empty value, so "no subject" gets a sentinel. */
const NO_SUBJECT = "__none__";

/**
 * Add a revision task.
 *
 * Revision has no deadline — that is the whole difference from homework.
 * `scheduledDate` is an intention ("I mean to do this Thursday"), not a due
 * date, and the form says so rather than borrowing homework's "Due" label and
 * quietly meaning something else.
 */
export function RevisionDialog({
  subjects,
  trigger,
}: {
  subjects: Subject[];
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Wrapping the action rather than watching its result in an effect: this
  // runs on the client once it resolves, so the dialog closes on success and
  // stays open with its errors on failure.
  const [state, action] = useActionState<RevisionFormState, FormData>(
    async (prev, formData) => {
      const result = await createRevisionAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    EMPTY,
  );
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Plus aria-hidden="true" />
            Add revision
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add revision</DialogTitle>
          <DialogDescription>
            Something to study. No deadline — the planner fits it in after
            homework.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="grid gap-4" noValidate>
          {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}

          <Field id="revisionTitle" label="What are you revising?" error={fieldErrors.title}>
            <Input
              {...fieldA11yProps("revisionTitle", fieldErrors.title)}
              name="title"
              required
              autoFocus
              placeholder="Photosynthesis — recall the equations"
              className="h-11"
            />
          </Field>

          <Field id="revisionSubject" label="Subject">
            <Select name="subjectId" defaultValue={NO_SUBJECT}>
              <SelectTrigger id="revisionSubject" className="h-11 w-full">
                <SelectValue placeholder="Choose a subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SUBJECT}>No subject</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="revisionMinutes"
              label="How long?"
              error={fieldErrors.estimatedMinutes}
              hint="Minutes. The planner uses this."
            >
              <Input
                {...fieldA11yProps(
                  "revisionMinutes",
                  fieldErrors.estimatedMinutes,
                  "Minutes.",
                )}
                name="estimatedMinutes"
                type="number"
                min={5}
                max={600}
                step={5}
                required
                defaultValue={30}
                className="h-11"
              />
            </Field>

            <Field
              id="revisionDate"
              label="Plan it for"
              error={fieldErrors.scheduledDate}
              hint="Optional. An intention, not a deadline."
            >
              <Input
                {...fieldA11yProps("revisionDate", fieldErrors.scheduledDate, "Optional.")}
                name="scheduledDate"
                type="date"
                className="h-11"
              />
            </Field>
          </div>

          <Field id="revisionPriority" label="Priority">
            <Select name="priority" defaultValue="low">
              <SelectTrigger id="revisionPriority" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="mt-1 flex justify-end">
            <SubmitButton pendingLabel="Saving">Add revision</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
