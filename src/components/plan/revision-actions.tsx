"use client";

import { Check, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteRevisionAction, setRevisionStatusAction } from "@/lib/actions/revision";
import type { TaskStatus } from "@/types/database";

/**
 * Complete / reopen / remove a revision task.
 *
 * Plain forms rather than onClick handlers: these are mutations, they work
 * without JavaScript, and each posts a different payload so a shared handler
 * with a mode flag would only add a way to get it wrong.
 */
export function RevisionActions({ id, status }: { id: string; status: TaskStatus }) {
  const done = status === "completed";

  return (
    <span className="flex shrink-0 items-center gap-1">
      <form action={setRevisionStatusAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value={done ? "not_started" : "completed"} />
        <Button
          type="submit"
          size="icon-sm"
          variant="ghost"
          aria-label={done ? "Mark as not done" : "Mark as done"}
          title={done ? "Mark as not done" : "Mark as done"}
        >
          {done ? <RotateCcw aria-hidden="true" /> : <Check aria-hidden="true" />}
        </Button>
      </form>

      <form action={deleteRevisionAction}>
        <input type="hidden" name="id" value={id} />
        <Button
          type="submit"
          size="icon-sm"
          variant="ghost"
          aria-label="Remove this revision task"
          title="Remove"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </form>
    </span>
  );
}
