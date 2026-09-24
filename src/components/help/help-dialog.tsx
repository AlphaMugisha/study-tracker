"use client";

import { useActionState, useState } from "react";
import { HelpCircle } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { logHelpAction, type HelpFormState } from "@/lib/actions/help";
import type { Subject } from "@/types/database";

const EMPTY: HelpFormState = {};
const NO_SUBJECT = "__none__";

/**
 * "I don't get this."
 *
 * Deliberately the lowest-effort form in the app: one required field, and it
 * accepts a half-sentence. The thing being captured is a feeling she has at
 * 21:40 with the book still open, and any form that asks her to categorise it
 * first is a form she closes.
 *
 * `assignmentId` is passed when this is raised from a specific piece of
 * homework, so the entry carries its context without her typing it out.
 */
export function HelpDialog({
  subjects,
  assignmentId,
  defaultSubjectId,
  defaultTopic,
  trigger,
}: {
  subjects: Subject[];
  assignmentId?: string;
  defaultSubjectId?: string | null;
  defaultTopic?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const [state, action] = useActionState<HelpFormState, FormData>(
    async (prev, formData) => {
      const result = await logHelpAction(prev, formData);
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
          <Button variant="outline">
            <HelpCircle aria-hidden="true" />
            I am stuck on something
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>What are you stuck on?</DialogTitle>
          <DialogDescription>
            Write it down while it is fresh. Anyone supporting you can see this
            list, so it is a way of asking without having to bring it up.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="grid gap-4" noValidate>
          {assignmentId ? (
            <input type="hidden" name="assignmentId" value={assignmentId} />
          ) : null}
          {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}

          <Field id="topic" label="The thing" error={fieldErrors.topic}>
            <Input
              {...fieldA11yProps("topic", fieldErrors.topic)}
              name="topic"
              required
              autoFocus
              placeholder="Completing the square"
              defaultValue={defaultTopic ?? ""}
              className="h-10"
            />
          </Field>

          <Field id="subjectId" label="Subject" hint="Optional">
            <Select name="subjectId" defaultValue={defaultSubjectId ?? NO_SUBJECT}>
              <SelectTrigger id="subjectId" className="h-10 w-full">
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

          <Field id="detail" label="What exactly?" hint="Optional">
            <Textarea
              id="detail"
              name="detail"
              rows={4}
              placeholder="I can do it when the number in front of x squared is 1, but not otherwise."
              defaultValue=""
            />
          </Field>

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving">Add to my list</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
