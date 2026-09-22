import { isSupabaseConfigured } from "@/lib/env";

/**
 * Shown above the auth card when the app has no Supabase credentials. This is
 * an operator problem, not a student problem, so the copy is aimed at whoever
 * is running the project rather than at the person trying to sign in.
 */
export function SetupNotice() {
  if (isSupabaseConfigured()) return null;

  return (
    <div className="mb-4 rounded-md border border-warn/25 bg-warn-soft px-4 py-3 text-[13px] leading-5 text-warn">
      <p className="font-medium">Supabase is not connected yet.</p>
      <p className="mt-1">
        Copy <code className="font-mono">.env.example</code> to{" "}
        <code className="font-mono">.env.local</code>, add your project URL and
        anon key, run the migration in{" "}
        <code className="font-mono">supabase/migrations/</code>, then restart the
        dev server. Signing in will not work until then.
      </p>
    </div>
  );
}
