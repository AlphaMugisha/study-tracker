"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";

const items = ["Currently", "Up next", "When you get home"];

/**
 * The dashboard's mount entrance, isolated so it can be replayed.
 * 12px rise, 220ms, 60ms stagger -- and nothing at all under
 * `prefers-reduced-motion: reduce`.
 */
export function MotionDemo() {
  const [key, setKey] = useState(0);
  const reduced = useReducedMotion();

  return (
    <div>
      <div key={key} className="grid gap-3 sm:grid-cols-3">
        {items.map((label, i) => (
          <motion.div
            key={label}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduced ? 0.12 : 0.22,
              delay: i * 0.06,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="rounded-xl border border-border bg-card p-4"
          >
            <p className="text-eyebrow uppercase text-ink-subtle">{label}</p>
            <p className="mt-2 text-sm text-ink-muted">Section content</p>
          </motion.div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={() => setKey((k) => k + 1)}
      >
        Replay entrance
      </Button>
      <p className="mt-2 text-xs text-ink-subtle">
        {reduced
          ? "Reduced motion is on in your OS: the rise is suppressed, opacity only."
          : "Turn on your OS reduced-motion setting and replay to verify the fallback."}
      </p>
    </div>
  );
}
