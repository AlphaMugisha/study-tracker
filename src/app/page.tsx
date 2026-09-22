import { redirect } from "next/navigation";

import { DEFAULT_DESTINATION } from "@/lib/auth-redirect";
import { getUser } from "@/lib/auth";

/**
 * There is no marketing site -- StudyFlow is a tool for one person, so the
 * root just routes you to wherever you belong.
 *
 * Phase 9 adds the admin branch here.
 */
export default async function RootPage() {
  const user = await getUser();
  redirect(user ? DEFAULT_DESTINATION : "/login");
}
