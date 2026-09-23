import Link from "next/link";
import { ShieldAlert, Users } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The role-aware slot in the header.
 *
 * It shows different things to the two roles because they need different
 * things, and both are time-sensitive enough to belong on every page:
 *
 *   support account  how many students you can currently see, as a way in to
 *                    the dashboard from wherever you are
 *
 *   student          whether anyone is asking to read your work. That one
 *                    matters most: a request sitting unseen in Settings is a
 *                    decision you did not know you had. It is styled to be
 *                    noticed, and it is the only thing in the header that is.
 *
 * Renders nothing when there is nothing to say — an empty chip reading
 * "0 students" is noise on every page for no benefit.
 */
export function HeaderSupport({
  role,
  studentsVisible,
  pendingForMe,
}: {
  role: string;
  studentsVisible: number;
  pendingForMe: number;
}) {
  // A pending request outranks everything: it is addressed to you and it
  // expires nothing, but it is someone waiting on an answer.
  if (pendingForMe > 0) {
    return (
      <Link
        href="/settings#support"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5",
          "border-pause/50 bg-pause-soft text-[0.85rem] font-medium text-pause-ink",
          "transition-colors duration-150 ease-out-flat hover:border-pause hover:bg-pause-soft/70",
        )}
      >
        <ShieldAlert aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">
          {pendingForMe === 1 ? "1 access request" : `${pendingForMe} access requests`}
        </span>
        <span className="sm:hidden" data-numeric>
          {pendingForMe}
        </span>
      </Link>
    );
  }

  if (role !== "admin") return null;

  return (
    <Link
      href="/admin"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5",
        "border-revise/40 bg-revise-soft text-[0.85rem] font-medium text-revise-ink",
        "transition-colors duration-150 ease-out-flat hover:border-revise hover:bg-revise-soft/70",
      )}
      title="Support account"
    >
      <Users aria-hidden="true" className="size-4" />
      <span className="hidden sm:inline">
        {studentsVisible === 0
          ? "Support account"
          : `${studentsVisible} ${studentsVisible === 1 ? "student" : "students"}`}
      </span>
      <span className="sm:hidden" data-numeric>
        {studentsVisible}
      </span>
    </Link>
  );
}
