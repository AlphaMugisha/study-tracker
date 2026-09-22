"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Must be rendered inside the <form> it submits -- useFormStatus reads the
 * status of the nearest ancestor form.
 */
export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
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
