"use client";

import { Button } from "@/components/ui/button";
import { withdrawAccessAction } from "@/lib/actions/support";

/**
 * End a link from the admin's side — withdrawing a request, or handing back
 * access that is no longer needed.
 *
 * A plain form: it is a mutation, and it works without JavaScript.
 */
export function WithdrawButton({ id, label }: { id: string; label: string }) {
  return (
    <form action={withdrawAccessAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost">
        {label}
      </Button>
    </form>
  );
}
