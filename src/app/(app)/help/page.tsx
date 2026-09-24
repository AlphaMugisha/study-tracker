import type { Metadata } from "next";
import { Lightbulb } from "lucide-react";

import { HelpDialog } from "@/components/help/help-dialog";
import { HelpList, HelpMigrationNotice } from "@/components/help/help-list";
import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Reveal } from "@/components/shared/reveal";
import { Block, BlockHeading } from "@/components/shared/surface";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSessionContext } from "@/lib/auth";
import { getHelpRequests } from "@/lib/data/help";
import { getSubjects } from "@/lib/data/timetable";

export const metadata: Metadata = { title: "Stuck on" };

/**
 * Her list of things she does not understand.
 *
 * This is the one page in the app that is not about scheduling. Everything
 * else answers "what, and by when"; this answers "what is actually going
 * wrong", which is the thing that does not surface on its own — homework gets
 * ticked off whether or not it was understood.
 */
export default async function HelpPage() {
  const session = await requireSessionContext();
  const [help, subjects] = await Promise.all([
    getHelpRequests(session.user.id),
    getSubjects(),
  ]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Stuck on"
        title="Things that have not clicked yet."
        description="Write down what you do not understand. Anyone supporting you sees this list, so putting it here counts as asking — you do not have to raise it twice."
        action={<HelpDialog subjects={subjects} />}
      />

      {help.pendingMigration ? (
        <HelpMigrationNotice />
      ) : help.open.length === 0 && help.resolved.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          headline="Nothing on the list."
          body="When something does not make sense, put it here rather than hoping it comes up again. It usually does not."
          action={<HelpDialog subjects={subjects} />}
        />
      ) : (
        <div className="space-y-rhythm md:space-y-rhythm-lg">
          <Block id="open">
            <Reveal>
              <BlockHeading
                eyebrow="Still stuck"
                tone="danger"
                title={
                  help.open.length === 0
                    ? "Nothing outstanding."
                    : `${help.open.length} thing${help.open.length === 1 ? "" : "s"} to sort out.`
                }
                description="Oldest first is not the order here — everything on this list is worth the same amount of not-knowing."
              />
            </Reveal>
            <Reveal index={1}>
              <HelpList
                entries={help.open}
                emptyLabel="Nothing outstanding right now."
              />
            </Reveal>
          </Block>

          {help.resolved.length > 0 ? (
            <Block id="sorted">
              <Reveal>
                <BlockHeading
                  eyebrow="Sorted"
                  tone="brand"
                  title="Things you worked out."
                  description="Kept rather than deleted. A topic that comes back is worth seeing twice."
                />
              </Reveal>
              <Reveal index={1}>
                <HelpList entries={help.resolved} />
              </Reveal>
            </Block>
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}
