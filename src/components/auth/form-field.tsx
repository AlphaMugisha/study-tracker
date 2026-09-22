"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  id,
  label,
  error,
  hint,
  action,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Right-aligned control on the label row, e.g. "Forgot password?". */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-[13px] font-medium text-ink">
          {label}
        </Label>
        {action}
      </div>
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-[13px] leading-5 text-danger"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] leading-5 text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Ties an input to its own error/hint text for screen readers, so the message
 * is announced rather than just being visible.
 */
export function fieldA11yProps(id: string, error?: string, hint?: string) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

export function FormAlert({
  variant = "error",
  title,
  children,
}: {
  variant?: "error" | "success";
  title?: string;
  children: React.ReactNode;
}) {
  const Icon = variant === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-2.5 rounded-md border px-3.5 py-3 text-[13px] leading-5",
        variant === "error"
          ? "border-danger/20 bg-danger-soft text-danger"
          : "border-sage/20 bg-sage-soft text-sage-strong",
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div>
        {title ? <p className="font-medium">{title}</p> : null}
        <p className={cn(title && "mt-0.5")}>{children}</p>
      </div>
    </div>
  );
}
