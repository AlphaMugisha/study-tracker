import Link from "next/link";
import { ArrowRight, BookOpen, Coffee } from "lucide-react";

import { MotionDemo } from "@/app/styleguide/motion-demo";
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
            Calm, clean, modern, academic, mature. Warm off-white ground, charcoal
            ink, muted sage for what is happening now, soft lavender for what is
            coming, warm cream for breaks. Restrained borders, two shadow steps,
            almost no motion.
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
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Swatch name="Page" varName="--background" className="bg-background" />
            <Swatch name="Card" varName="--card" className="bg-card" />
            <Swatch
              name="Sunken"
              varName="--surface-sunken"
              className="bg-surface-sunken"
            />
            <Swatch
              name="Ink"
              varName="--ink"
              className="bg-ink"
              textClassName="text-white"
              contrast="12.9:1 on page"
            />
            <Swatch
              name="Ink muted"
              varName="--ink-muted"
              className="bg-ink-muted"
              textClassName="text-white"
              contrast="6.0:1 on page"
            />
          </div>

          <h3 className="mb-3 text-sm font-medium text-ink">Accents</h3>
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Swatch
              name="Sage"
              varName="--sage"
              className="bg-sage"
              textClassName="text-white"
              contrast="4.6:1 w/ white"
            />
            <Swatch
              name="Sage strong"
              varName="--sage-strong"
              className="bg-sage-strong"
              textClassName="text-white"
            />
            <Swatch
              name="Sage soft"
              varName="--sage-soft"
              className="bg-sage-soft"
              textClassName="text-sage-strong"
              contrast="6.2:1 w/ strong"
            />
            <Swatch
              name="Lavender"
              varName="--lavender"
              className="bg-lavender"
              textClassName="text-white"
            />
            <Swatch
              name="Lavender strong"
              varName="--lavender-strong"
              className="bg-lavender-strong"
              textClassName="text-white"
            />
            <Swatch
              name="Lavender soft"
              varName="--lavender-soft"
              className="bg-lavender-soft"
              textClassName="text-lavender-strong"
              contrast="6.4:1 w/ strong"
            />
          </div>

          <h3 className="mb-3 text-sm font-medium text-ink">Supporting and status</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Swatch
              name="Cream"
              varName="--cream"
              className="bg-cream"
              textClassName="text-cream-strong"
              contrast="6.3:1 w/ strong"
            />
            <Swatch
              name="Danger"
              varName="--danger"
              className="bg-danger"
              textClassName="text-white"
            />
            <Swatch
              name="Danger soft"
              varName="--danger-soft"
              className="bg-danger-soft"
              textClassName="text-danger"
              contrast="6.1:1"
            />
            <Swatch
              name="Warn"
              varName="--warn"
              className="bg-warn"
              textClassName="text-white"
            />
            <Swatch
              name="Warn soft"
              varName="--warn-soft"
              className="bg-warn-soft"
              textClassName="text-warn"
              contrast="5.5:1"
            />
          </div>
        </Section>

        {/* ------------------------------------------------------------ */}
        <Section
          id="type"
          title="Typography"
          note="One family: Geist Sans, self-hosted. Numerals are tabular wherever a value ticks, so digits do not jitter. Uppercase appears only in the 11px eyebrow label -- nowhere else."
        >
          <div className="space-y-6 rounded-lg border border-border bg-card p-6 shadow-card">
            <div>
              <Eyebrow>Eyebrow · 11 / 600 / 0.1em</Eyebrow>
              <p className="mt-1 text-xs text-ink-subtle">
                The only uppercase in the product
              </p>
            </div>
            <div>
              <p className="text-hero font-semibold text-ink">Mathematics</p>
              <p className="mt-1 text-xs text-ink-subtle">
                Hero · clamp(40px, 5.5vw, 56px) / 600 / -0.03em · current activity only
              </p>
            </div>
            <div>
              <p className="text-display font-semibold text-ink">Good morning, Ava</p>
              <p className="mt-1 text-xs text-ink-subtle">
                Display · clamp(28px, 3.5vw, 32px) / 600 / -0.02em · page titles
              </p>
            </div>
            <div>
              <p className="text-lg font-semibold text-ink">Up next</p>
              <p className="mt-1 text-xs text-ink-subtle">Section · 18 / 600</p>
            </div>
            <div>
              <p className="text-base font-semibold text-ink">Quadratic Equations</p>
              <p className="mt-1 text-xs text-ink-subtle">Card title · 16 / 600</p>
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
          title="Current Activity Card — direction preview"
          note="Static mock, no logic. This exists so the visual direction of the signature card can be approved now; the real component with the live engine arrives in Phase 5."
        >
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-lg border border-border bg-card p-6 shadow-card sm:p-8">
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-sage" aria-hidden="true" />
                <Eyebrow className="text-sage-strong">Currently</Eyebrow>
              </div>

              <p className="mt-4 text-hero font-semibold text-ink">Mathematics</p>
              <p className="mt-1 text-[15px] text-ink-muted">Quadratic Equations</p>

              <div
                className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1"
                data-numeric
              >
                <span className="text-xl font-medium text-ink">09:00 — 10:00</span>
                <span className="text-xl font-semibold text-sage-strong">
                  32 minutes remaining
                </span>
              </div>

              <div className="mt-5">
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
                  role="progressbar"
                  aria-valuenow={47}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Lesson progress"
                >
                  <div className="h-full w-[47%] rounded-full bg-sage" />
                </div>
                <div
                  className="mt-2 flex justify-between text-xs text-ink-subtle"
                  data-numeric
                >
                  <span>28 min elapsed</span>
                  <span>60 min lesson</span>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                <p className="text-sm text-ink-muted">
                  Next:{" "}
                  <span className="font-medium text-ink">English</span>
                  <span className="text-ink-subtle"> · 10:00</span>
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/timetable">View timetable</Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-4 content-start">
              <div className="rounded-lg border border-border bg-card p-5 shadow-card">
                <Eyebrow className="text-lavender-strong">Up next</Eyebrow>
                <p className="mt-2.5 text-lg font-semibold text-ink">English</p>
                <p className="mt-0.5 text-sm text-ink-muted" data-numeric>
                  10:00 — 11:00
                </p>
              </div>

              <div className="rounded-lg border border-border bg-cream p-5">
                <div className="flex items-center gap-2">
                  <Coffee aria-hidden="true" className="size-3.5 text-cream-strong" />
                  <Eyebrow className="text-cream-strong">Break variant</Eyebrow>
                </div>
                <p className="mt-2.5 text-lg font-semibold text-ink">Break</p>
                <p className="mt-0.5 text-sm text-cream-strong" data-numeric>
                  10:00 — 10:30 · 20 minutes remaining
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card p-5 shadow-card">
                <Eyebrow>School day complete</Eyebrow>
                <p className="mt-2.5 text-lg font-semibold text-ink">
                  School is done for today.
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  Your plan for home starts at 16:30.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------ */}
        <Section
          id="cards"
          title="Cards and elevation"
          note="A 1px border plus one very soft shadow. Only cards that are actually clickable lift on hover -- static cards stay put, which is what keeps the page calm."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Static card</CardTitle>
              </CardHeader>
              <CardContent className="text-ink-muted">
                Border, 10px radius, shadow-card. Does not move.
              </CardContent>
            </Card>

            <Card className="card-interactive cursor-pointer hover:border-ink-subtle/40">
              <CardHeader>
                <CardTitle>Interactive card</CardTitle>
              </CardHeader>
              <CardContent className="text-ink-muted">
                Hover me: 1px rise, one shadow step, 150ms.
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
              ["shadow-card", "shadow-card"],
              ["shadow-card-hover", "shadow-card-hover"],
              ["shadow-overlay", "shadow-overlay"],
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
              ["rounded-sm", "6px · buttons"],
              ["rounded-md", "8px · inputs"],
              ["rounded-lg", "10px · cards"],
              ["rounded-xl", "14px · rare"],
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
          <div className="space-y-6 rounded-lg border border-border bg-card p-6 shadow-card">
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
              <Badge className="bg-lavender-soft text-lavender-strong">In progress</Badge>
              <Badge className="bg-sage-soft text-sage-strong">Completed</Badge>
              <Badge className="bg-warn-soft text-warn">Due today</Badge>
              <Badge className="bg-cream text-cream-strong">Break</Badge>
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
