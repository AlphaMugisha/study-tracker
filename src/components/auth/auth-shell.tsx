"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { LogoMark } from "@/components/layout/logo";

/**
 * The centred authentication layout.
 *
 * Heading and subheading sit *outside* the card so the card stays small and
 * the typography carries the page -- the card is a container for inputs, not
 * the whole composition. Nothing decorative: no gradient, no glass, no blobs.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-12 sm:py-16">
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0.15 : 0.26, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[25rem]"
      >
        <div className="mb-8 text-center">
          <Link
            href="/"
            aria-label="StudyFlow home"
            className="inline-flex items-center gap-2.5 rounded-md"
          >
            <LogoMark className="size-6" />
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              StudyFlow
            </span>
          </Link>

          <h1 className="mt-7 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {title}
          </h1>
          <p className="mx-auto mt-2 max-w-[22rem] text-[15px] leading-6 text-ink-muted">
            {subtitle}
          </p>
        </div>

        {children}
      </motion.div>

      <p className="mt-10 text-center text-xs text-ink-subtle">
        A personal academic assistant.
      </p>
    </main>
  );
}

/** The raised surface the inputs live on. */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
      {children}
    </div>
  );
}

/**
 * A recessed strip at the foot of the card for the cross-link between sign in
 * and sign up -- separated by depth rather than by another rule.
 */
export function AuthCardFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-border bg-surface-sunken px-7 py-4 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-sm font-medium text-indigo-ink underline-offset-4 transition-colors hover:text-ink hover:underline"
    >
      {children}
    </Link>
  );
}
