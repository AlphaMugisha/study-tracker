"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteAssignmentAction } from "@/lib/actions/assignments";

/**
 * Two-step delete rather than a modal: one tap arms it, the next confirms.
 * Cheaper than a dialog for a low-stakes action, and it cannot be triggered
 * by a stray click the way a bare delete button can.
 */
export function DeleteAssignment({ id, title }: { id: string; title: string }) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${title}`}
        onClick={() => setArmed(true)}
        className="text-ink-subtle hover:text-danger"
      >
        <Trash2 aria-hidden="true" />
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <Button type="button" variant="ghost" size="xs" onClick={() => setArmed(false)}>
        Cancel
      </Button>
      <form action={deleteAssignmentAction}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="destructive" size="xs">
          Delete
        </Button>
      </form>
    </span>
  );
}
