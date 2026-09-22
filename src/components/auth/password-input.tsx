"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  /** Label announced to screen readers on the toggle, e.g. "password". */
  describes?: string;
};

export function PasswordInput({
  className,
  describes = "password",
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const liveId = useId();

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("h-10 pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? `Hide ${describes}` : `Show ${describes}`}
        aria-pressed={visible}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-ink-subtle transition-colors hover:text-ink"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
      </button>
      {/* Announce the state change; the icon swap alone is silent. */}
      <span id={liveId} aria-live="polite" className="sr-only">
        {visible ? `${describes} visible` : `${describes} hidden`}
      </span>
    </div>
  );
}
