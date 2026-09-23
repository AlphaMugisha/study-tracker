"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteTimetableEntryAction } from "@/lib/actions/timetable";

/** Remove one slot from the week. */
export function DeleteEntryButton({ id, label }: { id: string; label: string }) {
  return (
    <form action={deleteTimetableEntryAction}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        size="icon-sm"
        variant="ghost"
        aria-label={`Remove ${label} from the timetable`}
        title="Remove"
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </form>
  );
}
