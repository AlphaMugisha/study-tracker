"use client";

import { useFormStatus } from "react-dom";
import { Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { startSessionAction, stopSessionAction } from "@/lib/actions/sessions";

/**
 * Start / stop the clock on a task.
 *
 * Rendered as two different forms rather than one with a hidden mode, because
 * they post different fields and a mis-set hidden input is a silent bug.
 *
 * The button reflects pending state via `useFormStatus`, which only works
 * inside the form it belongs to — hence the small inner component.
 */
export function StartSessionButton({
  taskId,
  openSessionId,
  isActive,
}: {
  taskId: string | null;
  openSessionId: string | null;
  isActive: boolean;
}) {
  if (!taskId) return null;

  if (isActive && openSessionId) {
    return (
      <form action={stopSessionAction}>
        <input type="hidden" name="sessionId" value={openSessionId} />
        <PendingButton
          idleLabel="Stop working"
          pendingLabel="Stopping"
          icon={<Square aria-hidden="true" />}
        />
      </form>
    );
  }

  return (
    <form action={startSessionAction}>
      <input type="hidden" name="assignmentId" value={taskId} />
      <PendingButton
        idleLabel="Start this"
        pendingLabel="Starting"
        icon={<Play aria-hidden="true" />}
      />
    </form>
  );
}

function PendingButton({
  idleLabel,
  pendingLabel,
  icon,
}: {
  idleLabel: string;
  pendingLabel: string;
  icon: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="xl"
      variant="outline"
      disabled={pending}
      className="w-full border-white/35 bg-transparent text-current hover:border-white/70 hover:bg-white/12 dark:border-white/35 dark:bg-transparent dark:hover:bg-white/12 sm:w-auto"
    >
      {icon}
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}

/** The compact variant, for a row in a list rather than the hero panel. */
export function RowSessionButton({
  taskId,
  openSessionId,
  isActive,
}: {
  taskId: string;
  openSessionId: string | null;
  isActive: boolean;
}) {
  if (isActive && openSessionId) {
    return (
      <form action={stopSessionAction}>
        <input type="hidden" name="sessionId" value={openSessionId} />
        <Button type="submit" size="sm" variant="secondary">
          <Square aria-hidden="true" />
          Stop
        </Button>
      </form>
    );
  }

  return (
    <form action={startSessionAction}>
      <input type="hidden" name="assignmentId" value={taskId} />
      <Button type="submit" size="sm" variant="ghost">
        <Play aria-hidden="true" />
        Start
      </Button>
    </form>
  );
}
