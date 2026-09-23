"use client";

import { useActionState, useMemo } from "react";
import { CheckCircle2 } from "lucide-react";

import { Field, FormAlert, fieldA11yProps } from "@/components/auth/form-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { updateProfileAction, type ProfileFormState } from "@/lib/actions/profile";

const EMPTY: ProfileFormState = {};

export function ProfileForm({
  fullName,
  timezone,
}: {
  fullName: string;
  timezone: string;
}) {
  const [state, action] = useActionState(updateProfileAction, EMPTY);
  const fieldErrors = state.fieldErrors ?? {};

  // The browser already knows every IANA zone; no need to ship a list.
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [timezone, "UTC"];
    }
  }, [timezone]);

  return (
    <form action={action} className="grid max-w-md gap-4" noValidate>
      {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}
      {state.ok ? (
        <p className="flex items-center gap-2 text-[13px] text-lesson-ink">
          <CheckCircle2 aria-hidden="true" className="size-4" />
          Saved.
        </p>
      ) : null}

      <Field id="fullName" label="Full name" error={fieldErrors.fullName}>
        <Input
          {...fieldA11yProps("fullName", fieldErrors.fullName)}
          name="fullName"
          required
          defaultValue={fullName}
          className="h-10"
        />
      </Field>

      <Field
        id="timezone"
        label="Timezone"
        error={fieldErrors.timezone}
        hint="Used to work out what you're doing right now."
      >
        <Input
          {...fieldA11yProps(
            "timezone",
            fieldErrors.timezone,
            "Used to work out what you're doing right now.",
          )}
          name="timezone"
          list="timezone-options"
          required
          defaultValue={timezone}
          className="h-10"
        />
        <datalist id="timezone-options">
          {zones.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </Field>

      <div className="mt-1">
        <SubmitButton pendingLabel="Saving">Save changes</SubmitButton>
      </div>
    </form>
  );
}
