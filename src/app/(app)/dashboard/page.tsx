import { Sun } from "lucide-react";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";

export const metadata = { title: "Today" };

export default function DashboardPage() {
  return (
    <PhasePlaceholder
      eyebrow="The one screen that answers the question"
      title="Today"
      description="Currently, up next, when you get home, and what is due soon."
      icon={Sun}
      phase="Phases 5-7"
      headline="The dashboard lands after the timetable engine."
      body="The Current Activity Card is the signature feature, so it is built on top of a tested engine rather than before one. See a static preview of its visual direction on the styleguide page."
    />
  );
}
