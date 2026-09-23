/**
 * Renders every authenticated page against a real session and asserts the
 * seeded data actually reaches the HTML.
 *
 *   node --env-file-if-exists=.env.local scripts/smoke-ui.mjs http://localhost:4400
 *
 * Creates a throwaway account, seeds it through the same REST API the app
 * uses, mints a Supabase session cookie in the format @supabase/ssr expects,
 * fetches each page, then deletes the account. Nothing real is touched.
 */

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";

const base = (process.argv[2] ?? "http://localhost:4400").replace(/\/+$/, "");
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

const projectRef = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\./i)?.[1];
if (!url || !anonKey || !serviceKey || !projectRef) {
  console.error(`${RED}Missing Supabase config in .env.local${RESET}`);
  process.exitCode = 1;
  process.exit();
}

const results = [];
const rec = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  console.log(
    `  ${passed ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`}  ${name}` +
      (detail ? `  ${DIM}${detail}${RESET}` : ""),
  );
};

const service = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

async function sb(path, init = {}) {
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...service, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

/**
 * @supabase/ssr stores the session as `base64-<base64url(JSON)>` under
 * `sb-<ref>-auth-token`, splitting into `.0`, `.1`… when it exceeds ~3180
 * characters. Reproduced here so the server sees exactly what a browser sends.
 */
function sessionCookies(session) {
  const value = "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const name = `sb-${projectRef}-auth-token`;
  const LIMIT = 3180;

  if (value.length <= LIMIT) return [`${name}=${value}`];

  const chunks = [];
  for (let i = 0; i < value.length; i += LIMIT) chunks.push(value.slice(i, i + LIMIT));
  return chunks.map((c, i) => `${name}.${i}=${c}`);
}

const stamp = Date.now();
const email = `studyflow-uismoke-${stamp}@example.com`;
const password = `Smk-${stamp}-${Math.random().toString(36).slice(2, 10)}`;
let userId = null;

async function cleanup() {
  if (!userId) return;
  try {
    await sb(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
  } catch (e) {
    console.log(`${RED}could not delete ${email}: ${e.message}${RESET}`);
  }
}

try {
  console.log(`\n${BOLD}UI smoke test${RESET}  ${DIM}${base}${RESET}`);

  // --- account + data ------------------------------------------------------
  const user = await sb("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Smoke Tester", timezone: "Africa/Kigali" },
    }),
  });
  userId = user.id;

  const subjects = await sb("/rest/v1/subjects", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      { user_id: userId, name: "Mathematics", short_name: "Maths", color_token: "chart-1" },
      { user_id: userId, name: "Physics", short_name: "Phys", color_token: "chart-4" },
    ]),
  });

  const [version] = await sb("/rest/v1/timetable_versions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      {
        user_id: userId,
        name: "Smoke timetable",
        status: "active",
        confirmed_at: new Date().toISOString(),
      },
    ]),
  });

  // Seed the CURRENT weekday, not a fixed Monday: the timetable page defaults
  // to today, so a fixed day would leave it legitimately empty and the check
  // would fail for the wrong reason. Weekends fall back to Monday, which is
  // exactly what the page does.
  const jsDay = new Date().getDay();
  const weekday = jsDay === 0 || jsDay === 6 ? 1 : jsDay;

  await sb("/rest/v1/timetable_entries", {
    method: "POST",
    body: JSON.stringify(
      [
        ["07:30", "08:30", subjects[0].id, "class", null],
        ["08:30", "09:30", subjects[1].id, "class", null],
        ["09:30", "10:00", null, "break", "Break"],
        ["10:00", "11:00", subjects[0].id, "class", null],
      ].map(([start, end, subject_id, activity_type, title]) => ({
        user_id: userId,
        timetable_version_id: version.id,
        subject_id,
        activity_type,
        title,
        day_of_week: weekday,
        start_time: start,
        end_time: end,
        room: null,
        teacher: null,
      })),
    ),
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  await sb("/rest/v1/assignments", {
    method: "POST",
    body: JSON.stringify([
      {
        user_id: userId,
        subject_id: subjects[0].id,
        title: "Quadratic equations practice",
        description: null,
        due_date: todayIso,
        due_time: "17:00",
        priority: "high",
        estimated_minutes: 45,
        status: "in_progress",
      },
      {
        user_id: userId,
        subject_id: subjects[1].id,
        title: "Forces worksheet overdue",
        description: null,
        due_date: "2020-01-01",
        due_time: null,
        priority: "high",
        estimated_minutes: 40,
        status: "not_started",
      },
    ]),
  });

  await sb("/rest/v1/revision_tasks", {
    method: "POST",
    body: JSON.stringify([
      {
        user_id: userId,
        subject_id: subjects[1].id,
        title: "Physics formula recall",
        estimated_minutes: 25,
      },
    ]),
  });

  // --- session -------------------------------------------------------------
  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`sign in failed: ${login.status}`);
  const session = await login.json();
  const cookie = sessionCookies(session).join("; ");

  console.log(`  ${DIM}account + data created, session minted${RESET}\n`);

  // --- render --------------------------------------------------------------
  async function page(path) {
    const res = await fetch(`${base}${path}`, { headers: { cookie }, redirect: "manual" });
    const html = await res.text();
    return { status: res.status, html, location: res.headers.get("location") };
  }

  const checks = [
    ["/dashboard", ["Today", "Currently", "Up next", "When you get home", "Due soon"]],
    ["/dashboard", ["Quadratic equations practice"]],
    // The shell itself: sidebar, search affordance and the day stats strip.
    ["/dashboard", ["Collapse sidebar", "Ctrl K", "Lessons today", "Work tonight"]],
    ["/dashboard", ["Rest of today"]],
    ["/timetable", ["Timetable", "Mathematics", "Break", "07:30"]],
    ["/timetable?view=week", ["Monday", "Friday"]],
    ["/homework", ["Homework", "Overdue", "Quadratic equations practice", "Add homework"]],
    ["/plan", ["When you get home", "Physics formula recall"]],
    // The planner: a single answer, a timeline, and session controls.
    ["/plan", ["Start with", "The order to work in", "Start this"]],
    // Subject management and the planning window.
    ["/settings", ["Subjects", "Add a subject", "Finish work by", "Wind-down after school"]],
    ["/settings", ["Settings", "Smoke Tester", "Support access", "Sign out"]],
  ];

  for (const [path, needles] of checks) {
    const r = await page(path);
    if (r.status !== 200) {
      rec(`${path} renders`, false, `HTTP ${r.status}${r.location ? ` -> ${r.location}` : ""}`);
      continue;
    }
    const missing = needles.filter((n) => !r.html.includes(n));
    rec(
      `${path} — ${needles.join(", ").slice(0, 60)}`,
      missing.length === 0,
      missing.length ? `missing: ${missing.join(", ")}` : `${(r.html.length / 1024) | 0}KB`,
    );
  }

  // Signed out, the same pages must still bounce to /login.
  const guarded = await fetch(`${base}/dashboard`, { redirect: "manual" });
  rec(
    "signed out, /dashboard still redirects",
    guarded.status === 307 && (guarded.headers.get("location") ?? "").includes("/login"),
    `HTTP ${guarded.status}`,
  );
} catch (error) {
  console.error(`\n${RED}Aborted: ${error.message}${RESET}`);
  results.push({ name: "suite completed", passed: false, detail: error.message });
} finally {
  await cleanup();
  console.log(`\n${DIM}cleaned up ${email}${RESET}`);
}

const failed = results.filter((r) => !r.passed);
console.log("");
if (failed.length) {
  console.log(`${RED}${BOLD}${failed.length} of ${results.length} checks failed.${RESET}\n`);
  process.exitCode = 1;
} else {
  console.log(`${GREEN}${BOLD}All ${results.length} UI checks passed.${RESET}\n`);
}
