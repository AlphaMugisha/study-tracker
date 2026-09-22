import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/actions/auth";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="outline" size="sm">
        <LogOut aria-hidden="true" data-icon="inline-start" />
        Sign out
      </Button>
    </form>
  );
}
