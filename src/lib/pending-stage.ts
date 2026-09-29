/**
 * Which reassurance belongs to which point in a long wait.
 *
 * Split out of `pending-overlay.tsx` so it can be tested: Node's TypeScript
 * stripping loads a `.ts` file directly but refuses a `.tsx` one, and the
 * alternative to a test here is watching a spinner for two minutes to find
 * out whether the last line ever arrives.
 */

export type PendingStage = {
  /** Seconds elapsed after which this line replaces the one before it. */
  after: number;
  text: string;
};

/**
 * The line to show at `elapsed` seconds, or null if it is still early.
 *
 * The last threshold that has passed rather than the first, so the copy only
 * ever moves forward — thresholds handed over out of order cannot make it
 * flicker between two lines as the seconds tick.
 */
export function stageFor(stages: PendingStage[], elapsed: number): PendingStage | null {
  return [...stages]
    .sort((a, b) => a.after - b.after)
    .reduce<PendingStage | null>((found, s) => (elapsed >= s.after ? s : found), null);
}
