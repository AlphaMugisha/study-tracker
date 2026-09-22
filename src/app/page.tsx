import { redirect } from "next/navigation";

export default function RootPage() {
  // Phase 1 replaces this with a role-aware redirect:
  // signed out -> /login, student -> /dashboard, admin -> /admin
  redirect("/dashboard");
}
