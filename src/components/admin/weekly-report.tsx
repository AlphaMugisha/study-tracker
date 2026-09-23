import { CheckCircle2, Clock, PlusCircle, TriangleAlert } from "lucide-react";

import { Eyebrow, Surface } from "@/components/shared/surface";
import type { WeeklyReport } from "@/lib/data/report";
import { formatDuration } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

/**
 * Seven days, summarised.
 *
 * Counts and no grades. The numbers say what happened — added, finished, time
 * spent, what slipped — and leave the interpretation to the person who knows
 * the child. A score out of ten would look authoritative and mean nothing.
 */
export function WeeklyReportCard({
  report,
  name,
}: {
  report: WeeklyReport;
  name: string;
}) {
  const nothing =
    report.added === 0 && report.completed === 0 && report.studiedMinutes === 0;

  return (
    <Surface inset="roomy">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow tone="revise">Last 7 days</Eyebrow>
          <h3 className="mt-3 text-display font-semibold text-ink">
            How {name} did.
          </h3>
        </div>
        <span className="text-[0.85rem] text-ink-subtle" data-numeric>
          {report.from} → {report.to}
        </span>
      </div>

      {nothing ? (
        <p className="mt-6 max-w-[54ch] text-body text-ink-muted">
          Nothing was logged this week — no homework added, finished or worked
          on. That may mean a quiet week, or that she is not using StudyFlow.
          The app cannot tell the difference, and it would be wrong to guess.
        </p>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat icon={PlusCircle} tone="lesson" value={report.added} label="Added" />
            <Stat icon={CheckCircle2} tone="brand" value={report.completed} label="Finished" />
            <Stat
              icon={Clock}
              tone="revise"
              value={report.studiedMinutes > 0 ? formatDuration(report.studiedMinutes) : "—"}
              label="Time recorded"
            />
            <Stat
              icon={TriangleAlert}
              tone={report.overdue > 0 ? "danger" : "pause"}
              value={report.overdue}
              label="Overdue now"
            />
          </div>

          <p className="mt-7 max-w-[60ch] text-body text-ink-muted">
            {report.activeDays === 0
              ? "No days with any activity."
              : `Active on ${report.activeDays} of the last 7 days.`}{" "}
            {report.outstanding > 0
              ? `${report.outstanding} piece${report.outstanding === 1 ? "" : "s"} of homework still outstanding.`
              : "Nothing outstanding."}
          </p>

          {report.strongest.length > 0 || report.slipping.length > 0 ? (
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {report.strongest.length > 0 ? (
                <div>
                  <Eyebrow tone="brand">Finished most in</Eyebrow>
                  <ul className="mt-4 space-y-2.5">
                    {report.strongest.map((s) => (
                      <li
                        key={s.subject}
                        className="flex items-baseline justify-between gap-4 text-body"
                      >
                        <span className="truncate text-ink">{s.subject}</span>
                        <span className="shrink-0 text-ink-subtle" data-numeric>
                          {s.completed}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {report.slipping.length > 0 ? (
                <div>
                  <Eyebrow tone="pause">Piling up in</Eyebrow>
                  <ul className="mt-4 space-y-2.5">
                    {report.slipping.map((s) => (
                      <li
                        key={s.subject}
                        className="flex items-baseline justify-between gap-4 text-body"
                      >
                        <span className="truncate text-ink">{s.subject}</span>
                        <span className="shrink-0 text-ink-subtle" data-numeric>
                          {s.outstanding}
                          {s.overdue > 0 ? (
                            <span className="ml-2 font-medium text-danger">
                              {s.overdue} overdue
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Surface>
  );
}

const TONE = {
  brand: "text-brand-ink",
  lesson: "text-lesson-ink",
  revise: "text-revise-ink",
  pause: "text-pause-ink",
  danger: "text-danger",
} as const;

function Stat({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: typeof Clock;
  tone: keyof typeof TONE;
  value: string | number;
  label: string;
}) {
  return (
    <div>
      <Icon aria-hidden="true" className={cn("size-5", TONE[tone])} />
      <p
        className={cn("mt-3 text-[2rem] font-semibold leading-none tracking-[-0.03em]", TONE[tone])}
        data-numeric
      >
        {value}
      </p>
      <p className="mt-2.5 text-[0.9rem] text-ink-subtle">{label}</p>
    </div>
  );
}
