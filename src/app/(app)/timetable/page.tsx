import type { Metadata } from "next";
import Link from "next/link";
import { ImageUp, CalendarPlus } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/shared/reveal";
import { BlockHeading } from "@/components/shared/surface";
import { TimetableEntryDialog } from "@/components/timetable/entry-dialog";
import { DaySchedule, WeekGrid } from "@/components/timetable/schedule";
import { EmptyState } from "@/components/ui/empty-state";
import { getActiveTimetable, getSubjects } from "@/lib/data/timetable";
import { DAY_NAMES, DAY_SHORT, toDayOfWeek } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Timetable" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DAYS = [1, 2, 3, 4, 5] as const;

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const [{ version, entries }, subjects] = await Promise.all([
    getActiveTimetable(),
    getSubjects(),
  ]);

  const now = new Date();
  const todayIndex = toDayOfWeek(now);

  const view = params.view === "week" ? "week" : "day";
  const requested = Number(params.day);
  // Weekends fall back to Monday rather than showing an empty day.
  const selectedDay =
    requested >= 1 && requested <= 5 ? requested : todayIndex >= 6 ? 1 : todayIndex;

  const dayEntries = entries
    .filter((e) => e.dayOfWeek === selectedDay)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (!version || entries.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          eyebrow="School timetable"
          title="Your school week."
          description="The lessons, breaks and free periods of your school day — not homework or revision. StudyFlow reads this to work out what you are doing now, what is next, and how much of the evening is left."
        />
        <EmptyState
          icon={CalendarPlus}
          headline="No school timetable yet."
          body="Add your lessons one at a time. Naming a subject here creates it, so it is ready to file homework against."
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild>
                <Link href="/timetable/upload">
                  <ImageUp aria-hidden="true" />
                  Upload a photo
                </Link>
              </Button>
              <TimetableEntryDialog subjects={subjects} defaultDay={selectedDay} />
            </div>
          }
        />
        <p className="mt-5 text-center text-[0.9rem] text-ink-subtle">
          A photo of the timetable is read for you, and you check every row
          before anything is saved. Entering lessons by hand still works and is
          the one that never depends on a clear photograph.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow={`School timetable · ${version.name}`}
        title="Your school week."
        description="Lessons, breaks and free periods. Naming a subject here creates it, so homework can be filed against it straight away."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-border bg-card p-1">
              <ViewTab href="/timetable" active={view === "day"} label="Day" />
              <ViewTab href="/timetable?view=week" active={view === "week"} label="Week" />
            </div>
            <Button asChild variant="outline">
              <Link href="/timetable/upload">
                <ImageUp aria-hidden="true" />
                Replace from photo
              </Link>
            </Button>
            <TimetableEntryDialog subjects={subjects} defaultDay={selectedDay} />
          </div>
        }
      />

      {view === "day" ? (
        <Reveal index={1}>
          {/* Day picker. Horizontally scrollable on narrow screens rather than
              wrapping, so the row always reads as one control. */}
          <div className="-mx-5 mb-6 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <div className="inline-flex gap-1.5">
              {DAYS.map((day) => {
                const active = day === selectedDay;
                return (
                  <Link
                    key={day}
                    href={day === todayIndex ? "/timetable" : `/timetable?day=${day}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "rounded-md border px-3.5 py-2 text-[13px] font-medium transition-colors",
                      active
                        ? "border-brand/50 bg-brand-soft text-brand-ink"
                        : "border-border bg-card text-ink-muted hover:text-ink",
                    )}
                  >
                    <span className="sm:hidden">{DAY_SHORT[day]}</span>
                    <span className="hidden sm:inline">{DAY_NAMES[day]}</span>
                    {day === todayIndex ? (
                      <span className="ml-1.5 text-[11px] text-brand-ink">•</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>

          <BlockHeading
            eyebrow={selectedDay === todayIndex ? "Today" : "Selected day"}
            title={`${DAY_NAMES[selectedDay]}.`}
            count={dayEntries.length}
          />
          <DaySchedule entries={dayEntries} subjects={subjects} editable />
        </Reveal>
      ) : (
        <Reveal index={1}>
          <BlockHeading eyebrow="All five days" title="The whole week." />
          <WeekGrid entries={entries} today={todayIndex} />
        </Reveal>
      )}
    </PageContainer>
  );
}

function ViewTab({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-sm px-3 py-1.5 text-[13px] font-medium transition-colors",
        active ? "bg-surface-raised text-ink" : "text-ink-muted hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
}
