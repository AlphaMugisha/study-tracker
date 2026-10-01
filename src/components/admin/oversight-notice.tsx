import { Database } from "lucide-react";

/**
 * Shown in place of the student list when migration 0008 is not in yet.
 *
 * An empty portal has two completely different causes — nobody has registered,
 * or the migration that makes students visible has not been applied — and they
 * call for opposite reactions. The same reasoning as `HelpMigrationNotice`:
 * silence that looks like data is worse than a short instruction.
 */
export function OversightMigrationNotice() {
  return (
    <div className="rounded-xl border border-dashed border-pause/50 bg-pause-soft/30 p-6">
      <div className="flex items-start gap-4">
        <Database aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-pause" />
        <div className="min-w-0">
          <p className="text-body font-medium text-ink">
            One migration away from showing your students.
          </p>
          <p className="mt-2 max-w-[62ch] text-[0.95rem] leading-relaxed text-ink-muted">
            Apply{" "}
            <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-[0.85rem]">
              supabase/migrations/0008_admin_oversight.sql
            </code>{" "}
            in the Supabase SQL editor. It widens the read-side predicate so a
            support account sees every student, and adds the function that
            tells each student who can see them.
          </p>
          <p className="mt-2 max-w-[62ch] text-[0.95rem] leading-relaxed text-ink-subtle">
            Until then this portal still works the old way — only students who
            approved a request appear, and you can see them under Waiting
            below.
          </p>
        </div>
      </div>
    </div>
  );
}
