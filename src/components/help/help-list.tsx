import { Check, RotateCcw } from "lucide-react";

import { ItemCard, ItemGrid } from "@/components/shared/item-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setHelpStatusAction } from "@/lib/actions/help";
import { stuckFor, type HelpEntry } from "@/lib/data/help";

/**
 * The "things I don't understand" list.
 *
 * One component, two audiences. She sees it with buttons; a support account
 * sees exactly the same rows with `readOnly`, because the point of the list is
 * that both of them are looking at the same thing. The buttons are hidden for
 * a parent because the database refuses those writes anyway — rendering a
 * control that always errors is worse than rendering none.
 *
 * Age is shown on every open item. "Since yesterday" and "3 weeks" are the
 * same row otherwise, and they mean very different things.
 */
export function HelpList({
  entries,
  readOnly = false,
  emptyLabel,
}: {
  entries: HelpEntry[];
  readOnly?: boolean;
  emptyLabel?: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-body text-ink-muted">
        {emptyLabel ?? "Nothing on the list."}
      </p>
    );
  }

  return (
    <ItemGrid>
      {entries.map((entry, index) => {
        const open = entry.status === "open";
        return (
          <ItemCard
            key={entry.id}
            index={index}
            accent={open ? "danger" : "brand"}
            muted={!open}
            title={entry.topic}
            trailing={
              open ? (
                <Badge variant="outline" className="text-[0.75rem]">
                  {stuckFor(entry)}
                </Badge>
              ) : null
            }
            meta={
              <>
                {entry.subjectName ? <span>{entry.subjectName}</span> : null}
                {entry.assignmentTitle ? <span>{entry.assignmentTitle}</span> : null}
                {entry.detail ? (
                  <span className="basis-full text-ink-muted">{entry.detail}</span>
                ) : null}
              </>
            }
            footer={
              readOnly ? undefined : (
                <form action={setHelpStatusAction} className="contents">
                  <input type="hidden" name="id" value={entry.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={open ? "resolved" : "open"}
                  />
                  <Button type="submit" variant="outline" size="sm">
                    {open ? (
                      <>
                        <Check aria-hidden="true" />I get it now
                      </>
                    ) : (
                      <>
                        <RotateCcw aria-hidden="true" />
                        Still stuck
                      </>
                    )}
                  </Button>
                </form>
              )
            }
          />
        );
      })}
    </ItemGrid>
  );
}

/**
 * Shown when migration 0006 has not been applied.
 *
 * An empty list would read as "she understands everything", which is the
 * opposite of the truth and the kind of wrong that gets acted on.
 */
export function HelpMigrationNotice() {
  return (
    <div className="rounded-xl border border-dashed border-pause/50 bg-pause/8 px-6 py-6">
      <p className="text-body font-medium text-pause-ink">
        This list needs one database migration.
      </p>
      <p className="mt-2 max-w-[60ch] text-[0.95rem] leading-relaxed text-ink-muted">
        Run <code className="text-ink">supabase/migrations/0006_help_requests.sql</code> in
        the Supabase SQL editor. Until then nothing can be saved here — this is
        not an empty list, it is a missing table.
      </p>
    </div>
  );
}
