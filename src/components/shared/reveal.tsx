"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * The one entrance animation in the product: a 12px rise over 220ms, staggered
 * 60ms per section. Suppressed entirely under `prefers-reduced-motion`.
 *
 * Used only for a page's top-level sections. Animating rows inside a list
 * makes the page feel busy rather than considered.
 */
export function Reveal({
  children,
  index = 0,
  className,
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? 0.12 : 0.22,
        delay: Math.min(index, 5) * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
