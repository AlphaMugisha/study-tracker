import { isSupabaseConfigured } from "@/lib/env";

/**
 * Shown above the auth card when the app has no Supabase credentials. This is
 * an operator problem, not a student problem, so the copy is aimed at whoever
 * is running the project rather than at the person trying to sign in — and it
 * names the variables rather than one particular way of setting them, since
 * the same notice can appear on a deployment where `.env.local` is meaningless.
 */
export function SetupNotice() {
  if (isSupabaseConfigured()) return null;

  return (
    <div className="mb-4 rounded-md border border-warn/25 bg-warn-soft px-4 py-3 text-[13px] leading-5 text-warn">
      <p className="font-medium">Supabase is not connected yet.</p>
      <p className="mt-1">
        Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> — in{" "}
        <code className="font-mono">.env.local</code> locally, or in the host&apos;s
        environment settings when deployed — and run the migrations in{" "}
        <code className="font-mono">supabase/migrations/</code>. Signing in will
        not work until then.
      </p>
    </div>
  );
}
