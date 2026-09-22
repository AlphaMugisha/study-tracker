import { CalendarDays } from "lucide-react";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";

export const metadata = { title: "Timetable" };

export default function TimetablePage() {
  return (
    <PhasePlaceholder
      title="Timetable"
      description="Your school week, by day or at a glance."
      icon={CalendarDays}
      phase="Phase 4"
      headline="Upload your school timetable to get started."
      body="You will be able to upload a photo or PDF, check what we read from it, correct anything that is wrong, and confirm. Adding entries by hand works too."
    />
  );
}
