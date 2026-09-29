import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Reveal } from "@/components/shared/reveal";
import { ImportWizard } from "@/components/timetable/import-wizard";
import { requireSessionContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Upload timetable" };

/**
 * Photograph the timetable, check what was read, save it.
 *
 * The alternative is typing forty rows by hand, which is why most timetables
 * never get entered at all — and an app that does not know the school day
 * cannot answer the one question it exists to answer.
 */
export default async function UploadTimetablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSessionContext();

  // `?mode=typed` opens on the typing tab, so the timetable page can link at
  // the thing itself rather than at a page where it has to be found first.
  const params = await searchParams;
  const mode = params.mode === "typed" ? "typed" : "photo";

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Timetable"
        title="Take a photo of it."
        description="Rather than typing out every lesson, upload the timetable and check what comes back. One class's own sheet or the whole year's grid — say which, and you get the last word on every row."
      />
      <Reveal>
        <ImportWizard returnTo="/timetable" initialMode={mode} />
      </Reveal>
    </PageContainer>
  );
}
