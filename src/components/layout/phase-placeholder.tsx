import type { LucideIcon } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Temporary page body for routes that exist so navigation is reviewable but
 * whose feature lands in a later phase. Every one of these gets replaced --
 * none of this ships to the student.
 */
export function PhasePlaceholder({
  eyebrow,
  title,
  description,
  icon,
  phase,
  headline,
  body,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  phase: string;
  headline: string;
  body: string;
}) {
  return (
    <PageContainer>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <EmptyState icon={icon} headline={headline} body={body} />
      <p className="mt-4 text-center text-xs text-ink-subtle">
        Scaffolded route · built in {phase}
      </p>
    </PageContainer>
  );
}
