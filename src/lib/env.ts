import { z } from "zod";

/**
 * Environment access, validated at the point of use.
 *
 * Phase 0 deliberately runs with NO configuration at all -- the app must boot,
 * render and be reviewable before a Supabase project exists. So instead of
 * validating at import time (which would crash the dev server on a fresh
 * clone), each consumer calls the getter it needs and gets an actionable error
 * only if that feature is actually exercised.
 *
 * `NEXT_PUBLIC_*` vars must be referenced as literal `process.env.X` property
 * accesses for Next to inline them into the client bundle. Do not refactor
 * these into a dynamic lookup.
 */

const supabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a full URL, e.g. https://xxxx.supabase.co"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
});

export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;

function readSupabaseEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/** True when the browser/server Supabase clients can be constructed. */
export function isSupabaseConfigured(): boolean {
  return supabaseEnvSchema.safeParse(readSupabaseEnv()).success;
}

export function getSupabaseEnv(): SupabaseEnv {
  const parsed = supabaseEnvSchema.safeParse(readSupabaseEnv());

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `  - ${i.message}`).join("\n");
    throw new Error(
      `Supabase is not configured.\n${missing}\n\n` +
        `Copy .env.example to .env.local and fill in your project's values.`,
    );
  }

  return parsed.data;
}

/**
 * Server-only. Bypasses RLS -- use exclusively in trusted server code such as
 * the seed script. Never import this from anything that reaches the browser.
 */
export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. It is required for admin-level " +
        "server tasks (seeding, migrations) and must never be exposed to the client.",
    );
  }
  return key;
}

/**
 * Which timetable extraction provider to use.
 * Phase 0-7 run on `mock`; `anthropic` is wired up in Phase 8.
 */
export function getExtractionProvider(): "mock" | "anthropic" {
  return process.env.TIMETABLE_EXTRACTOR === "anthropic" ? "anthropic" : "mock";
}
