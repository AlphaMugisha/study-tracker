"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Must be rendered inside the <form> it submits -- useFormStatus reads the
 * status of the nearest ancestor form.
 *
 * `w-full` is the default because this was written for the auth forms, where
 * the button is the only thing on its row. Pass a className to override it:
 * left at full width inside a `justify-end` row it takes 100% of the row and
 * shoves its siblings out through the left edge of the card.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" className={cn("w-full", className)} disabled={pending}>
      {pending ? (
        <>
          <Loader2 aria-hidden="true" className="animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/**
 * Captures the browser's IANA timezone so the timetable engine can resolve
 * "now" in the student's zone rather than the server's. Written into a hidden
 * field on mount; falls back to UTC server-side when JavaScript is off.
 */
export function TimezoneField() {
  return (
    <input
      type="hidden"
      name="timezone"
      defaultValue=""
      ref={(node) => {
        if (node && !node.value) {
          try {
            node.value = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
          } catch {
            node.value = "UTC";
          }
        }
      }}
    />
  );
}
