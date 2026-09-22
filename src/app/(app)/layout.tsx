import { AppShell } from "@/components/layout/app-shell";

/** Every page in here is personal to the signed-in user. Never static. */
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
