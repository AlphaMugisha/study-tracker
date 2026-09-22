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
import { Textarea } from "@/components/ui/textarea";
import {
  createAssignmentAction,
  updateAssignmentAction,
  type AssignmentFormState,
} from "@/lib/actions/assignments";
import type { Assignment, Subject } from "@/types/database";

const EMPTY: AssignmentFormState = {};
/** The Select needs a non-empty value, so "no subject" gets a sentinel. */
const NO_SUBJECT = "__none__";

export function AssignmentDialog({
  subjects,
  assignment,
  trigger,
  defaultOpen = false,
}: {
  subjects: Subject[];
  /** Absent means create. */
  assignment?: Assignment;
  trigger?: React.ReactNode;
  /** Set by /homework?new=1 so the sidebar action is one click from anywhere. */
  defaultOpen?: boolean;
}) {
  const isEdit = Boolean(assignment);
  const [open, setOpen] = useState(defaultOpen);

  // Wrapping the server action rather than watching its result in an effect:
  // this runs on the client once the action resolves, so the dialog closes on
  // success and stays open (with its errors) on failure. No cascading render.
  const [state, action] = useActionState<AssignmentFormState, FormData>(
    async (prev, formData) => {
      const result = await (isEdit ? updateAssignmentAction : createAssignmentAction)(
        prev,
        formData,
      );
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
          <Button>
            <Plus aria-hidden="true" />
            Add homework
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit homework" : "Add homework"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Change the details and save."
              : "What needs doing, and by when?"}
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="grid gap-4" noValidate>
          {assignment ? <input type="hidden" name="id" value={assignment.id} /> : null}
          {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}

          <Field id="title" label="Title" error={fieldErrors.title}>
            <Input
              {...fieldA11yProps("title", fieldErrors.title)}
              name="title"
              required
              autoFocus
              placeholder="Quadratic equations, exercises 4-11"
              defaultValue={assignment?.title ?? ""}
              className="h-10"
            />
          </Field>

          <Field id="subjectId" label="Subject">
            <Select
              name="subjectId"
              defaultValue={assignment?.subject_id ?? NO_SUBJECT}
            >
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="dueDate" label="Due date" error={fieldErrors.dueDate}>
              <Input
                {...fieldA11yProps("dueDate", fieldErrors.dueDate)}
                name="dueDate"
                type="date"
                required
                defaultValue={assignment?.due_date ?? new Date().toISOString().slice(0, 10)}
                className="h-10"
              />
            </Field>

            <Field
              id="dueTime"
              label="Due time"
              error={fieldErrors.dueTime}
              hint="Optional"
            >
              <Input
                {...fieldA11yProps("dueTime", fieldErrors.dueTime, "Optional")}
                name="dueTime"
                type="time"
                defaultValue={assignment?.due_time?.slice(0, 5) ?? ""}
                className="h-10"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="priority" label="Priority">
              <Select name="priority" defaultValue={assignment?.priority ?? "medium"}>
                <SelectTrigger id="priority" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field
              id="estimatedMinutes"
              label="How long?"
              error={fieldErrors.estimatedMinutes}
              hint="Minutes"
            >
              <Input
                {...fieldA11yProps("estimatedMinutes", fieldErrors.estimatedMinutes, "Minutes")}
                name="estimatedMinutes"
                type="number"
                min={5}
                max={600}
                step={5}
                defaultValue={assignment?.estimated_minutes ?? 30}
                className="h-10"
              />
            </Field>
          </div>

          <Field id="description" label="Notes" hint="Optional">
            <Textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Anything you want to remember about this task."
              defaultValue={assignment?.description ?? ""}
            />
          </Field>

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel={isEdit ? "Saving" : "Adding"}>
              {isEdit ? "Save changes" : "Add homework"}
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
