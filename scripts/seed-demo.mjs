/**
 * Development/demo dataset for one student.
 *
 *   npm run seed -- --email you@example.com
 *   npm run seed -- --email you@example.com --reset
 *   npm run seed -- --email you@example.com --reset-only --yes
 *   npm run seed -- --email student@example.com --link-admin you@example.com
 *
 * Why this exists: Phases 3-7 (timetable engine, Current Activity Card, home
 * planner) cannot be built or judged against empty tables. This produces a
 * believable school week so those features have something real to render.
 *
 * Separation from production data:
 *   - it lives in scripts/, is never imported by the app, and nothing in
 *     src/ knows it exists
 *   - it refuses to run without an explicit --email
 *   - --reset deletes that ONE user's academic data and nothing else; it
 *     never touches auth.users, profiles, or any other account
 *
 * All dates are relative to today, so the demo stays current instead of
 * rotting into a week of past-due homework.
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
  console.error(`${RED}Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local${RESET}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = flag("email")?.toLowerCase();
const doReset = args.includes("--reset") || args.includes("--reset-only");
const resetOnly = args.includes("--reset-only");

if (!email) {
  console.error(
    `${RED}--email is required.${RESET}\n` +
      `${DIM}Seeding is scoped to one account on purpose, so it can never spray demo data across a project.${RESET}`,
  );
  process.exit(1);
}
if (resetOnly && !args.includes("--yes")) {
  console.error(`${RED}--reset-only deletes data. Add --yes to confirm.${RESET}`);
  process.exit(1);
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
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  }
  return body;
}

/**
 * PostgREST rejects a bulk insert whose objects have differing key sets
 * ("All object keys must match"), so fill every row out to the union of keys.
 * Explicit null lets the column default apply where the value is absent.
 */
function squareOff(rows) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k] ?? null])));
}

const insert = (table, rows) =>
  api(`/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(squareOff(rows)),
  });

// --- dates -----------------------------------------------------------------
const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const shift = (days) => {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return iso(d);
};
/** Next occurrence of a weekday (1 = Mon .. 5 = Fri), today counting. */
const nextWeekday = (target) => {
  const d = new Date(today);
  const cur = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() + ((target - cur + 7) % 7));
  return iso(d);
};

// --- resolve the account ---------------------------------------------------
const adminUsers = await api("/auth/v1/admin/users?per_page=200");
const user = (adminUsers?.users ?? []).find((u) => u.email?.toLowerCase() === email);

if (!user) {
  console.error(`\n${RED}No account with email ${email}${RESET}\n`);
  process.exit(1);
}
const uid = user.id;
console.log(`\n${BOLD}Seeding demo data${RESET}  ${DIM}${email}${RESET}`);

// --- reset -----------------------------------------------------------------
// Order matters: children before parents, even though most FKs cascade.
if (doReset) {
  const tables = [
    "study_sessions",
    "activity_logs",
    "assignments",
    "revision_tasks",
    "timetable_entries",
    "timetable_versions",
    "subjects",
  ];
  for (const t of tables) {
    await api(`/rest/v1/${t}?user_id=eq.${uid}`, { method: "DELETE" });
  }
  console.log(`  ${YELLOW}reset${RESET}   cleared this account's academic data`);
  if (resetOnly) {
    console.log(`\n${GREEN}Done.${RESET}\n`);
    process.exit(0);
  }
}

// --- subjects --------------------------------------------------------------
const subjectSpec = [
  ["Mathematics", "Maths", "chart-1"],
  ["English", "Eng", "chart-2"],
  ["Physics", "Phys", "chart-4"],
  ["Computer Science", "CS", "chart-3"],
  ["Biology", "Bio", "chart-5"],
  ["Chemistry", "Chem", "chart-4"],
  ["History", "Hist", "chart-3"],
];

const subjects = await insert(
  "subjects",
  subjectSpec.map(([name, short_name, color_token]) => ({
    user_id: uid,
    name,
    short_name,
    color_token,
  })),
);
const S = Object.fromEntries(subjects.map((s) => [s.name, s.id]));
console.log(`  subjects ${subjects.length}`);

// --- timetable -------------------------------------------------------------
const [version] = await insert("timetable_versions", [
  {
    user_id: uid,
    name: "Term 2 timetable",
    status: "active",
    source_type: "manual",
    confirmed_at: new Date().toISOString(),
    effective_from: shift(-30),
    extraction_meta: { seeded: true, note: "development demo data" },
  },
]);

/** [day, start, end, subject | null, activity_type, title, room] */
const week = [
  // Monday
  [1, "07:30", "08:30", "Mathematics", "class", null, "B12"],
  [1, "08:30", "09:30", "English", "class", null, "A04"],
  [1, "09:30", "10:00", null, "break", "Break", null],
  [1, "10:00", "11:00", "Physics", "class", null, "Lab 2"],
  [1, "11:00", "12:00", "Computer Science", "class", null, "ICT 1"],
  [1, "12:00", "13:00", null, "break", "Lunch", null],
  [1, "13:00", "14:00", "Biology", "class", null, "Lab 1"],
  [1, "14:00", "15:00", "Mathematics", "class", null, "B12"],
  // Tuesday
  [2, "07:30", "08:30", "Chemistry", "class", null, "Lab 3"],
  [2, "08:30", "09:30", "Mathematics", "class", null, "B12"],
  [2, "09:30", "10:00", null, "break", "Break", null],
  [2, "10:00", "11:00", "History", "class", null, "C07"],
  [2, "11:00", "12:00", "English", "class", null, "A04"],
  [2, "12:00", "13:00", null, "break", "Lunch", null],
  [2, "13:00", "14:00", null, "free", "Private study", "Library"],
  [2, "14:00", "15:00", "Physics", "class", null, "Lab 2"],
  // Wednesday
  [3, "07:30", "08:30", "English", "class", null, "A04"],
  [3, "08:30", "09:30", "Biology", "class", null, "Lab 1"],
  [3, "09:30", "10:00", null, "break", "Break", null],
  [3, "10:00", "11:00", "Mathematics", "class", null, "B12"],
  [3, "11:00", "12:00", "Chemistry", "class", null, "Lab 3"],
  [3, "12:00", "13:00", null, "break", "Lunch", null],
  [3, "13:00", "14:30", null, "other", "Games", "Field"],
  // Thursday
  [4, "07:30", "08:30", "Computer Science", "class", null, "ICT 1"],
  [4, "08:30", "09:30", "Physics", "class", null, "Lab 2"],
  [4, "09:30", "10:00", null, "break", "Break", null],
  [4, "10:00", "11:00", "Mathematics", "class", null, "B12"],
  [4, "11:00", "12:00", "History", "class", null, "C07"],
  [4, "12:00", "13:00", null, "break", "Lunch", null],
  [4, "13:00", "14:00", "English", "class", null, "A04"],
  [4, "14:00", "15:00", "Biology", "class", null, "Lab 1"],
  // Friday
  [5, "07:30", "08:30", "Mathematics", "class", null, "B12"],
  [5, "08:30", "09:30", "Chemistry", "class", null, "Lab 3"],
  [5, "09:30", "10:00", null, "break", "Break", null],
  [5, "10:00", "11:00", "Computer Science", "class", null, "ICT 1"],
  [5, "11:00", "12:00", "English", "class", null, "A04"],
  [5, "12:00", "13:00", null, "break", "Lunch", null],
  [5, "13:00", "14:00", null, "other", "Assembly", "Hall"],
];

const entries = await insert(
  "timetable_entries",
  week.map(([day, start, end, subject, kind, title, room]) => ({
    user_id: uid,
    timetable_version_id: version.id,
    subject_id: subject ? S[subject] : null,
    activity_type: kind,
    title,
    day_of_week: day,
    start_time: start,
    end_time: end,
    room,
  })),
);
console.log(`  timetable ${entries.length} entries across Mon-Fri  ${DIM}(school ends 15:00)${RESET}`);

// --- assignments -----------------------------------------------------------
const assignments = await insert("assignments", [
  {
    user_id: uid, subject_id: S["Mathematics"],
    title: "Algebra problem set", description: "Exercises 4 to 11, show working.",
    due_date: shift(0), due_time: "17:00",
    priority: "high", estimated_minutes: 45, status: "in_progress",
  },
  {
    user_id: uid, subject_id: S["Physics"],
    title: "Forces worksheet", description: "Free-body diagrams for questions 1 to 6.",
    due_date: shift(1), due_time: "08:00",
    priority: "high", estimated_minutes: 40, status: "not_started",
  },
  {
    user_id: uid, subject_id: S["English"],
    title: "Persuasive essay", description: "600 words. Plan first, then draft.",
    due_date: shift(3),
    priority: "medium", estimated_minutes: 60, status: "not_started",
  },
  {
    user_id: uid, subject_id: S["Biology"],
    title: "Cell division revision notes", description: "Summarise mitosis and meiosis.",
    due_date: nextWeekday(5),
    priority: "medium", estimated_minutes: 35, status: "not_started",
  },
  {
    user_id: uid, subject_id: S["Computer Science"],
    title: "Sorting algorithms exercise", description: "Implement bubble and insertion sort.",
    // Deliberately in the past and unfinished, so the overdue path has
    // something to render.
    due_date: shift(-2), due_time: "16:00",
    priority: "high", estimated_minutes: 50, status: "not_started",
  },
  {
    user_id: uid, subject_id: S["History"],
    title: "Source analysis", description: "Compare the two accounts.",
    due_date: shift(-4),
    priority: "low", estimated_minutes: 30, status: "completed",
  },
  {
    user_id: uid, subject_id: S["Chemistry"],
    title: "Balancing equations practice", description: "Worksheet 3.",
    due_date: shift(5),
    priority: "low", estimated_minutes: 25, status: "not_started",
  },
]);
console.log(`  assignments ${assignments.length}  ${DIM}(1 overdue, 1 due today, 1 completed)${RESET}`);

// --- revision tasks --------------------------------------------------------
const revision = await insert("revision_tasks", [
  {
    user_id: uid, subject_id: S["Biology"],
    title: "Biology revision", description: "Photosynthesis recap.",
    scheduled_date: shift(0), estimated_minutes: 30, priority: "medium",
  },
  {
    user_id: uid, subject_id: S["Chemistry"],
    title: "Chemistry equations drill", scheduled_date: shift(1),
    estimated_minutes: 20, priority: "low",
  },
  {
    user_id: uid, subject_id: S["History"],
    title: "Timeline recall", scheduled_date: shift(2),
    estimated_minutes: 25, priority: "low",
  },
]);
console.log(`  revision tasks ${revision.length}`);

// --- study sessions --------------------------------------------------------
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const sessions = await insert("study_sessions", [
  {
    user_id: uid, subject_id: S["Mathematics"], assignment_id: assignments[0].id,
    started_at: hoursAgo(26), ended_at: hoursAgo(25.25),
  },
  {
    user_id: uid, subject_id: S["History"], assignment_id: assignments[5].id,
    started_at: hoursAgo(50), ended_at: hoursAgo(49.5),
  },
  {
    user_id: uid, subject_id: S["Biology"], revision_task_id: revision[0].id,
    started_at: hoursAgo(73), ended_at: hoursAgo(72.5),
  },
]);
console.log(`  study sessions ${sessions.length}`);

// --- activity log ----------------------------------------------------------
const logs = await insert(
  "activity_logs",
  [
    ["timetable_confirmed", "timetable_version", version.id, { entries: entries.length }],
    ["assignment_created", "assignment", assignments[0].id, { title: assignments[0].title }],
    ["assignment_started", "assignment", assignments[0].id, { title: assignments[0].title }],
    ["assignment_completed", "assignment", assignments[5].id, { title: assignments[5].title }],
    ["study_session_completed", "study_session", sessions[0].id, { minutes: 45 }],
    ["revision_created", "revision_task", revision[0].id, { title: revision[0].title }],
  ].map(([activity_type, entity_type, entity_id, metadata]) => ({
    user_id: uid,
    actor_id: uid,
    activity_type,
    entity_type,
    entity_id,
    metadata: { ...metadata, seeded: true },
  })),
);
console.log(`  activity log ${logs.length} events`);

// --- read it back ----------------------------------------------------------
const mondayCheck = await api(
  `/rest/v1/timetable_entries?user_id=eq.${uid}&day_of_week=eq.1&select=start_time,end_time,activity_type,title,subjects(name)&order=start_time`,
);

console.log(`\n${BOLD}Monday, read back through the API${RESET}`);
for (const e of mondayCheck) {
  const label = e.subjects?.name ?? e.title;
  console.log(`  ${e.start_time.slice(0, 5)}-${e.end_time.slice(0, 5)}  ${label}`);
}

// --- optional: grant a support account access to this student --------------
/**
 * `--link-admin <email>` creates an ACTIVE link from that admin to the student
 * just seeded, so the support dashboard has something to show.
 *
 * This is a seeding shortcut and it is worth naming as such: in the product an
 * admin can only ever create a PENDING request, and the STUDENT is the only
 * one who can activate it. That rule is enforced by RLS, which is exactly why
 * this needs the service-role key — the app has no path to do this, and
 * nothing here changes that. It is for demoing your own two accounts.
 */
const linkAdmin = flag("link-admin");
if (linkAdmin) {
  const admins = await api("/auth/v1/admin/users?per_page=200");
  const adminUser = (admins.users ?? []).find(
    (u) => u.email?.toLowerCase() === linkAdmin.toLowerCase(),
  );

  if (!adminUser) {
    console.log(`
  ${RED}No account with email ${linkAdmin} - link skipped.${RESET}`);
  } else if (adminUser.id === uid) {
    console.log(`
  ${RED}--link-admin matches --email - link skipped.${RESET}`);
  } else {
    const profiles = await api(`/rest/v1/profiles?id=eq.${adminUser.id}&select=role`);
    if (profiles[0]?.role !== "admin") {
      console.log(
        `
  ${YELLOW}${linkAdmin} is not an admin.${RESET} ` +
          `Run: npm run role -- --email ${linkAdmin} --role admin`,
      );
    } else {
      await api(
        `/rest/v1/admin_student_links?admin_id=eq.${adminUser.id}&student_id=eq.${uid}`,
        { method: "DELETE" },
      );
      await insert("admin_student_links", [
        {
          admin_id: adminUser.id,
          student_id: uid,
          status: "active",
          note: "Seeded demo link",
        },
      ]);
      console.log(
        `
  ${GREEN}support link${RESET}  ${linkAdmin} can now see ${email}
` +
          `  ${DIM}(seeded directly; in the app the student must approve)${RESET}`,
      );
    }
  }
}

console.log(`\n${GREEN}${BOLD}Demo data seeded.${RESET} ${DIM}Re-run with --reset to replace it.${RESET}\n`);
