"use client";

import { useActionState, useState } from "react";
import { UserPlus } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { requestAccessAction, type SupportFormState } from "@/lib/actions/support";

const EMPTY: SupportFormState = {};

/**
 * Ask a student for access.
 *
 * The copy is deliberate about what this does: it sends a request. Nothing is
 * granted here, and the student can decline — saying so up front is more
 * honest than a button labelled "Add student" that quietly does nothing until
 * someone else acts.
 */
export function RequestAccessDialog() {
  const [open, setOpen] = useState(false);

  const [state, action] = useActionState<SupportFormState, FormData>(
    async (prev, formData) => {
      const result = await requestAccessAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    EMPTY,
  );
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden="true" />
          Request access
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request access</DialogTitle>
          <DialogDescription>
            They will see this request in their settings and can allow or
            decline it. You get nothing until they allow it.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="grid gap-4" noValidate>
          {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}

          <Field id="studentEmail" label="Student's email" error={fieldErrors.email}>
            <Input
              {...fieldA11yProps("studentEmail", fieldErrors.email)}
              name="email"
              type="email"
              required
              autoFocus
              placeholder="student@example.com"
              className="h-11"
            />
          </Field>

          <Field
            id="requestNote"
            label="Say who you are"
            error={fieldErrors.note}
            hint="They see this. A name they recognise makes the decision easy."
          >
            <Textarea
              {...fieldA11yProps("requestNote", fieldErrors.note, "They see this.")}
              name="note"
              rows={3}
              placeholder="Hi — it's Mr Uwase, your maths teacher."
            />
          </Field>

          <div className="mt-1 flex justify-end">
            <SubmitButton pendingLabel="Sending">Send request</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
