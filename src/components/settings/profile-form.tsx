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
  studyUntil,
  settleMinutes,
}: {
  fullName: string;
  timezone: string;
  /** Stored as a Postgres `time`, so it arrives as "21:00:00". */
  studyUntil: string;
  settleMinutes: number;
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
    <form action={action} className="grid max-w-xl gap-5" noValidate>
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
          className="h-11"
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
          className="h-11"
        />
        <datalist id="timezone-options">
          {zones.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </Field>

      {/* The planner reads both of these. Without them it has no idea how much
          time there is, which is why the old preview could schedule past
          midnight and never say anything would not fit. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="studyUntil"
          label="Finish work by"
          error={fieldErrors.studyUntil}
          hint="Anything that will not fit before this is flagged, not hidden."
        >
          <Input
            {...fieldA11yProps(
              "studyUntil",
              fieldErrors.studyUntil,
              "Anything that will not fit before this is flagged.",
            )}
            name="studyUntil"
            type="time"
            required
            defaultValue={studyUntil.slice(0, 5)}
            className="h-11"
          />
        </Field>

        <Field
          id="settleMinutes"
          label="Wind-down after school"
          error={fieldErrors.settleMinutes}
          hint="Minutes before work starts."
        >
          <Input
            {...fieldA11yProps(
              "settleMinutes",
              fieldErrors.settleMinutes,
              "Minutes before work starts.",
            )}
            name="settleMinutes"
            type="number"
            min={0}
            max={240}
            step={5}
            required
            defaultValue={settleMinutes}
            className="h-11"
          />
        </Field>
      </div>

      <div className="mt-1">
        <SubmitButton pendingLabel="Saving">Save changes</SubmitButton>
      </div>
    </form>
  );
}
