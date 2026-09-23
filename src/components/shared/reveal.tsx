"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * The one entrance animation in the product: a 28px rise, staggered 90ms per
 * section.
 *
 * It fires when the block scrolls into view rather than on mount, so content
 * below the fold arrives as you reach it instead of having already animated
 * while you were looking elsewhere. `once` matters -- re-animating on every
 * scroll past turns a considered entrance into a twitch.
 *
 * `amount: 0.15` triggers when a sixth of the block is visible; waiting for
 * half means tall cards never trigger at all on a short viewport.
 *
 * Suppressed entirely under `prefers-reduced-motion`.
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
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{
        duration: reduced ? 0.15 : 0.68,
        delay: Math.min(index, 5) * 0.09,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Word-by-word entrance for a page's opening statement. Only ever used once
 * per page -- on the headline -- because the effect stops reading as
 * deliberate the moment a second element does it too.
 */
export function RevealWords({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const words = text.split(" ");

  if (reduced) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {words.map((word, i) => (
        // The mask needs bottom padding or descenders (g, y, p) get clipped;
        // the negative margin takes that padding back out of the layout.
        <span
          key={`${word}-${i}`}
          className="mr-[0.22em] -mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom"
        >
          <motion.span
            className="inline-block"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: "0%", opacity: 1 }}
            transition={{
              duration: 0.62,
              delay: 0.04 * i,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
