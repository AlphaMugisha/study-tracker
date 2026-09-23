import { ShieldAlert, ShieldCheck } from "lucide-react";

import { Eyebrow } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import {
  respondToRequestAction,
  revokeAccessAction,
} from "@/lib/actions/support";
import { isLive, type SupportLink } from "@/lib/data/support";
import { cn } from "@/lib/utils";

/**
 * The student's side of support access: who has asked, who has it, and one
 * click to end it.
 *
 * This panel is the consent model made visible. It matters that the student
 * can always see exactly who can read their work and remove them without
 * asking anyone — access that cannot be seen or withdrawn is surveillance,
 * whatever the schema calls it.
 */
export function SupportAccess({ links }: { links: SupportLink[] }) {
  const pending = links.filter((l) => l.status === "pending");
  const active = links.filter(isLive);

  return (
    <div className="space-y-6">
      {pending.length > 0 ? (
        <div className="rounded-xl border border-pause/40 bg-pause-soft/40 p-5">
          <div className="flex items-start gap-3.5">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-pause" />
            <div className="min-w-0 flex-1">
              <Eyebrow tone="pause">
                {pending.length === 1 ? "A request" : `${pending.length} requests`}
              </Eyebrow>
              <p className="mt-2.5 max-w-[56ch] text-[0.95rem] leading-relaxed text-ink-muted">
                Someone is asking to see your academic progress. They can read
                your homework, revision and activity — they can never change
                anything, and you can withdraw this at any time.
              </p>

              <ul className="mt-5 space-y-4">
                {pending.map((link) => (
                  <li
                    key={link.id}
                    className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body font-medium text-ink">
                        {link.counterpartName ?? "A support account (run migration 0005 to show names)"}
                      </span>
                      {link.note ? (
                        <span className="mt-1 block text-[0.9rem] text-ink-subtle">
                          “{link.note}”
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 gap-2">
                      <form action={respondToRequestAction}>
                        <input type="hidden" name="id" value={link.id} />
                        <input type="hidden" name="decision" value="deny" />
                        <Button type="submit" size="sm" variant="ghost">
                          Decline
                        </Button>
                      </form>
                      <form action={respondToRequestAction}>
                        <input type="hidden" name="id" value={link.id} />
                        <input type="hidden" name="decision" value="grant" />
                        <Button type="submit" size="sm">
                          Allow
                        </Button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "rounded-xl border p-5",
          active.length > 0 ? "border-border bg-surface-sunken" : "border-border",
        )}
      >
        <div className="flex items-start gap-3.5">
          <ShieldCheck
            aria-hidden="true"
            className={cn(
              "mt-0.5 size-5 shrink-0",
              active.length > 0 ? "text-lesson" : "text-brand",
            )}
          />
          <div className="min-w-0 flex-1">
            <Eyebrow tone={active.length > 0 ? "lesson" : "brand"}>
              {active.length === 0
                ? "Nobody has access"
                : `${active.length} ${active.length === 1 ? "person has" : "people have"} access`}
            </Eyebrow>

            {active.length === 0 ? (
              <p className="mt-2.5 max-w-[56ch] text-[0.95rem] leading-relaxed text-ink-muted">
                No one can see your work. A support account can only read it if
                you approve a request, and you can revoke that at any time.
              </p>
            ) : (
              <>
                <p className="mt-2.5 max-w-[56ch] text-[0.95rem] leading-relaxed text-ink-muted">
                  These accounts can read your homework, revision and activity
                  log. They cannot edit anything, and they see nothing outside
                  StudyFlow.
                </p>
                <ul className="mt-5 divide-y divide-border">
                  {active.map((link) => (
                    <li
                      key={link.id}
                      className="flex items-center justify-between gap-4 py-3.5"
                    >
                      <span className="min-w-0 truncate text-body font-medium text-ink">
                        {link.counterpartName ?? "A support account (run migration 0005 to show names)"}
                      </span>
                      <form action={revokeAccessAction}>
                        <input type="hidden" name="id" value={link.id} />
                        <Button type="submit" size="sm" variant="outline">
                          Revoke
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      <p className="text-[0.9rem] leading-relaxed text-ink-subtle">
        Support accounts see academic activity inside StudyFlow only — homework,
        revision, study sessions and your timetable. Never keystrokes, browsing,
        location, or anything you do outside this app.
      </p>
    </div>
  );
}
