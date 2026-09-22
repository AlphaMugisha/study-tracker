import { ListChecks } from "lucide-react";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";

export const metadata = { title: "Home plan" };

export default function PlanPage() {
  return (
    <PhasePlaceholder
      title="When you get home"
      description="A simple, predictable order of work for this evening."
      icon={ListChecks}
      phase="Phase 7"
      headline="Your evening plan appears once school ends."
      body="Built from your homework deadlines and estimated durations, with breaks worked in. You can always move things around."
    />
  );
}
