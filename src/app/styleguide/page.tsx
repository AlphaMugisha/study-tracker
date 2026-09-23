import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";

import { MotionDemo } from "@/app/styleguide/motion-demo";
import { CurrentActivityCard } from "@/components/today/current-activity-card";
import { DEMO_AFTER_SCHOOL, DEMO_IN_CLASS, DEMO_ON_BREAK } from "@/lib/timetable/demo-states";
import { Eyebrow } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Styleguide" };

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {note ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">{note}</p>
        ) : null}
      </div>
      {children}
      <Separator className="my-12" />
    </section>
  );
}

function Swatch({
  name,
  varName,
  className,
  textClassName = "text-ink",
  contrast,
}: {
  name: string;
  varName: string;
  className: string;
  textClassName?: string;
  contrast?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className={`flex h-20 items-end p-3 ${className} ${textClassName}`}>
        <span className="text-xs font-medium">{name}</span>
      </div>
      <div className="bg-card px-3 py-2">
        <code className="block text-[11px] text-ink-muted">{varName}</code>
        {contrast ? (
          <span className="mt-0.5 block text-[11px] text-ink-subtle">{contrast}</span>
        ) : null}
      </div>
    </div>
  );
}

export default function StyleguidePage() {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-[1100px] px-5 py-10 sm:px-8 lg:px-12">
        <header className="mb-12">
          <Eyebrow>Internal · not shipped to the student</Eyebrow>
          <h1 className="mt-2 text-display font-semibold text-ink">
            StudyFlow design system
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-ink-muted">
            Calm, clean, modern, academic, mature. A near-black ground with
            layered surfaces, indigo as the single accent, and sage, lavender and
            cream reserved for activity types. Depth comes from surface steps and
            borders rather than shadows, and there is almost no motion.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-5">
            <Link href="/dashboard">
              Back to the app <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </header>

        {/* ------------------------------------------------------------ */}
        <Section
          id="colour"
          title="Colour"
          note="Every value is a semantic token in globals.css. Colour never carries meaning on its own -- it always has a text or icon partner. Contrast ratios are against the surface each pairing actually sits on."
        >
          <h3 className="mb-3 text-sm font-medium text-ink">Surfaces and ink</h3>
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Swatch name="Page" varName="--background" className="bg-background" />
            <Swatch name="Card" varName="--card" className="bg-card" />
            <Swatch
              name="Raised"
              varName="--surface-raised"
              className="bg-surface-raised"
            />
            <Swatch
              name="Sunken"
              varName="--surface-sunken"
              className="bg-surface-sunken"
            />
            <Swatch
              name="Ink"
              varName="--ink"
              className="bg-ink"
              textClassName="text-background"
              contrast="15.7:1 on page"
            />
            <Swatch
              name="Ink muted"
              varName="--ink-muted"
              className="bg-ink-muted"
              textClassName="text-background"
              contrast="6.4:1 on card"
            />
          </div>

          <h3 className="mb-3 text-sm font-medium text-ink">Indigo — the accent</h3>
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Swatch
              name="Primary"
              varName="--primary"
              className="bg-primary"
              textClassName="text-primary-foreground"
              contrast="5.0:1 w/ white"
            />
            <Swatch
              name="Indigo"
              varName="--indigo"
              className="bg-indigo"
              textClassName="text-white"
            />
            <Swatch
              name="Indigo soft"
              varName="--indigo-soft"
              className="bg-indigo-soft"
              textClassName="text-indigo-ink"
              contrast="7.6:1 w/ ink"
            />
            <Swatch
              name="Indigo ink"
              varName="--indigo-ink"
              className="bg-indigo-ink"
              textClassName="text-background"
              contrast="8.7:1 on card"
            />
          </div>

          <h3 className="mb-3 text-sm font-medium text-ink">Activity accents</h3>
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Swatch name="Sage" varName="--sage" className="bg-sage" textClassName="text-background" />
            <Swatch
              name="Sage soft"
              varName="--sage-soft"
              className="bg-sage-soft"
              textClassName="text-sage-ink"
              contrast="7.7:1 w/ ink"
            />
            <Swatch
              name="Lavender"
              varName="--lavender"
              className="bg-lavender"
              textClassName="text-background"
            />
            <Swatch
              name="Lavender soft"
              varName="--lavender-soft"
              className="bg-lavender-soft"
              textClassName="text-lavender-ink"
              contrast="7.8:1 w/ ink"
            />
            <Swatch
              name="Cream"
              varName="--cream"
              className="bg-cream"
              textClassName="text-cream-ink"
              contrast="8.7:1 w/ ink"
            />
          </div>

          <h3 className="mb-3 text-sm font-medium text-ink">Hero panel</h3>
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Swatch
              name="Hero"
              varName="--hero"
              className="bg-hero"
              textClassName="text-hero-foreground"
              contrast="5.0:1 w/ white"
            />
            <Swatch
              name="Hero rest"
              varName="--hero-rest"
              className="bg-hero-rest"
              textClassName="text-hero-rest-foreground"
              contrast="9.7:1"
            />
          </div>

          <h3 className="mb-3 text-sm font-medium text-ink">Status</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Swatch
              name="Danger"
              varName="--danger"
              className="bg-danger"
              textClassName="text-background"
              contrast="5.2:1 on card"
            />
            <Swatch
              name="Danger soft"
              varName="--danger-soft"
              className="bg-danger-soft"
              textClassName="text-danger"
              contrast="4.7:1"
            />
            <Swatch
              name="Warn"
              varName="--warn"
              className="bg-warn"
              textClassName="text-background"
            />
            <Swatch
              name="Warn soft"
              varName="--warn-soft"
              className="bg-warn-soft"
              textClassName="text-warn"
              contrast="6.8:1"
            />
          </div>
        </Section>

        {/* ------------------------------------------------------------ */}
        <Section
          id="type"
          title="Typography"
          note="One family: Geist Sans, self-hosted. Display sizes are set tight on both axes -- line-height below 1 and negative tracking -- because at 40px+ the default leading opens gaps that make a two-line headline read as two separate thoughts. Body type keeps normal leading. Numerals are tabular wherever a value ticks. Uppercase appears only in the eyebrow, where the 0.22em tracking is what makes it read as a label rather than as shouting."
        >
          <div className="space-y-6 rounded-xl border border-border bg-card p-6">
            <div>
              <Eyebrow tone="accent">Eyebrow · 11 / 600 / 0.22em</Eyebrow>
              <p className="mt-1.5 text-xs text-ink-subtle">
                The only uppercase in the product
              </p>
            </div>
            <div>
              <p className="text-statement text-ink">Everything you owe.</p>
              <p className="mt-2 text-xs text-ink-subtle">
                Statement · clamp(38px, 5.6vw, 64px) / 600 / -0.035em / 0.95 · the one
                headline per page
              </p>
            </div>
            <div>
              <p className="text-headline text-ink">Mathematics</p>
              <p className="mt-2 text-xs text-ink-subtle">
                Hero · clamp(34px, 4.2vw, 50px) / 600 / -0.03em / 0.98 · current
                activity only
              </p>
            </div>
            <div>
              <p className="text-display font-semibold text-ink">When you get home.</p>
              <p className="mt-2 text-xs text-ink-subtle">
                Display · clamp(26px, 3vw, 34px) / 600 / -0.025em · section headings
              </p>
            </div>
            <div>
              <p className="text-section text-ink">Up next</p>
              <p className="mt-2 text-xs text-ink-subtle">Section · 17 / 600 · card titles</p>
            </div>
            <div>
              <p className="max-w-prose text-[15px] leading-6 text-ink">
                Body copy at 15px on a 24px rhythm. Long enough to read comfortably,
                short enough that the student takes in the whole card at a glance.
              </p>
              <p className="mt-1 text-xs text-ink-subtle">Body · 15 / 24 / 400</p>
            </div>
            <div>
              <p className="text-[13px] leading-5 text-ink-muted">
                Supporting copy for secondary detail.
              </p>
              <p className="mt-1 text-xs text-ink-subtle">Supporting · 13 / 20 / 400</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-ink" data-numeric>
                09:00 — 10:00 · 35 min remaining
              </p>
              <p className="mt-1 text-xs text-ink-subtle">
                Tabular numerals via the <code>data-numeric</code> attribute
              </p>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------ */}
        <Section
          id="current-activity"
          title="Current Activity Card"
          note="The real component, fed a fabricated TimetableState. Rendering the actual card here rather than a copy means the styleguide cannot drift from the product. It is the one element in StudyFlow drawn as a solid panel of colour: everything else is a raised card on the dark ground, so this reads as the page's subject rather than one of its parts."
        >
          <div className="space-y-4">
            <CurrentActivityCard state={DEMO_IN_CLASS} />
            <CurrentActivityCard state={DEMO_ON_BREAK} />
            <div className="grid gap-4 lg:grid-cols-2">
              <CurrentActivityCard state={DEMO_AFTER_SCHOOL} />
              <CurrentActivityCard state={{ kind: "no_timetable" }} />
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------ */}
        <Section
          id="cards"
          title="Cards and elevation"
          note="A 1px rule and a surface step. Nothing casts a shadow: on a dark ground a drop shadow reads as smudge rather than height, so separation is a hairline plus a lighter fill. Cards that are actually interactive brighten their rule and shift their title on hover -- they do not lift."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Static card</CardTitle>
              </CardHeader>
              <CardContent className="text-ink-muted">
                Rule plus surface step, 12px radius. Does not move.
              </CardContent>
            </Card>

            <Card className="card-interactive cursor-pointer hover:border-ink-subtle/40">
              <CardHeader>
                <CardTitle>Interactive card</CardTitle>
              </CardHeader>
              <CardContent className="text-ink-muted">
                Hover me: the rule brightens and the fill lifts a step, 150ms.
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Loading</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ["border · page", "bg-background"],
              ["border · card", "bg-card"],
              ["border-strong · raised", "bg-surface-raised border-border-strong"],
            ].map(([label, cls]) => (
              <div
                key={label}
                className={`rounded-lg border border-border bg-card p-5 ${cls}`}
              >
                <code className="text-xs text-ink-muted">{label}</code>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-4">
            {[
              ["rounded-md", "6px · small controls"],
              ["rounded-lg", "8px · buttons, inputs, nav"],
              ["rounded-xl", "12px · cards and panels"],
              ["rounded-2xl", "16px · rare"],
            ].map(([cls, label]) => (
              <div key={cls} className="text-center">
                <div
                  className={`size-16 border border-border bg-surface-sunken ${cls}`}
                />
                <code className="mt-2 block text-[11px] text-ink-subtle">{label}</code>
              </div>
            ))}
          </div>
        </Section>

        {/* ------------------------------------------------------------ */}
        <Section
          id="controls"
          title="Buttons, badges and inputs"
          note="Buttons are 36px by default, 40px for a primary call to action, 32px inline. Never oversized. Focus rings are always visible."
        >
          <div className="space-y-6 rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Confirm timetable</Button>
              <Button variant="outline">View timetable</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Delete</Button>
              <Button variant="link">Link</Button>
              <Button disabled>Disabled</Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg">Large · 40px</Button>
              <Button>Default · 36px</Button>
              <Button size="sm">Small · 32px</Button>
              <Button size="icon" aria-label="Open">
                <BookOpen />
              </Button>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center gap-2">
              <Badge>High priority</Badge>
              <Badge variant="secondary">Not started</Badge>
              <Badge variant="outline">Biology</Badge>
              <Badge variant="destructive">Overdue</Badge>
              <Badge className="bg-lavender-soft text-lavender-ink">In progress</Badge>
              <Badge className="bg-sage-soft text-sage-ink">Completed</Badge>
              <Badge className="bg-warn-soft text-warn">Due today</Badge>
              <Badge className="bg-cream text-cream-ink">Break</Badge>
            </div>

            <Separator />

            <div className="grid max-w-md gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sg-title">Homework title</Label>
                <Input id="sg-title" placeholder="Quadratic equations, exercises 4-11" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sg-error">With error</Label>
                <Input id="sg-error" aria-invalid defaultValue="" placeholder="Required" />
                <p className="text-[13px] text-danger">Give this task a title.</p>
              </div>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------ */}
        <Section
          id="empty"
          title="Empty states"
          note="Every major page has one. The copy should read like a person wrote it."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <EmptyState
              icon={BookOpen}
              headline="Nothing due yet."
              body="Enjoy the free time, or add a task if you have one."
              action={<Button size="sm">Add homework</Button>}
            />
            <EmptyState
              headline="You're currently free."
              body="Nothing is timetabled right now. Biology starts at 10:30."
            />
          </div>
        </Section>

        {/* ------------------------------------------------------------ */}
        <Section
          id="spacing"
          title="Spacing"
          note="4px base. Card padding 20 on mobile and 24 on desktop; 32-40 between sections; page gutter 20 / 32 / 48."
        >
          <div className="space-y-2">
            {[4, 8, 12, 16, 20, 24, 32, 40, 48].map((n) => (
              <div key={n} className="flex items-center gap-4">
                <code className="w-12 shrink-0 text-[11px] text-ink-subtle">{n}px</code>
                <div className="h-3 rounded-sm bg-sage-soft" style={{ width: n * 4 }} />
              </div>
            ))}
          </div>
        </Section>

        {/* ------------------------------------------------------------ */}
        <Section
          id="motion"
          title="Motion"
          note="Three uses only: section entrance on mount, the hover lift, and the progress bar's width transition. Everything is suppressed under prefers-reduced-motion."
        >
          <MotionDemo />
        </Section>

        <p className="pb-8 text-center text-xs text-ink-subtle">
          Phase 0 · foundation only
        </p>
      </div>
    </div>
  );
}
