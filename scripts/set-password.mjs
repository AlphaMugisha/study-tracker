/**
 * Set an account's password.
 *
 *   npm run password -- --email you@example.com --password "new password"
 *   npm run password -- --list
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY against the Admin API. That bypasses the
 * normal reset-by-email flow, which is the point: this is the operator escape
 * hatch for locking yourself out of your own project.
 *
 * Server-side only. Never import anything from this file into the app, and
 * never pass a password you intend to keep on a shared machine — it lands in
 * your shell history.
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
  console.error(
    `${RED}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local${RESET}`,
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const has = (name) => args.includes(`--${name}`);

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function listUsers() {
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers });
  if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.users ?? [];
}

const users = await listUsers();

if (has("list") || (!flag("email") && !flag("password"))) {
  console.log(`\n${BOLD}Accounts${RESET}\n`);
  for (const u of users) {
    console.log(`  ${u.email}  ${DIM}${u.id}${RESET}`);
  }
  console.log(
    `\n${DIM}npm run password -- --email <email> --password "<new password>"${RESET}\n`,
  );
  process.exit(0);
}

const email = flag("email");
const password = flag("password");

if (!email || !password) {
  console.error(`${RED}Both --email and --password are required.${RESET}`);
  process.exit(1);
}

// Supabase enforces a minimum of 6 by default; failing here gives a clearer
// message than the API's.
if (password.length < 6) {
  console.error(`${RED}Supabase requires at least 6 characters.${RESET}`);
  process.exit(1);
}

const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error(`${RED}No account with that email.${RESET} Run with --list to see them.`);
  process.exit(1);
}

const res = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ password }),
});

if (!res.ok) {
  console.error(`${RED}Failed: ${res.status} ${await res.text()}${RESET}`);
  process.exit(1);
}

console.log(`\n${GREEN}${BOLD}Password updated for ${user.email}${RESET}`);
if (password.length < 12 || /^[a-z0-9]+$/i.test(password)) {
  console.log(
    `${YELLOW}Note: that is a weak password. Fine for a dev account on your own\n` +
      `project; change it before this holds anything you care about.${RESET}`,
  );
}
console.log();
