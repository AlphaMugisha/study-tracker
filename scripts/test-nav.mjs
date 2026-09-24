/**
 * Unit tests for nav activation.
 *
 *   npm run test:nav
 *
 * `isNavItemActive` is a prefix test, which is right for /timetable/upload
 * lighting up Timetable and wrong the moment one nav href is a prefix of
 * another. /admin/reports sat under /admin and lit up two rows at once.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { activeHrefFor, isNavItemActive, primaryNav, primaryNavFor, secondaryNav } from "@/lib/nav.ts";

const adminNav = () => [...primaryNavFor("admin"), ...secondaryNav];
const studentNav = () => [...primaryNav, ...secondaryNav];

test("a sub-route still lights up its section", () => {
  assert.equal(isNavItemActive("/timetable/upload", "/timetable"), true);
  assert.equal(activeHrefFor("/timetable/upload", studentNav()), "/timetable");
});

test("exactly one item is ever active", () => {
  for (const path of [
    "/dashboard", "/admin", "/admin/reports", "/admin/abc-123",
    "/admin/abc-123/reports", "/settings", "/timetable", "/help",
  ]) {
    for (const items of [adminNav(), studentNav()]) {
      const active = activeHrefFor(path, items);
      const matches = items.filter((i) => i.href === active);
      assert.ok(matches.length <= 1, `${path} lit ${matches.length} items`);
    }
  }
});

test("the most specific destination wins over its parent", () => {
  // The actual bug: /admin/reports matched both /admin and /admin/reports.
  const items = adminNav();
  assert.equal(
    items.filter((i) => isNavItemActive("/admin/reports", i.href)).length,
    2,
    "precondition: the prefix test really does match both",
  );
  assert.equal(activeHrefFor("/admin/reports", items), "/admin/reports");
});

test("one student's record lights up Students, not Reports", () => {
  assert.equal(activeHrefFor("/admin/abc-123", adminNav()), "/admin");
  // Their per-day page is still part of that student's record.
  assert.equal(activeHrefFor("/admin/abc-123/reports", adminNav()), "/admin");
});

test("an unknown path lights up nothing rather than guessing", () => {
  assert.equal(activeHrefFor("/nowhere", adminNav()), null);
});

test("a prefix that is not a path boundary does not match", () => {
  // /administrator must not light up /admin.
  assert.equal(isNavItemActive("/administrator", "/admin"), false);
  assert.equal(activeHrefFor("/administrator", adminNav()), null);
});

test("a support account is not offered student-only destinations", () => {
  const hrefs = primaryNavFor("admin").map((i) => i.href);
  assert.deepEqual(hrefs, ["/dashboard", "/admin", "/admin/reports"]);
  assert.ok(!hrefs.includes("/homework"), "RLS refuses those writes anyway");
});
