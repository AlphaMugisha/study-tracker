/**
 * Connectivity and schema check: is the frontend actually wired to the
 * database, and does that database have what Phase 1 needs?
 *
 * Read-only. Creates nothing, changes nothing.
 *
 *   npm run db:check
 *
 * Uses the anon key only -- exactly what the browser gets -- so a pass here
 * means the real app will work, not just that some privileged connection can
 * reach Postgres.
 */

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";

let failures = 0;
let warnings = 0;

function pass(label, detail = "") {
  console.log(`  ${GREEN}PASS${RESET}  ${label}${detail ? `  ${DIM}${detail}${RESET}` : ""}`);
}
function fail(label, detail = "") {
  failures += 1;
  console.log(`  ${RED}FAIL${RESET}  ${label}${detail ? `  ${DIM}${detail}${RESET}` : ""}`);
}
function warn(label, detail = "") {
  warnings += 1;
  console.log(`  ${YELLOW}WARN${RESET}  ${label}${detail ? `  ${DIM}${detail}${RESET}` : ""}`);
}
function section(title) {
  console.log(`\n${BOLD}${title}${RESET}`);
}

// ---------------------------------------------------------------------------
section("1. Environment");

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

if (!url) {
  fail("NEXT_PUBLIC_SUPABASE_URL is set");
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) {
  warn("NEXT_PUBLIC_SUPABASE_URL looks unusual", url);
} else {
  pass("NEXT_PUBLIC_SUPABASE_URL is set", url);
}

if (!anonKey) {
  fail("NEXT_PUBLIC_SUPABASE_ANON_KEY is set");
} else if (anonKey.startsWith("sb_secret_") || anonKey.startsWith("service_role")) {
  fail("NEXT_PUBLIC_SUPABASE_ANON_KEY holds a SECRET key", "use the anon/publishable key, never service_role");
} else {
  pass("NEXT_PUBLIC_SUPABASE_ANON_KEY is set", `${anonKey.slice(0, 12)}…  (${anonKey.length} chars)`);
}

// A legacy anon key is a JWT whose `ref` claim must match the project URL.
// Mismatched pairs are a common copy-paste error and produce confusing 401s.
if (anonKey.split(".").length === 3) {
  try {
    const claims = JSON.parse(Buffer.from(anonKey.split(".")[1], "base64url").toString("utf8"));
    if (claims.role && claims.role !== "anon") {
      fail("anon key has the wrong role claim", `role=${claims.role}`);
    }
    if (claims.ref && url && !url.includes(claims.ref)) {
      fail("anon key belongs to a different project", `key ref=${claims.ref}, url=${url}`);
    } else if (claims.ref) {
      pass("anon key matches the project URL", `ref=${claims.ref}`);
    }
  } catch {
    warn("could not decode the anon key as a JWT", "fine if it is a new-format key");
  }
}

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  pass("SUPABASE_SERVICE_ROLE_KEY present", "not required until Phase 2");
}

if (failures > 0) {
  console.log(
    `\n${RED}Stopping: fill in .env.local first.${RESET}\n` +
      `${DIM}Supabase dashboard -> Project Settings -> API${RESET}\n`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
section("2. Reaching the project");

const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

async function req(path, init = {}) {
  const started = Date.now();
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  return { res, ms: Date.now() - started };
}

try {
  const { res, ms } = await req("/auth/v1/health");
  if (res.ok) pass("Auth service reachable", `${res.status} in ${ms}ms`);
  else fail("Auth service reachable", `HTTP ${res.status}`);
} catch (error) {
  fail("Auth service reachable", error.message);
  console.log(
    `\n${RED}Could not reach ${url}.${RESET}\n` +
      `${DIM}Check the URL, your internet connection, and that the project is not paused.${RESET}\n`,
  );
  process.exit(1);
}

try {
  const { res, ms } = await req("/rest/v1/");
  if (res.status === 401 || res.status === 403) {
    fail("REST API accepts the anon key", `HTTP ${res.status} — key rejected`);
  } else if (res.ok) {
    pass("REST API accepts the anon key", `${res.status} in ${ms}ms`);
  } else {
    warn("REST API responded unexpectedly", `HTTP ${res.status}`);
  }
} catch (error) {
  fail("REST API reachable", error.message);
}

// ---------------------------------------------------------------------------
section("3. Phase 1 schema");

/**
 * As `anon` with no session, selecting from `profiles` SHOULD be refused with
 * 42501 (permission denied). That is the migration's `revoke all from anon`
 * working. A 42P01 / PGRST205 instead means the table is not there.
 */
try {
  const { res } = await req("/rest/v1/profiles?select=id&limit=1");
  const body = await res.json().catch(() => ({}));
  const code = body?.code ?? "";

  if (code === "42P01" || code === "PGRST205" || res.status === 404) {
    fail("profiles table exists", "not found — has the migration been run?");
  } else if (code === "42501" || res.status === 401 || res.status === 403) {
    pass("profiles table exists and anon is correctly locked out", `code ${code || res.status}`);
  } else if (res.ok && Array.isArray(body)) {
    fail(
      "anon is locked out of profiles",
      `returned ${body.length} row(s) — RLS or grants are NOT applied`,
    );
  } else {
    warn("unexpected response from profiles", `HTTP ${res.status} ${code}`);
  }
} catch (error) {
  fail("profiles table reachable", error.message);
}

/** Same logic for is_admin(): execute is granted to `authenticated` only. */
try {
  const { res } = await req("/rest/v1/rpc/is_admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await res.json().catch(() => ({}));
  const code = body?.code ?? "";

  if (code === "PGRST202" || res.status === 404) {
    fail("is_admin() function exists", "not found — has the migration been run?");
  } else {
    pass("is_admin() function exists", `code ${code || res.status}`);
  }
} catch (error) {
  warn("could not probe is_admin()", error.message);
}

// ---------------------------------------------------------------------------
section("4. Auth settings");

try {
  const { res } = await req("/auth/v1/settings");
  const body = await res.json().catch(() => ({}));

  if (res.ok) {
    const emailEnabled = body?.external?.email !== false;
    if (emailEnabled) pass("email/password signup is enabled");
    else fail("email/password signup is enabled", "enable it under Authentication -> Providers");

    if (body?.disable_signup === true) {
      fail("new signups are allowed", "signup is disabled in project settings");
    } else {
      pass("new signups are allowed");
    }

    const autoconfirm = body?.mailer_autoconfirm;
    if (autoconfirm === true) {
      pass("email confirmation is OFF", "signup lands straight on /dashboard");
    } else if (autoconfirm === false) {
      warn(
        "email confirmation is ON",
        'signup will show "Check your email" — add /auth/callback to Redirect URLs',
      );
    }
  } else {
    warn("could not read auth settings", `HTTP ${res.status}`);
  }
} catch (error) {
  warn("could not read auth settings", error.message);
}

// ---------------------------------------------------------------------------
console.log("");
if (failures > 0) {
  console.log(`${RED}${BOLD}${failures} check(s) failed.${RESET} ${DIM}${warnings} warning(s).${RESET}\n`);
  process.exit(1);
}
console.log(
  `${GREEN}${BOLD}Database connected.${RESET} ${DIM}${warnings} warning(s).${RESET}\n` +
    `${DIM}Next: npm run dev, then create an account at /signup${RESET}\n`,
);
