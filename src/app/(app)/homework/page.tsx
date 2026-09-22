import { ClipboardList } from "lucide-react";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";

export const metadata = { title: "Homework" };

export default function HomeworkPage() {
  return (
    <PhasePlaceholder
      title="Homework"
      description="Everything due, sorted by what needs attention first."
      icon={ClipboardList}
      phase="Phase 6"
      headline="Nothing due yet."
      body="Enjoy the free time, or add a task if you have one."
    />
  );
}
