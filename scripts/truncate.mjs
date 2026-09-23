/**
 * Clear all academic data from the project.
 *
 *   npm run truncate -- --dry-run          show what would go
 *   npm run truncate -- --yes              do it
 *   npm run truncate -- --yes --accounts   also delete the accounts themselves
 *
 * What it deletes, in dependency order: activity logs, study sessions,
 * revision tasks, assignments, timetable entries, timetable versions,
 * subjects, and support links — for EVERY user in the project.
 *
 * What it keeps, unless --accounts is passed: auth users and their profiles.
 * Deleting those locks you out of your own project, and "truncate the data"
 * almost never means "and take my login with it". That has to be asked for.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY, so it bypasses RLS. That is the point — it
 * is an operator tool. Nothing in src/ imports it.
 */

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (!url || !serviceKey) {
  console.error(`${RED}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY${RESET}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const confirmed = args.includes("--yes");
const alsoAccounts = args.includes("--accounts");

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function api(path, init = {}) {
  const res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

/**
 * Child tables first. Most of these would cascade from `subjects` or
 * `timetable_versions` anyway, but deleting explicitly means the count you
 * see is the count that went, rather than a number the database inferred.
 */
const TABLES = [
  "activity_logs",
  "study_sessions",
  "revision_tasks",
  "assignments",
  "timetable_entries",
  "timetable_versions",
  "subjects",
  "admin_student_links",
];

console.log(`\n${BOLD}Truncate${RESET}  ${DIM}${url}${RESET}\n`);

const counts = {};
for (const t of TABLES) {
  const rows = await api(`/rest/v1/${t}?select=id`);
  counts[t] = rows.length;
  console.log(`  ${t.padEnd(22)} ${String(rows.length).padStart(5)} rows`);
}

const users = await api(`/auth/v1/admin/users?per_page=200`);
const accountList = users.users ?? [];
console.log(`  ${"accounts".padEnd(22)} ${String(accountList.length).padStart(5)}  ${DIM}${alsoAccounts ? "will be DELETED" : "kept"}${RESET}`);

const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (dryRun || !confirmed) {
  console.log(
    `\n${YELLOW}Nothing deleted.${RESET} ${total} rows would go.\n` +
      `${DIM}Re-run with --yes to actually do it.${RESET}\n`,
  );
  process.exit(0);
}

console.log(`\n${YELLOW}Deleting…${RESET}`);
for (const t of TABLES) {
  if (counts[t] === 0) continue;
  // PostgREST refuses an unfiltered DELETE, which is a good default. `id` is
  // a uuid on every one of these, so "not null" matches all rows.
  await api(`/rest/v1/${t}?id=not.is.null`, { method: "DELETE" });
  const left = await api(`/rest/v1/${t}?select=id`);
  const gone = left.length === 0;
  console.log(`  ${gone ? GREEN + "cleared" + RESET : RED + "REMAINS" + RESET}  ${t}  ${DIM}${counts[t]} -> ${left.length}${RESET}`);
}

if (alsoAccounts) {
  for (const u of accountList) {
    await api(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    console.log(`  ${GREEN}removed${RESET}  ${u.email}`);
  }
} else {
  // profiles survive via the accounts; confirm they did.
  const profiles = await api(`/rest/v1/profiles?select=id`);
  console.log(`\n  ${DIM}${profiles.length} profile(s) kept — you can still sign in.${RESET}`);
}

console.log(`\n${GREEN}${BOLD}Done.${RESET}\n`);
