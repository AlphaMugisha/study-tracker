/**
 * Page cost in ROUND TRIPS, not milliseconds.
 *
 *   npm run perf                      # against a local `next start` on 4400
 *   npm run perf -- https://your.app  # against a deployment
 *
 * Requires PERF_EMAIL and PERF_PASSWORD for the account to measure as.
 *
 * Wall-clock is useless here: the latency to this Supabase project drifted
 * from 214ms to 854ms between two runs minutes apart, which swamps any code
 * change. So for each page we measure a bare Supabase round trip immediately
 * alongside it and report the ratio. That number only moves when the number
 * of sequential round trips the page makes changes — which is the thing the
 * code controls.
 */
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const base = process.argv[2] ?? "http://localhost:4400";
// No defaults. A real address and password as fallbacks would mean committing
// working credentials to a public repository, which is worth more than the
// convenience of not typing them.
const EMAIL = process.env.PERF_EMAIL;
const PASSWORD = process.env.PERF_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("");
  console.error("Set PERF_EMAIL and PERF_PASSWORD to the account to measure as:");
  console.error("  PERF_EMAIL=you@example.com PERF_PASSWORD=... npm run perf");
  console.error("");
  process.exit(1);
}
const ref = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\./i)?.[1];

const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const session = await login.json();
const payload = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
const nm = `sb-${ref}-auth-token`;
const cs = [];
if (payload.length <= 3180) cs.push(`${nm}=${payload}`);
else for (let i = 0, k = 0; i < payload.length; i += 3180, k++) cs.push(`${nm}.${k}=${payload.slice(i, i + 3180)}`);
const cookie = cs.join("; ");
const authHeaders = { apikey: anon, Authorization: `Bearer ${session.access_token}` };

const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function timed(fn) {
  const t = performance.now();
  await fn();
  return performance.now() - t;
}

const baseline = () => timed(() => fetch(`${url}/auth/v1/user`, { headers: authHeaders }).then((r) => r.text()));
const load = (p) => timed(() => fetch(`${base}${p}`, { headers: { cookie } }).then((r) => r.text()));

const PAGES = ["/dashboard", "/homework", "/timetable", "/plan", "/settings"];
for (const p of PAGES) await load(p); // warm

console.log("\n  page          round-trips  (page ms / one supabase round trip, median of 5)\n");
for (const p of PAGES) {
  const ratios = [];
  for (let i = 0; i < 5; i++) {
    const b = await baseline();
    const t = await load(p);
    ratios.push(t / b);
  }
  const r = med(ratios);
  const bar = "#".repeat(Math.round(r));
  console.log(`    ${p.padEnd(12)} ${r.toFixed(1).padStart(5)}      ${bar}`);
}
