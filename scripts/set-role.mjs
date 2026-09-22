/**
 * Grant or revoke the admin role.
 *
 *   npm run role -- --list
 *   npm run role -- --email you@example.com --role admin
 *   npm run role -- --email you@example.com --role student
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY, which bypasses Row Level Security. That is
 * deliberate and it is the ONLY way a role can change: the migration revokes
 * UPDATE on `profiles.role` from `authenticated`, so no browser session --
 * not even an admin's -- can promote anyone. Promotion is an operator action,
 * performed here or in the SQL editor.
 *
 * Server-side only. Never import anything from this file into the app.
 */

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (!url || !serviceKey) {
  console.error(
    `${RED}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local${RESET}`,
  );
  process.exit(1);
}

if (!serviceKey.startsWith("sb_secret_") && serviceKey.split(".").length !== 3) {
  console.error(`${RED}SUPABASE_SERVICE_ROLE_KEY does not look like a secret key.${RESET}`);
  process.exit(1);
}

// --- args ------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const wantsList = args.includes("--list");
const email = flag("email")?.toLowerCase();
const role = flag("role");

const VALID_ROLES = ["student", "admin"];
if (!wantsList) {
  if (!email) {
    console.error(`${RED}--email is required (or use --list)${RESET}`);
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role ?? "")) {
    console.error(
      `${RED}--role must be one of: ${VALID_ROLES.join(", ")}${RESET}\n` +
        `${DIM}The schema has exactly two roles. There is no "superadmin" --` +
        ` "admin" is the highest.${RESET}`,
    );
    process.exit(1);
  }
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function api(path, init = {}) {
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

/** auth.users is not exposed through PostgREST; the Admin API is. */
async function listAccounts() {
  const { res, body } = await api("/auth/v1/admin/users?per_page=200");
  if (!res.ok) {
    throw new Error(`Admin API returned ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  const users = body?.users ?? [];

  const { res: pRes, body: profiles } = await api("/rest/v1/profiles?select=id,full_name,role,timezone,created_at");
  if (!pRes.ok) {
    throw new Error(`profiles read returned ${pRes.status}: ${JSON.stringify(profiles).slice(0, 200)}`);
  }

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at),
    created_at: u.created_at,
    profile: byId.get(u.id) ?? null,
  }));
}

function printAccounts(accounts) {
  if (accounts.length === 0) {
    console.log(`  ${DIM}(no accounts yet)${RESET}`);
    return;
  }
  for (const a of accounts) {
    const p = a.profile;
    const roleLabel = p ? (p.role === "admin" ? `${GREEN}${BOLD}admin${RESET}` : p.role) : `${RED}NO PROFILE ROW${RESET}`;
    console.log(
      `  ${a.email}\n` +
        `    name     ${p?.full_name ?? "—"}\n` +
        `    role     ${roleLabel}\n` +
        `    timezone ${p?.timezone ?? "—"}\n` +
        `    email    ${a.confirmed ? "confirmed" : `${DIM}not confirmed${RESET}`}\n` +
        `    id       ${DIM}${a.id}${RESET}`,
    );
  }
}

// --- run -------------------------------------------------------------------
const accounts = await listAccounts();

if (wantsList) {
  console.log(`\n${BOLD}Accounts in this project${RESET}\n`);
  printAccounts(accounts);
  console.log("");
  process.exit(0);
}

const target = accounts.find((a) => a.email?.toLowerCase() === email);

if (!target) {
  console.error(`\n${RED}No account with email ${email}${RESET}\n`);
  console.log(`${BOLD}Accounts that do exist:${RESET}\n`);
  printAccounts(accounts);
  console.log("");
  process.exit(1);
}

if (!target.profile) {
  console.error(
    `\n${RED}${target.email} has no profiles row.${RESET}\n` +
      `${DIM}The on_auth_user_created trigger did not fire. Re-run` +
      ` supabase/migrations/0001_auth_and_profiles.sql -- its backfill will` +
      ` create the missing row.${RESET}\n`,
  );
  process.exit(1);
}

const before = target.profile.role;

const { res, body } = await api(`/rest/v1/profiles?id=eq.${target.id}`, {
  method: "PATCH",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({ role }),
});

if (!res.ok) {
  console.error(`\n${RED}Update failed (HTTP ${res.status})${RESET}`);
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

const after = Array.isArray(body) ? body[0] : body;

// Read it back independently rather than trusting the write response.
const { body: verify } = await api(`/rest/v1/profiles?id=eq.${target.id}&select=id,full_name,role`);
const confirmed = Array.isArray(verify) ? verify[0] : null;

console.log(
  `\n${GREEN}${BOLD}Role updated.${RESET}\n\n` +
    `  account  ${target.email}\n` +
    `  name     ${after?.full_name ?? "—"}\n` +
    `  role     ${before}  ->  ${GREEN}${BOLD}${confirmed?.role ?? after?.role}${RESET}\n` +
    `  verified ${confirmed?.role === role ? `${GREEN}yes, re-read from the database${RESET}` : `${RED}MISMATCH${RESET}`}\n`,
);
