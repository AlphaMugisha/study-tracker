import { Settings } from "lucide-react";

import { PhasePlaceholder } from "@/components/layout/phase-placeholder";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PhasePlaceholder
      title="Settings"
      description="Your name, timezone, when your day ends, and who can support you."
      icon={Settings}
      phase="Phases 1 and 9"
      headline="Settings arrive with accounts."
      body="This is also where you will see exactly which support account has access to your academic progress, and precisely what they can and cannot see."
    />
  );
}
