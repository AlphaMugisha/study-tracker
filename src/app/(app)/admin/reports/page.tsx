import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Users } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ItemCard, ItemGrid } from "@/components/shared/item-card";
import { Reveal } from "@/components/shared/reveal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSessionContext } from "@/lib/auth";
import { getOversight } from "@/lib/data/oversight";
import { getLinksAsAdmin, isLive } from "@/lib/data/support";

export const metadata: Metadata = { title: "Daily reports" };

/**
 * The Reports nav entry has to point somewhere before it knows whose reports.
 *
 * With one linked student — the usual case, and this app's case — that is a
 * question with one answer, so this redirects straight through rather than
 * making a parent pick their only child off a list every time. With several
 * it becomes a real choice and gets a real picker.
 */
export default async function ReportsIndexPage() {
  const session = await requireSessionContext();
  if (session.profile?.role !== "admin") redirect("/dashboard");

  // Whose reports follows oversight, same as the reports themselves do.
  const { counterparts, pendingMigration } = await getOversight();
  const roster = pendingMigration
    ? (await getLinksAsAdmin())
        .filter(isLive)
        .map((l) => ({ id: l.student_id, name: l.counterpartName ?? "Student" }))
    : counterparts;

  if (roster.length === 1) redirect(`/admin/${roster[0].id}/reports`);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Daily reports"
        title="Whose reports?"
        description="A report for every day, for each student who has given you access."
      />

      {roster.length === 0 ? (
        <EmptyState
          icon={Users}
          headline={
            pendingMigration ? "Nobody has approved you yet." : "No student accounts yet."
          }
          body={
            pendingMigration
              ? "Apply migration 0008 to see every student, or request access with a student's email."
              : "Anyone who signs up as a student appears here on their own."
          }
          action={
            <Button asChild>
              <Link href="/admin">Go to Students</Link>
            </Button>
          }
        />
      ) : (
        <Reveal>
          <ItemGrid>
            {roster.map((student, i) => (
              <ItemCard
                key={student.id}
                index={i}
                accent="brand"
                href={`/admin/${student.id}/reports`}
                title={student.name}
                meta={<span>Day-by-day record</span>}
                trailing={<ArrowRight aria-hidden="true" className="size-4 text-ink-subtle" />}
              />
            ))}
          </ItemGrid>
        </Reveal>
      )}
    </PageContainer>
  );
}
