import { Check, CircleAlert, HelpCircle } from "lucide-react";

import { Surface } from "@/components/shared/surface";
import type { DailyReport } from "@/lib/report/daily";
import { formatDurationCompact } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

/**
 * One day, closed.
 *
 * The quiet days are the point of this list as much as the busy ones, so a
 * day with nothing on it still gets a card — it is a fact about the week, not
 * a gap to be collapsed. It is rendered dimmed rather than dramatic: a red
 * "NOTHING DONE" for every Sunday would train the eye to skip exactly the
 * signal this page exists to show.
 */
export function DailyReportCard({ report }: { report: DailyReport }) {
  const quiet = report.events === 0;

  return (
    <Surface
      as="li"
      inset="tight"
      className={cn("flex flex-col", quiet && "border-dashed bg-transparent shadow-none")}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3
          className={cn(
            "text-[1.1rem] font-semibold tracking-[-0.02em]",
            quiet ? "text-ink-subtle" : "text-ink",
          )}
          data-numeric
        >
          {report.label}
        </h3>

        {report.today ? (
          <span className="shrink-0 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-0.5 text-[0.75rem] text-brand-ink">
            Still running
          </span>
        ) : quiet ? (
          <span className="shrink-0 text-[0.8rem] text-ink-subtle">Nothing logged</span>
        ) : null}
      </div>

      {quiet ? (
        <p className="mt-3 text-[0.9rem] leading-relaxed text-ink-subtle">
          {report.today
            ? "Nothing yet today."
            : "No homework added, finished or worked on."}
        </p>
      ) : (
        <>
          <dl className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-3">
            <Figure value={report.added} label="added" tone="text-lesson-ink" />
            <Figure value={report.completed} label="finished" tone="text-brand-ink" />
            {report.studiedMinutes > 0 ? (
              <Figure
                value={formatDurationCompact(report.studiedMinutes)}
                label="recorded"
                tone="text-revise-ink"
              />
            ) : null}
          </dl>

          {report.completedTitles.length > 0 ? (
            <ul className="mt-5 space-y-2">
              {report.completedTitles.map((title, i) => (
                <li
                  key={`${title}-${i}`}
                  className="flex items-start gap-2.5 text-[0.92rem] text-ink-muted"
                >
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-ink" />
                  <span className="min-w-0 flex-1">{title}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      {report.helpLogged > 0 || report.helpResolved > 0 ? (
        <p className="mt-4 flex items-center gap-2 text-[0.85rem] text-ink-subtle">
          <HelpCircle aria-hidden="true" className="size-3.5 shrink-0" />
          {[
            report.helpLogged > 0 ? `flagged ${report.helpLogged}` : null,
            report.helpResolved > 0 ? `worked out ${report.helpResolved}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      {report.missed.length > 0 ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="flex items-center gap-2 text-[0.85rem] font-medium text-danger">
            <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
            Due this day, not finished
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {report.missed.slice(0, 4).map((title, i) => (
              <li key={`${title}-${i}`} className="text-[0.9rem] text-ink-muted">
                {title}
              </li>
            ))}
            {report.missed.length > 4 ? (
              <li className="text-[0.85rem] text-ink-subtle">
                and {report.missed.length - 4} more
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </Surface>
  );
}

function Figure({
  value,
  label,
  tone,
}: {
  value: string | number;
  label: string;
  tone: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="sr-only">{label}</dt>
      <dd
        className={cn("text-[1.45rem] font-semibold leading-none tracking-[-0.03em]", tone)}
        data-numeric
      >
        {value}
      </dd>
      <span className="text-[0.85rem] text-ink-subtle">{label}</span>
    </div>
  );
}
