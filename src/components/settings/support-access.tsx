import { Eye, ShieldAlert, ShieldCheck } from "lucide-react";

import { ItemCard, ItemGrid } from "@/components/shared/item-card";
import { Eyebrow } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import {
  respondToRequestAction,
  revokeAccessAction,
} from "@/lib/actions/support";
import { isLive, type SupportLink } from "@/lib/data/support";
import { cn } from "@/lib/utils";

/**
 * The student's side of support access: who can read their work, who asked
 * for more, and what they can do about each.
 *
 * This panel used to be the consent model made visible, and the sentence that
 * mattered most was "nobody can see your work unless you approve it". Since
 * 0008 that is no longer true — a support account reads every student by
 * default — so the panel's job has changed rather than gone away.
 *
 * It now has to carry the one guarantee that survived: she can always find out
 * who can see her. Access that cannot be refused is one thing; access that
 * cannot be DISCOVERED is a different and much worse one, and this component
 * is the whole of that disclosure. The `oversight` list is therefore rendered
 * first and without a Revoke button, because offering her a control that would
 * not work would be worse than offering none.
 */
export function SupportAccess({
  links,
  oversight = [],
}: {
  links: SupportLink[];
  /** Support accounts that can read this student without having asked. */
  oversight?: Array<{ id: string; name: string }>;
}) {
  const pending = links.filter((l) => l.status === "pending");
  const active = links.filter(isLive);

  // A support account appearing in both lists is one account, not two. The
  // link is the more specific fact — it carries the timetable-edit right — so
  // it wins and the oversight row is dropped.
  const linkedIds = new Set(active.map((l) => l.admin_id));
  const watching = oversight.filter((o) => !linkedIds.has(o.id));

  return (
    <div className="space-y-6">
      {watching.length > 0 ? (
        <div className="rounded-xl border border-lesson/40 bg-lesson-soft/30 p-5">
          <div className="flex items-start gap-3.5">
            <Eye aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-lesson" />
            <div className="min-w-0 flex-1">
              <Eyebrow tone="lesson">
                {watching.length === 1
                  ? "A support account can see your work"
                  : `${watching.length} support accounts can see your work`}
              </Eyebrow>
              <p className="mt-2.5 max-w-[56ch] text-[0.95rem] leading-relaxed text-ink-muted">
                Support accounts on StudyFlow can read every student&apos;s
                record, so this is not something you approved and not something
                you can switch off here. They can see your homework, revision,
                study sessions, timetable and activity log.
              </p>
              <p className="mt-2.5 max-w-[56ch] text-[0.95rem] leading-relaxed text-ink-muted">
                They cannot change any of it, and they cannot see anything you
                do outside this app. If you want it to stop, that is a
                conversation with them rather than a setting.
              </p>

              <ul className="mt-5 space-y-2.5 border-t border-border pt-4">
                {watching.map((account) => (
                  <li key={account.id} className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full bg-lesson"
                    />
                    <span className="truncate text-body font-medium text-ink">
                      {account.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="rounded-xl border border-pause/40 bg-pause-soft/40 p-5">
          <div className="flex items-start gap-3.5">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-pause" />
            <div className="min-w-0 flex-1">
              <Eyebrow tone="pause">
                {pending.length === 1 ? "A request" : `${pending.length} requests`}
              </Eyebrow>
              {/*
                This used to read "someone is asking to see your academic
                progress". Since 0008 a support account can already see it, so
                saying that would be asking her to approve something she has
                no say in and hiding the thing she does — which is the one
                write any support account gets anywhere.
              */}
              <p className="mt-2.5 max-w-[56ch] text-[0.95rem] leading-relaxed text-ink-muted">
                Someone is asking to help manage your timetable. Allowing it
                lets them add, change and remove your lessons and subjects —
                nothing else. They cannot touch your homework, your revision or
                anything you have marked done, and every change they make shows
                up in your activity log with their name on it.
              </p>
              <p className="mt-2.5 max-w-[56ch] text-[0.95rem] leading-relaxed text-ink-subtle">
                Declining changes nothing about what they can already read, and
                you can withdraw this later at any time.
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
            {/*
              This block is now about the timetable right specifically, not
              about access in general — the panel above covers reading. Saying
              "Nobody has access" here while a support account reads everything
              would be the single most misleading sentence in the product.
            */}
            <Eyebrow tone={active.length > 0 ? "lesson" : "brand"}>
              {active.length === 0
                ? "Nobody can change your timetable"
                : `${active.length} ${active.length === 1 ? "person can" : "people can"} edit your timetable`}
            </Eyebrow>

            {active.length === 0 ? (
              <p className="mt-2.5 max-w-[56ch] text-[0.95rem] leading-relaxed text-ink-muted">
                Only you can add or change your lessons. A support account can
                ask for this, you decide, and you can take it back at any time.
              </p>
            ) : (
              <>
                <p className="mt-2.5 max-w-[56ch] text-[0.95rem] leading-relaxed text-ink-muted">
                  These accounts can add, change and remove your lessons and
                  subjects. They still cannot touch your homework or revision,
                  and every edit appears in your activity log attributed to
                  them.
                </p>
                <div className="mt-5">
                  <ItemGrid>
                    {active.map((link, i) => (
                      <ItemCard
                        key={link.id}
                        index={i}
                        accent="lesson"
                        title={link.counterpartName ?? "A support account"}
                        meta={<span>Can read your record and edit your timetable</span>}
                        footer={
                          <form action={revokeAccessAction} className="ml-auto">
                            <input type="hidden" name="id" value={link.id} />
                            <Button type="submit" size="sm" variant="outline">
                              Stop timetable edits
                            </Button>
                          </form>
                        }
                      />
                    ))}
                  </ItemGrid>
                </div>
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
