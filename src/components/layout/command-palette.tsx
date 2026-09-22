"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CalendarRange, CornerDownLeft, Plus, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { primaryNav, secondaryNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

type Command = {
  id: string;
  label: string;
  hint: string;
  group: "Go to" | "Actions";
  icon: LucideIcon;
  href: string;
};

/**
 * Only destinations and actions that actually exist. A palette that offers to
 * search homework it cannot reach is worse than no palette at all -- this one
 * navigates, and every entry lands somewhere real.
 */
const COMMANDS: Command[] = [
  ...primaryNav.map<Command>((item) => ({
    id: `nav:${item.href}`,
    label: item.label,
    hint: item.href,
    group: "Go to",
    icon: item.icon,
    href: item.href,
  })),
  ...secondaryNav.map<Command>((item) => ({
    id: `nav:${item.href}`,
    label: item.label,
    hint: item.href,
    group: "Go to",
    icon: item.icon,
    href: item.href,
  })),
  {
    id: "action:new-homework",
    label: "Add homework",
    hint: "Log a new assignment",
    group: "Actions",
    icon: Plus,
    href: "/homework?new=1",
  },
  {
    id: "action:week-view",
    label: "See the whole week",
    hint: "Timetable, Monday to Friday",
    group: "Actions",
    icon: CalendarRange,
    href: "/timetable?view=week",
  },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (c) =>
        c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q),
    );
  }, [query]);

  // Clamp during render rather than in an effect -- the list can shrink on any
  // keystroke and a stale index would highlight nothing.
  const activeIndex = results.length === 0 ? -1 : Math.min(active, results.length - 1);

  const run = (command: Command) => {
    onOpenChange(false);
    setQuery("");
    setActive(0);
    router.push(command.href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (results.length ? (Math.min(i, results.length - 1) + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) =>
        results.length ? (Math.min(i, results.length - 1) - 1 + results.length) % results.length : 0,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      run(results[activeIndex]);
    }
  };

  let lastGroup: Command["group"] | null = null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        <DialogTitle className="sr-only">Search StudyFlow</DialogTitle>

        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
          {/* autoFocus is correct here: the palette exists to be typed into. */}
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search pages and actions…"
            aria-label="Search pages and actions"
            className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-subtle"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-ink-subtle sm:block">
            ESC
          </kbd>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink-subtle">
              Nothing matches “{query}”.
            </p>
          ) : (
            results.map((command, index) => {
              const Icon = command.icon;
              const showGroup = command.group !== lastGroup;
              lastGroup = command.group;

              return (
                <div key={command.id}>
                  {showGroup ? (
                    <p className="px-3 pt-3 pb-1.5 text-eyebrow text-ink-subtle">
                      {command.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => run(command)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      index === activeIndex
                        ? "bg-surface-raised text-ink"
                        : "text-ink-muted hover:bg-surface-raised/60",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0",
                        index === activeIndex ? "text-indigo-ink" : "text-ink-subtle",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {command.label}
                      </span>
                      <span className="block truncate text-[11px] text-ink-subtle">
                        {command.hint}
                      </span>
                    </span>
                    {index === activeIndex ? (
                      <CornerDownLeft
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-ink-subtle"
                      />
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Binds Cmd/Ctrl+K anywhere in the app. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}
