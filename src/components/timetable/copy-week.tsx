"use client";

import { useEffect, useState } from "react";
import { Check, ClipboardCopy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toTimetableLines } from "@/lib/timetable/parse-lines";
import type { ResolvedEntry } from "@/lib/timetable/types";

/**
 * The saved week, copied out as the same lines the typing tab reads back.
 *
 * ---------------------------------------------------------------------------
 * This is the other half of typing a timetable in, and the half that makes
 * the first one worth having twice.
 *
 * A timetable is rarely wrong in one place. A term changes and four lessons
 * move; a teacher is replaced and their name is wrong on six rows. Correcting
 * that through a dialog is forty trips. Copying the week out, fixing it in
 * whatever is already open, and pasting it back is one.
 *
 * It is also how anybody learns the format. Nobody reads a syntax
 * description. Everybody recognises their own timetable written down.
 * ---------------------------------------------------------------------------
 */
export function CopyWeek({ entries }: { entries: ResolvedEntry[] }) {
  const [copied, setCopied] = useState(false);

  // Back to the resting label on its own, so the button does not sit claiming
  // a copy that happened two minutes ago.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    const text = toTimetableLines(
      entries.map((entry) => ({
        dayOfWeek: entry.dayOfWeek,
        startTime: entry.startLabel,
        endTime: entry.endLabel,
        // A lesson is named by its subject and anything else by its own
        // label, which is the same split the parser makes on the way in.
        subject: entry.activityType === "class" ? entry.subjectName : null,
        title: entry.activityType === "class" ? null : entry.label,
        teacher: entry.teacher,
        room: entry.room,
      })),
    );

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /*
        Clipboard access can be refused — an insecure origin, or a browser
        that wants a permission this click did not ask for. Falling back to a
        selected textarea leaves the person one Ctrl+C from the same result,
        which is better than a button that silently does nothing.
      */
      const scratch = document.createElement("textarea");
      scratch.value = text;
      scratch.setAttribute("readonly", "");
      scratch.style.position = "fixed";
      scratch.style.opacity = "0";
      document.body.appendChild(scratch);
      scratch.select();
      try {
        setCopied(document.execCommand("copy"));
      } finally {
        scratch.remove();
      }
    }
  };

  return (
    <Button type="button" variant="ghost" onClick={copy} aria-live="polite">
      {copied ? (
        <>
          <Check aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <ClipboardCopy aria-hidden="true" />
          Copy as text
        </>
      )}
    </Button>
  );
}
