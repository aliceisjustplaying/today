import { describe, expect, test } from "bun:test";
import { ago, dayLabel, groupFeed, initials } from "./stars-feed";
import type { GithubEvent } from "./types";

const TZ = "America/New_York";
// Mon Oct 12 2026, 14:30 in New York.
const now = Date.parse("2026-10-12T18:30:00Z");
const ev = (iso: string, repo: string, kind: "star" | "fork" = "star", login = repo + iso): GithubEvent => ({
  kind,
  repo,
  login,
  name: null,
  avatarUrl: "",
  at: Date.parse(iso),
});

describe("stars feed", () => {
  test.each([
    ["2026-10-25T23:30:00+01:00", "2026-10-24"],
    ["2026-03-30T00:30:00+02:00", "2026-03-29"],
    ["2026-11-01T00:30:00+01:00", "2026-10-31"],
    ["2027-01-01T00:30:00+01:00", "2026-12-31"],
  ])("Yesterday follows the Stockholm calendar at %s", (iso, yesterday) => {
    expect(dayLabel(yesterday, Date.parse(iso), "Europe/Stockholm")).toBe("Yesterday");
  });

  test("days are bucketed in the given time zone", () => {
    // 02:00 UTC on the 12th is still the evening of the 11th in New York.
    const days = groupFeed([ev("2026-10-12T15:00:00Z", "a", "fork"), ev("2026-10-12T02:00:00Z", "b", "fork"), ev("2026-10-09T12:00:00Z", "c")], now, TZ);
    expect(days.map((d) => [d.key, d.label])).toEqual([
      ["2026-10-12", "Today"],
      ["2026-10-11", "Yesterday"],
      ["2026-10-09", "Oct 9"],
    ]);
    expect(groupFeed([ev("2026-10-12T02:00:00Z", "b")], now, "UTC")[0]!.label).toBe("Today");
    expect(dayLabel("2026-09-30", now, TZ)).toBe("Sep 30");
  });

  test("three or more adjacent stars on one repo in a day collapse into a burst", () => {
    const days = groupFeed(
      [
        ev("2026-10-12T18:00:00Z", "paint"),
        ev("2026-10-12T17:00:00Z", "paint"),
        ev("2026-10-12T16:00:00Z", "paint"),
        ev("2026-10-12T15:00:00Z", "other"),
        ev("2026-10-12T14:00:00Z", "paint"),
        ev("2026-10-12T13:00:00Z", "paint"),
      ],
      now,
      TZ,
    );
    const rows = days[0]!.rows;
    expect(rows.map((r) => (r.type === "burst" ? `burst ${r.repo} ${r.events.length}` : `${r.event.kind} ${r.event.repo}`))).toEqual([
      "burst paint 3",
      "star other",
      "star paint",
      "star paint",
    ]);
  });

  test("a fork or a new day breaks a burst, and forks never collapse", () => {
    const rows = (events: GithubEvent[]) =>
      groupFeed(events, now, TZ).map((d) => d.rows.map((r) => (r.type === "burst" ? `burst ${r.events.length}` : r.event.kind)));
    expect(
      rows([ev("2026-10-12T18:00:00Z", "p"), ev("2026-10-12T17:00:00Z", "p"), ev("2026-10-12T16:30:00Z", "p", "fork"), ev("2026-10-12T16:00:00Z", "p")]),
    ).toEqual([["star", "star", "fork", "star"]]);
    expect(rows([ev("2026-10-12T18:00:00Z", "p", "fork"), ev("2026-10-12T17:00:00Z", "p", "fork"), ev("2026-10-12T16:00:00Z", "p", "fork")])).toEqual([
      ["fork", "fork", "fork"],
    ]);
    // Two today and two yesterday stay as single rows: a burst never spans days.
    expect(
      rows([ev("2026-10-12T15:00:00Z", "p"), ev("2026-10-12T14:00:00Z", "p"), ev("2026-10-11T20:00:00Z", "p"), ev("2026-10-11T19:00:00Z", "p")]),
    ).toEqual([
      ["star", "star"],
      ["star", "star"],
    ]);
  });

  test("ages and initials", () => {
    expect(ago(now - 20_000, now)).toBe("now");
    expect(ago(now - 4 * 60_000, now)).toBe("4m");
    expect(ago(now - 3 * 3_600_000, now)).toBe("3h");
    expect(ago(now - 50 * 3_600_000, now)).toBe("2d");
    expect(initials("Mira Okafor", "miraok")).toBe("MO");
    expect(initials(null, "quietcoder")).toBe("Q");
  });
});
