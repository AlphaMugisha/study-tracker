/**
 * End-to-end RLS verification against the REAL Supabase project, over HTTP,
 * using real signed-in users.
 *
 *   npm run db:verify:live
 *
 * `db:verify:local` proves the SQL is correct against a shimmed Postgres.
 * This proves the same thing through the actual API surface the browser uses:
 * real JWTs, real PostgREST, real policies.
 *
 * It creates four temporary accounts, exercises every isolation and
 * authorisation scenario, and deletes them again in a finally block. Test
 * accounts are prefixed `studyflow-rlstest-` so a stray one is obvious.
 *
 * Nothing belonging to a real user is touched.
 */

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

const results = [];
const created = [];

const rec = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  const tag = passed ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
  console.log(`  ${tag}  ${name}${detail ? `  ${DIM}${detail}${RESET}` : ""}`);
};

const service = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const asUser = (token) => ({ apikey: anonKey, Authorization: `Bearer ${token}` });
const today = () => new Date().toISOString().slice(0, 10);

async function call(path, { headers = {}, method = "GET", body, prefer } = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, body: json };
}

/** A call RLS should stop: either an error, or a filter that matched nothing. */
const blocked = (r) => !r.ok || (Array.isArray(r.body) && r.body.length === 0);
const rows = (r) => (Array.isArray(r.body) ? r.body.length : "-");

const stamp = Date.now();
const password = `Tst-${stamp}-${Math.random().toString(36).slice(2, 10)}`;

async function makeUser(label, role = "student") {
  const email = `studyflow-rlstest-${label}-${stamp}@example.com`;

  const mk = await call("/auth/v1/admin/users", {
    headers: service,
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `RLS Test ${label}`, timezone: "UTC" },
    },
  });
  if (!mk.ok) throw new Error(`create ${label}: ${JSON.stringify(mk.body).slice(0, 300)}`);
  created.push(mk.body.id);

  if (role === "admin") {
    const up = await call(`/rest/v1/profiles?id=eq.${mk.body.id}`, {
      headers: service,
      method: "PATCH",
      body: { role: "admin" },
      prefer: "return=representation",
    });
    if (!up.ok) throw new Error(`promote ${label}: ${JSON.stringify(up.body).slice(0, 300)}`);
  }

  const login = await call("/auth/v1/token?grant_type=password", {
    headers: { apikey: anonKey },
    method: "POST",
    body: { email, password },
  });
  if (!login.ok) throw new Error(`sign in ${label}: ${JSON.stringify(login.body).slice(0, 300)}`);

  return { id: mk.body.id, email, h: asUser(login.body.access_token) };
}

async function cleanup() {
  // Report failures loudly. Swallowing them once left a test account and its
  // data behind in a real project without anyone noticing.
  const stuck = [];
  for (const id of created) {
    try {
      const r = await call(`/auth/v1/admin/users/${id}`, { headers: service, method: "DELETE" });
      if (!r.ok) stuck.push(`${id}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    } catch (e) {
      stuck.push(`${id}: ${e.message}`);
    }
  }
  if (stuck.length) {
    console.log(`
${RED}Could not delete ${stuck.length} test account(s):${RESET}`);
    for (const s of stuck) console.log(`  ${s}`);
    results.push({ name: "test accounts cleaned up", passed: false, detail: `${stuck.length} left behind` });
  }
}

async function run() {
  console.log(`\n${BOLD}Live RLS verification${RESET}  ${DIM}${url}${RESET}`);

  const probe = await call("/rest/v1/admin_student_links?select=id&limit=1", { headers: service });
  if (probe.status === 404 || probe.body?.code === "PGRST205" || probe.body?.code === "42P01") {
    throw new Error(
      "Migration 0002 is not applied to this project. Run " +
        "supabase/migrations/0002_core_schema.sql in the Supabase SQL Editor first.",
    );
  }

  console.log(`\n${BOLD}setup${RESET}`);
  const ava = await makeUser("ava");
  const ben = await makeUser("ben");
  const sara = await makeUser("sara", "admin");
  const omar = await makeUser("omar", "admin");
  console.log(`  ${DIM}4 temporary accounts created${RESET}`);

  // --- a student owns their data -------------------------------------------
  console.log(`\n${BOLD}student ownership${RESET}`);

  const subj = await call("/rest/v1/subjects", {
    headers: ava.h, method: "POST", prefer: "return=representation",
    body: { user_id: ava.id, name: "Mathematics", short_name: "Maths" },
  });
  rec("a student can create their own subject", subj.ok, `HTTP ${subj.status}`);
  const subjectId = subj.ok ? subj.body[0].id : null;

  const asg = await call("/rest/v1/assignments", {
    headers: ava.h, method: "POST", prefer: "return=representation",
    body: {
      user_id: ava.id, subject_id: subjectId, title: "Quadratic equations",
      due_date: today(), priority: "high", estimated_minutes: 45,
    },
  });
  rec("a student can create their own assignment", asg.ok, `HTTP ${asg.status}`);
  const assignmentId = asg.ok ? asg.body[0].id : null;

  const mine = await call("/rest/v1/assignments?select=id,title", { headers: ava.h });
  rec("a student can read their own assignment", mine.ok && rows(mine) === 1, `rows: ${rows(mine)}`);

  // Student B needs a subject of their own, so the composite-FK checks later
  // have a real id that belongs to somebody else.
  const benSubj = await call("/rest/v1/subjects", {
    headers: ben.h, method: "POST", prefer: "return=representation",
    body: { user_id: ben.id, name: "Chemistry", short_name: "Chem" },
  });
  const benSubjectId = benSubj.ok ? benSubj.body[0].id : null;

  // --- isolation between students ------------------------------------------
  console.log(`\n${BOLD}isolation${RESET}`);

  const benSees = await call("/rest/v1/assignments?select=id", { headers: ben.h });
  rec("student B cannot see student A's assignments", rows(benSees) === 0, `rows: ${rows(benSees)}`);

  const benForge = await call("/rest/v1/assignments", {
    headers: ben.h, method: "POST", prefer: "return=representation",
    body: { user_id: ava.id, title: "planted", due_date: today() },
  });
  rec("student B cannot create rows owned by student A", !benForge.ok,
      `HTTP ${benForge.status} ${benForge.body?.code ?? ""}`);

  const benEdit = await call(`/rest/v1/assignments?id=eq.${assignmentId}`, {
    headers: ben.h, method: "PATCH", prefer: "return=representation", body: { title: "hacked" },
  });
  rec("student B cannot edit student A's assignment", blocked(benEdit),
      `HTTP ${benEdit.status}, rows ${rows(benEdit)}`);

  const escalate = await call(`/rest/v1/profiles?id=eq.${ava.id}`, {
    headers: ava.h, method: "PATCH", prefer: "return=representation", body: { role: "admin" },
  });
  rec("a student cannot change their own role", !escalate.ok,
      `HTTP ${escalate.status} ${escalate.body?.code ?? ""}`);

  // --- admin authorisation --------------------------------------------------
  console.log(`\n${BOLD}admin authorisation${RESET}`);

  const unlinked = await call("/rest/v1/assignments?select=id", { headers: sara.h });
  rec("an unlinked admin sees nothing", rows(unlinked) === 0, `rows: ${rows(unlinked)}`);

  const selfActivate = await call("/rest/v1/admin_student_links", {
    headers: sara.h, method: "POST", prefer: "return=representation",
    body: { admin_id: sara.id, student_id: ava.id, status: "active" },
  });
  // Either refused, or `status` was not grantable and fell back to pending.
  const createdStatus = selfActivate.body?.[0]?.status;
  rec("an admin cannot create an already-active link",
      !selfActivate.ok || createdStatus === "pending",
      `HTTP ${selfActivate.status}, status=${createdStatus ?? selfActivate.body?.code ?? "-"}`);

  let linkId = selfActivate.ok ? selfActivate.body[0].id : null;
  if (linkId) {
    rec("an admin may request access", true, "landed as pending");
  } else {
    const req = await call("/rest/v1/admin_student_links", {
      headers: sara.h, method: "POST", prefer: "return=representation",
      body: { admin_id: sara.id, student_id: ava.id, note: "Support for term 2" },
    });
    rec("an admin may request access", req.ok, `HTTP ${req.status}`);
    linkId = req.ok ? req.body[0].id : null;
  }

  const pendingSees = await call("/rest/v1/assignments?select=id", { headers: sara.h });
  rec("a pending link grants no access", rows(pendingSees) === 0, `rows: ${rows(pendingSees)}`);

  const adminActivate = await call(`/rest/v1/admin_student_links?id=eq.${linkId}`, {
    headers: sara.h, method: "PATCH", prefer: "return=representation", body: { status: "active" },
  });
  rec("an admin cannot activate their own link", blocked(adminActivate),
      `HTTP ${adminActivate.status}, rows ${rows(adminActivate)}`);

  const studentSees = await call("/rest/v1/admin_student_links?select=id,status", { headers: ava.h });
  rec("the student can see the request", rows(studentSees) === 1,
      `status: ${studentSees.body?.[0]?.status ?? "-"}`);

  const grant = await call(`/rest/v1/admin_student_links?id=eq.${linkId}`, {
    headers: ava.h, method: "PATCH", prefer: "return=representation", body: { status: "active" },
  });
  rec("the student can grant access", grant.ok && grant.body?.[0]?.status === "active",
      `HTTP ${grant.status}`);

  const linkedRead = await call("/rest/v1/assignments?select=id,title", { headers: sara.h });
  rec("a linked admin CAN read the student's assignments", linkedRead.ok && rows(linkedRead) === 1,
      `rows: ${rows(linkedRead)}`);

  const otherAdmin = await call("/rest/v1/assignments?select=id", { headers: omar.h });
  rec("a different admin is unaffected by that link", rows(otherAdmin) === 0, `rows: ${rows(otherAdmin)}`);

  const adminEdit = await call(`/rest/v1/assignments?id=eq.${assignmentId}`, {
    headers: sara.h, method: "PATCH", prefer: "return=representation", body: { title: "edited by admin" },
  });
  rec("a linked admin cannot EDIT the student's work", blocked(adminEdit),
      `HTTP ${adminEdit.status}, rows ${rows(adminEdit)}`);

  const adminDelete = await call(`/rest/v1/assignments?id=eq.${assignmentId}`, {
    headers: sara.h, method: "DELETE", prefer: "return=representation",
  });
  rec("a linked admin cannot DELETE the student's work", blocked(adminDelete),
      `HTTP ${adminDelete.status}`);

  const revoke = await call(`/rest/v1/admin_student_links?id=eq.${linkId}`, {
    headers: ava.h, method: "PATCH", prefer: "return=representation", body: { status: "revoked" },
  });
  rec("the student can revoke", revoke.ok && revoke.body?.[0]?.status === "revoked",
      `revoked_at stamped: ${Boolean(revoke.body?.[0]?.revoked_at)}`);

  const afterRevoke = await call("/rest/v1/assignments?select=id", { headers: sara.h });
  rec("REVOKING removes access immediately", rows(afterRevoke) === 0, `rows: ${rows(afterRevoke)}`);

  const reActivate = await call(`/rest/v1/admin_student_links?id=eq.${linkId}`, {
    headers: sara.h, method: "PATCH", prefer: "return=representation", body: { status: "active" },
  });
  rec("an admin cannot re-activate a revoked link", blocked(reActivate), `HTTP ${reActivate.status}`);

  // --- 0005: requesting by email, and name visibility ------------------------
  console.log(`
${BOLD}support access (0005)${RESET}`);

  // Preflight. Without this, "a student cannot call request_student_access"
  // passes with a 404 when the function simply does not exist — a test that
  // succeeds because the feature is missing is worse than no test.
  const probe0005 = await call("/rest/v1/rpc/request_student_access", {
    headers: service, method: "POST",
    body: { student_email: "probe@example.invalid", request_note: null },
  });
  const has0005 = probe0005.body?.code !== "PGRST202" && probe0005.status !== 404;
  rec("migration 0005 is applied", has0005,
      has0005 ? "request_student_access exists" : "run 0005_support_access.sql");

  // A student must never be able to mint a request, even via the function.
  const studentRpc = await call("/rest/v1/rpc/request_student_access", {
    headers: ava.h, method: "POST",
    body: { student_email: `${ben.email}`, request_note: "let me in" },
  });
  rec("a student cannot call request_student_access",
      has0005 && !studentRpc.ok && studentRpc.body?.code !== "PGRST202",
      `HTTP ${studentRpc.status} ${studentRpc.body?.code ?? ""}`);

  const badEmail = await call("/rest/v1/rpc/request_student_access", {
    headers: omar.h, method: "POST",
    body: { student_email: "nobody-here@example.invalid", request_note: null },
  });
  rec("requesting an unknown email fails cleanly",
      has0005 && !badEmail.ok && badEmail.body?.code !== "PGRST202",
      `HTTP ${badEmail.status}`);

  const rpcReq = await call("/rest/v1/rpc/request_student_access", {
    headers: omar.h, method: "POST",
    body: { student_email: ben.email, request_note: "Maths support" },
  });
  rec("an admin can request access by email", rpcReq.ok, `HTTP ${rpcReq.status}`);

  const rpcLinkId = typeof rpcReq.body === "string" ? rpcReq.body : null;

  const rpcPendingRead = await call("/rest/v1/assignments?select=id", { headers: omar.h });
  rec("requesting by email grants nothing on its own",
      has0005 && rows(rpcPendingRead) === 0, `rows: ${rows(rpcPendingRead)}`);

  // The student must be able to see WHO is asking, or consent is uninformed.
  const studentSeesAdminName = await call(
    `/rest/v1/profiles?select=id,full_name&id=eq.${omar.id}`, { headers: ben.h },
  );
  rec("the student can see the requesting admin's name",
      studentSeesAdminName.ok && rows(studentSeesAdminName) === 1,
      `rows: ${rows(studentSeesAdminName)}`);

  // ...but a stranger with no link must not be readable.
  const strangerProfile = await call(
    `/rest/v1/profiles?select=id&id=eq.${ava.id}`, { headers: ben.h },
  );
  // Meaningful only once the policy has been WIDENED — before 0005 every
  // profile but your own is hidden, so this would pass trivially.
  rec("an unrelated student's profile stays hidden",
      has0005 && rows(strangerProfile) === 0, `rows: ${rows(strangerProfile)}`);

  if (rpcLinkId) {
    await call(`/rest/v1/admin_student_links?id=eq.${rpcLinkId}`, {
      headers: ben.h, method: "PATCH", body: { status: "active" },
    });
    const linkedName = await call(
      `/rest/v1/profiles?select=id,full_name&id=eq.${ben.id}`, { headers: omar.h },
    );
    rec("a linked admin can read the student's name",
        linkedName.ok && rows(linkedName) === 1, `rows: ${rows(linkedName)}`);

    const adminEditsProfile = await call(`/rest/v1/profiles?id=eq.${ben.id}`, {
      headers: omar.h, method: "PATCH", prefer: "return=representation",
      body: { full_name: "renamed by admin" },
    });
    rec("a linked admin cannot EDIT the student's profile", blocked(adminEditsProfile),
        `HTTP ${adminEditsProfile.status}, rows ${rows(adminEditsProfile)}`);

    const adminReadsLog = await call(
      `/rest/v1/activity_logs?select=id&user_id=eq.${ben.id}`, { headers: omar.h },
    );
    rec("a linked admin can read the activity log", adminReadsLog.ok,
        `HTTP ${adminReadsLog.status}`);
  }

  const studentMintsLink = await call("/rest/v1/admin_student_links", {
    headers: ava.h, method: "POST", prefer: "return=representation",
    body: { admin_id: ava.id, student_id: ben.id },
  });
  rec("a student cannot create an authorisation link", !studentMintsLink.ok,
      `HTTP ${studentMintsLink.status} ${studentMintsLink.body?.code ?? ""}`);

  // --- 0006: "I don't understand this" --------------------------------------
  console.log(`
${BOLD}help requests (0006)${RESET}`);

  // Preflight, same reason as 0005: without it every "an admin cannot write"
  // check below passes because the TABLE is missing, not because a policy
  // stopped anything.
  const probe0006 = await call("/rest/v1/help_requests?select=id&limit=1", { headers: service });
  const has0006 = probe0006.status !== 404 && probe0006.body?.code !== "PGRST205";
  rec("migration 0006 is applied", has0006,
      has0006 ? "help_requests exists" : "run 0006_help_requests.sql");

  if (has0006) {
    const logged = await call("/rest/v1/help_requests", {
      headers: ava.h, method: "POST", prefer: "return=representation",
      body: { user_id: ava.id, topic: "Completing the square", subject_id: subjectId },
    });
    rec("a student can log something she does not understand", logged.ok, `HTTP ${logged.status}`);
    const helpId = logged.ok ? logged.body[0].id : null;

    rec("a new entry starts open with no resolved_at",
        logged.ok && logged.body[0].status === "open" && logged.body[0].resolved_at === null,
        `status: ${logged.body?.[0]?.status}`);

    const resolve = await call(`/rest/v1/help_requests?id=eq.${helpId}`, {
      headers: ava.h, method: "PATCH", prefer: "return=representation",
      body: { status: "resolved" },
    });
    rec("resolving stamps resolved_at from the trigger",
        resolve.ok && Boolean(resolve.body?.[0]?.resolved_at),
        `resolved_at: ${resolve.body?.[0]?.resolved_at ?? "null"}`);

    const reopen = await call(`/rest/v1/help_requests?id=eq.${helpId}`, {
      headers: ava.h, method: "PATCH", prefer: "return=representation",
      body: { status: "open" },
    });
    rec("reopening clears resolved_at again",
        reopen.ok && reopen.body?.[0]?.resolved_at === null,
        `resolved_at: ${reopen.body?.[0]?.resolved_at ?? "null"}`);

    const blank = await call("/rest/v1/help_requests", {
      headers: ava.h, method: "POST", prefer: "return=representation",
      body: { user_id: ava.id, topic: "   " },
    });
    rec("a blank topic is rejected", !blank.ok, `HTTP ${blank.status} ${blank.body?.code ?? ""}`);

    // The composite FK: her entry cannot point at someone else's subject.
    const crossSubject = await call("/rest/v1/help_requests", {
      headers: ava.h, method: "POST", prefer: "return=representation",
      body: { user_id: ava.id, topic: "Borrowed subject", subject_id: benSubjectId },
    });
    rec("an entry cannot reference another student's subject",
        !crossSubject.ok, `HTTP ${crossSubject.status} ${crossSubject.body?.code ?? ""}`);

    const forge = await call("/rest/v1/help_requests", {
      headers: ava.h, method: "POST", prefer: "return=representation",
      body: { user_id: ben.id, topic: "Filed under someone else" },
    });
    rec("a student cannot file one against another student", !forge.ok,
        `HTTP ${forge.status} ${forge.body?.code ?? ""}`);

    const nosy = await call(`/rest/v1/help_requests?select=id&user_id=eq.${ava.id}`, {
      headers: ben.h,
    });
    rec("an unrelated student cannot read her list", rows(nosy) === 0, `rows: ${rows(nosy)}`);

    // ben's own entry, to test what the LINKED admin (omar) can do with it.
    const bens = await call("/rest/v1/help_requests", {
      headers: ben.h, method: "POST", prefer: "return=representation",
      body: { user_id: ben.id, topic: "Balancing equations" },
    });
    const bensId = bens.ok ? bens.body[0].id : null;

    const adminReads = await call(
      `/rest/v1/help_requests?select=id,topic&user_id=eq.${ben.id}`, { headers: omar.h },
    );
    rec("a linked admin CAN read what the student is stuck on",
        adminReads.ok && rows(adminReads) === 1, `rows: ${rows(adminReads)}`);

    // The three writes that would make the list worthless to her.
    const adminAdds = await call("/rest/v1/help_requests", {
      headers: omar.h, method: "POST", prefer: "return=representation",
      body: { user_id: ben.id, topic: "You are stuck on this, actually" },
    });
    rec("a linked admin cannot ADD to the student's list", !adminAdds.ok,
        `HTTP ${adminAdds.status} ${adminAdds.body?.code ?? ""}`);

    const adminCloses = await call(`/rest/v1/help_requests?id=eq.${bensId}`, {
      headers: omar.h, method: "PATCH", prefer: "return=representation",
      body: { status: "resolved" },
    });
    rec("a linked admin cannot CLOSE an item they did not resolve",
        blocked(adminCloses), `HTTP ${adminCloses.status}, rows ${rows(adminCloses)}`);

    const adminDeletes = await call(`/rest/v1/help_requests?id=eq.${bensId}`, {
      headers: omar.h, method: "DELETE", prefer: "return=representation",
    });
    rec("a linked admin cannot DELETE from the student's list",
        blocked(adminDeletes), `HTTP ${adminDeletes.status}, rows ${rows(adminDeletes)}`);
  }

  // --- 0007: a linked admin may edit the TIMETABLE, and only that -----------
  console.log(`\n${BOLD}support timetable edit (0007)${RESET}`);

  // Preflight again. Without it, every "an admin cannot write X" below passes
  // because the whole migration is missing rather than because a policy held.
  const probe0007 = await call("/rest/v1/rpc/can_manage_timetable", {
    headers: service, method: "POST", body: { target: ben.id },
  });
  const has0007 = probe0007.body?.code !== "PGRST202" && probe0007.status !== 404;
  rec("migration 0007 is applied", has0007,
      has0007 ? "can_manage_timetable exists" : "run 0007_support_timetable_edit.sql");

  if (has0007) {
    // omar holds an ACTIVE link to ben from the 0005 section above.
    const adminVersion = await call("/rest/v1/timetable_versions", {
      headers: omar.h, method: "POST", prefer: "return=representation",
      body: {
        user_id: ben.id, name: "Set by parent", status: "active",
        source_type: "image", confirmed_at: new Date().toISOString(),
      },
    });
    rec("a linked admin CAN create the student's timetable", adminVersion.ok,
        `HTTP ${adminVersion.status} ${adminVersion.body?.code ?? ""}`);
    const adminVersionId = adminVersion.ok ? adminVersion.body[0].id : null;

    const adminSubject = await call("/rest/v1/subjects", {
      headers: omar.h, method: "POST", prefer: "return=representation",
      body: { user_id: ben.id, name: "Parent-added Physics", short_name: "Phys" },
    });
    // Required: timetable_entries_class_has_subject means a lesson without a
    // subject cannot be inserted at all.
    rec("a linked admin CAN create a subject a lesson needs", adminSubject.ok,
        `HTTP ${adminSubject.status}`);
    const adminSubjectId = adminSubject.ok ? adminSubject.body[0].id : null;

    const adminEntry = await call("/rest/v1/timetable_entries", {
      headers: omar.h, method: "POST", prefer: "return=representation",
      body: {
        user_id: ben.id, timetable_version_id: adminVersionId,
        subject_id: adminSubjectId, activity_type: "class",
        day_of_week: 2, start_time: "08:00", end_time: "09:00",
      },
    });
    rec("a linked admin CAN add a lesson", adminEntry.ok, `HTTP ${adminEntry.status}`);
    const adminEntryId = adminEntry.ok ? adminEntry.body[0].id : null;

    const adminEdit = await call(`/rest/v1/timetable_entries?id=eq.${adminEntryId}`, {
      headers: omar.h, method: "PATCH", prefer: "return=representation",
      body: { room: "B12" },
    });
    rec("a linked admin CAN edit a lesson",
        adminEdit.ok && rows(adminEdit) === 1, `rows: ${rows(adminEdit)}`);

    // --- and now everything that must NOT have opened ------------------------
    const adminHomework = await call("/rest/v1/assignments", {
      headers: omar.h, method: "POST", prefer: "return=representation",
      body: { user_id: ben.id, title: "Set by parent", due_date: today() },
    });
    rec("0007 did NOT open homework", !adminHomework.ok,
        `HTTP ${adminHomework.status} ${adminHomework.body?.code ?? ""}`);

    const adminRevision = await call("/rest/v1/revision_tasks", {
      headers: omar.h, method: "POST", prefer: "return=representation",
      body: { user_id: ben.id, title: "Set by parent" },
    });
    rec("0007 did NOT open revision", !adminRevision.ok,
        `HTTP ${adminRevision.status} ${adminRevision.body?.code ?? ""}`);

    const adminSession = await call("/rest/v1/study_sessions", {
      headers: omar.h, method: "POST", prefer: "return=representation",
      body: { user_id: ben.id, started_at: new Date().toISOString() },
    });
    rec("0007 did NOT open study sessions", !adminSession.ok,
        `HTTP ${adminSession.status} ${adminSession.body?.code ?? ""}`);

    if (has0006) {
      const adminHelp = await call("/rest/v1/help_requests", {
        headers: omar.h, method: "POST", prefer: "return=representation",
        body: { user_id: ben.id, topic: "Added by parent" },
      });
      rec("0007 did NOT open the stuck-on list", !adminHelp.ok,
          `HTTP ${adminHelp.status} ${adminHelp.body?.code ?? ""}`);
    }

    const adminRenames = await call(`/rest/v1/profiles?id=eq.${ben.id}`, {
      headers: omar.h, method: "PATCH", prefer: "return=representation",
      body: { full_name: "renamed by parent" },
    });
    rec("0007 did NOT open the student's profile", blocked(adminRenames),
        `HTTP ${adminRenames.status}, rows ${rows(adminRenames)}`);

    // Subject DELETE stays shut: subjects cascade into assignments, which is
    // homework, and homework is not what this migration opened.
    const adminDeletesSubject = await call(`/rest/v1/subjects?id=eq.${adminSubjectId}`, {
      headers: omar.h, method: "DELETE", prefer: "return=representation",
    });
    rec("0007 did NOT open subject DELETE", blocked(adminDeletesSubject),
        `HTTP ${adminDeletesSubject.status}, rows ${rows(adminDeletesSubject)}`);

    // --- the audit trail -----------------------------------------------------
    const adminLogs = await call("/rest/v1/activity_logs", {
      headers: omar.h, method: "POST", prefer: "return=representation",
      body: {
        user_id: ben.id, actor_id: omar.id, activity_type: "timetable_confirmed",
        entity_type: "timetable_version", entity_id: adminVersionId,
      },
    });
    rec("an edit is recorded against the student, attributed to the admin",
        adminLogs.ok, `HTTP ${adminLogs.status} ${adminLogs.body?.code ?? ""}`);

    const studentSeesIt = await call(
      `/rest/v1/activity_logs?select=actor_id&user_id=eq.${ben.id}&actor_id=eq.${omar.id}`,
      { headers: ben.h },
    );
    rec("the STUDENT can see who changed it", rows(studentSeesIt) >= 1,
        `rows: ${rows(studentSeesIt)}`);

    const forgedActor = await call("/rest/v1/activity_logs", {
      headers: omar.h, method: "POST", prefer: "return=representation",
      body: { user_id: ben.id, actor_id: ben.id, activity_type: "assignment_completed" },
    });
    rec("an admin cannot attribute an action to the student", !forgedActor.ok,
        `HTTP ${forgedActor.status} ${forgedActor.body?.code ?? ""}`);

    // --- nobody else ---------------------------------------------------------
    const strangerAdmin = await call("/rest/v1/timetable_entries", {
      headers: sara.h, method: "POST", prefer: "return=representation",
      body: {
        user_id: ben.id, timetable_version_id: adminVersionId,
        activity_type: "break", title: "Planted", day_of_week: 3,
        start_time: "08:00", end_time: "09:00",
      },
    });
    rec("an admin with NO link cannot touch the timetable", !strangerAdmin.ok,
        `HTTP ${strangerAdmin.status} ${strangerAdmin.body?.code ?? ""}`);

    const studentOnStudent = await call("/rest/v1/timetable_entries", {
      headers: ava.h, method: "POST", prefer: "return=representation",
      body: {
        user_id: ben.id, timetable_version_id: adminVersionId,
        activity_type: "break", title: "Planted", day_of_week: 4,
        start_time: "08:00", end_time: "09:00",
      },
    });
    rec("a student cannot touch another student's timetable", !studentOnStudent.ok,
        `HTTP ${studentOnStudent.status} ${studentOnStudent.body?.code ?? ""}`);

    // --- and revoking closes it ----------------------------------------------
    const linkRow = await call(
      `/rest/v1/admin_student_links?select=id&admin_id=eq.${omar.id}&student_id=eq.${ben.id}`,
      { headers: ben.h },
    );
    const omarLinkId = rows(linkRow) > 0 ? linkRow.body[0].id : null;

    if (omarLinkId) {
      await call(`/rest/v1/admin_student_links?id=eq.${omarLinkId}`, {
        headers: ben.h, method: "PATCH", body: { status: "revoked" },
      });

      const afterRevokeWrite = await call(`/rest/v1/timetable_entries?id=eq.${adminEntryId}`, {
        headers: omar.h, method: "PATCH", prefer: "return=representation",
        body: { room: "should not happen" },
      });
      rec("REVOKING closes timetable editing immediately",
          blocked(afterRevokeWrite),
          `HTTP ${afterRevokeWrite.status}, rows ${rows(afterRevokeWrite)}`);
    }
  }

  // --- activity log ---------------------------------------------------------
  console.log(`\n${BOLD}activity log${RESET}`);

  const logIns = await call("/rest/v1/activity_logs", {
    headers: ava.h, method: "POST", prefer: "return=representation",
    body: {
      user_id: ava.id, actor_id: ava.id, activity_type: "assignment_completed",
      entity_type: "assignment", entity_id: assignmentId,
    },
  });
  rec("a student can append their own event", logIns.ok, `HTTP ${logIns.status}`);
  const logId = logIns.ok ? logIns.body[0].id : null;

  const logEdit = await call(`/rest/v1/activity_logs?id=eq.${logId}`, {
    headers: ava.h, method: "PATCH", prefer: "return=representation",
    body: { activity_type: "assignment_created" },
  });
  rec("a student cannot rewrite history", blocked(logEdit), `HTTP ${logEdit.status}`);

  const logDel = await call(`/rest/v1/activity_logs?id=eq.${logId}`, {
    headers: ava.h, method: "DELETE", prefer: "return=representation",
  });
  rec("a student cannot delete history", blocked(logDel), `HTTP ${logDel.status}`);

  const logForge = await call("/rest/v1/activity_logs", {
    headers: ava.h, method: "POST", prefer: "return=representation",
    body: { user_id: ben.id, actor_id: ava.id, activity_type: "assignment_completed" },
  });
  rec("a student cannot log events against another student", !logForge.ok,
      `HTTP ${logForge.status} ${logForge.body?.code ?? ""}`);

  // --- constraints ----------------------------------------------------------
  console.log(`\n${BOLD}constraints${RESET}`);

  const version = await call("/rest/v1/timetable_versions", {
    headers: ava.h, method: "POST", prefer: "return=representation",
    body: { user_id: ava.id, name: "Test timetable", status: "draft" },
  });
  const versionId = version.ok ? version.body[0].id : null;
  rec("a student can create a timetable version", version.ok, `HTTP ${version.status}`);

  const badTime = await call("/rest/v1/timetable_entries", {
    headers: ava.h, method: "POST", prefer: "return=representation",
    body: {
      user_id: ava.id, timetable_version_id: versionId, activity_type: "break",
      title: "Break", day_of_week: 1, start_time: "11:00", end_time: "10:00",
    },
  });
  rec("an entry ending before it starts is rejected", !badTime.ok,
      `HTTP ${badTime.status} ${badTime.body?.code ?? ""}`);

  const goodEntry = await call("/rest/v1/timetable_entries", {
    headers: ava.h, method: "POST", prefer: "return=representation",
    body: {
      user_id: ava.id, timetable_version_id: versionId, subject_id: subjectId,
      activity_type: "class", day_of_week: 1, start_time: "08:00", end_time: "09:00",
    },
  });
  rec("a valid lesson is accepted", goodEntry.ok, `HTTP ${goodEntry.status}`);

  const overlap = await call("/rest/v1/timetable_entries", {
    headers: ava.h, method: "POST", prefer: "return=representation",
    body: {
      user_id: ava.id, timetable_version_id: versionId, subject_id: subjectId,
      activity_type: "class", day_of_week: 1, start_time: "08:30", end_time: "09:30",
    },
  });
  rec("an overlapping lesson is rejected", !overlap.ok,
      `HTTP ${overlap.status} ${overlap.body?.code ?? ""}`);

  const classNoSubject = await call("/rest/v1/timetable_entries", {
    headers: ava.h, method: "POST", prefer: "return=representation",
    body: {
      user_id: ava.id, timetable_version_id: versionId, activity_type: "class",
      day_of_week: 2, start_time: "08:00", end_time: "09:00",
    },
  });
  rec("a class with no subject is rejected", !classNoSubject.ok,
      `HTTP ${classNoSubject.status} ${classNoSubject.body?.code ?? ""}`);

  const badEstimate = await call("/rest/v1/assignments", {
    headers: ava.h, method: "POST", prefer: "return=representation",
    body: { user_id: ava.id, title: "Silly", due_date: today(), estimated_minutes: 9999 },
  });
  rec("an absurd time estimate is rejected", !badEstimate.ok,
      `HTTP ${badEstimate.status} ${badEstimate.body?.code ?? ""}`);

  const crossUserSubject = await call("/rest/v1/assignments", {
    headers: ben.h, method: "POST", prefer: "return=representation",
    body: { user_id: ben.id, subject_id: subjectId, title: "Borrowed subject", due_date: today() },
  });
  rec("a student cannot reference another student's subject", !crossUserSubject.ok,
      `HTTP ${crossUserSubject.status} ${crossUserSubject.body?.code ?? ""}`);
}

// ---------------------------------------------------------------------------
if (!url || !anonKey || !serviceKey) {
  console.error(
    `${RED}Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and ` +
      `SUPABASE_SERVICE_ROLE_KEY in .env.local${RESET}`,
  );
  process.exitCode = 1;
} else {
  try {
    await run();
  } catch (error) {
    console.error(`\n${RED}Aborted: ${error.message}${RESET}`);
    results.push({ name: "suite completed", passed: false, detail: error.message });
  } finally {
    await cleanup();
    console.log(`\n${DIM}cleaned up ${created.length} temporary account(s)${RESET}`);
  }

  const failed = results.filter((r) => !r.passed);
  console.log("");
  if (failed.length) {
    console.log(`${RED}${BOLD}${failed.length} of ${results.length} checks failed.${RESET}`);
    for (const f of failed) console.log(`  ${RED}FAIL${RESET} ${f.name}  ${DIM}${f.detail}${RESET}`);
    console.log("");
    process.exitCode = 1;
  } else {
    console.log(`${GREEN}${BOLD}All ${results.length} live checks passed.${RESET}\n`);
  }
}
