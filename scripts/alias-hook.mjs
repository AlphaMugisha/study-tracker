/**
 * Resolves the `@/` path alias for plain `node` runs, so the TypeScript under
 * `src/` can be unit-tested without pulling in a bundler or a test framework.
 *
 * Node 24 strips types from `.ts` on its own; the only thing it cannot do is
 * follow tsconfig's `paths`. This hook adds that, and nothing else.
 *
 *   node --import ./scripts/alias-hook.mjs scripts/test-planner.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./alias-resolver.mjs", import.meta.url), pathToFileURL("./"));
