import assert from "node:assert/strict";
import test from "node:test";
import { bar, formatReset, formatStatusline } from "../dist/format.js";
import { parseCodexRateLimitHeaders } from "../dist/rate-limits.js";

test("bar renders left percentage", () => {
  assert.equal(bar(95, 20), "[███████████████████░]");
  assert.equal(bar(0, 5), "[░░░░░]");
  assert.equal(bar(100, 5), "[█████]");
});

test("formatReset uses local same-day time", () => {
  const now = new Date(2026, 4, 6, 12, 0, 0);
  const reset = new Date(2026, 4, 6, 18, 43, 0).getTime() / 1000;
  assert.equal(formatReset(reset, now), "resets 18:43");
});

test("formatReset includes date for later days", () => {
  const now = new Date(2026, 4, 6, 12, 0, 0);
  const reset = new Date(2026, 4, 12, 19, 18, 0).getTime() / 1000;
  assert.equal(formatReset(reset, now), "resets 19:18 on 12 May");
});

test("statusline includes left percentages, plan, reset, credits", () => {
  const snapshot = {
    schemaVersion: 1,
    source: "api",
    fetchedAt: "2026-05-06T12:00:00.000Z",
    account: { plan: "pro" },
    defaultLimit: {
      id: "codex",
      name: "Codex",
      primary: { usedPercent: 5, leftPercent: 95, resetAt: new Date(2026, 4, 6, 18, 43, 0).getTime() / 1000 },
      secondary: { usedPercent: 3, leftPercent: 97 },
    },
    additionalLimits: [],
    credits: { balance: "553.4500" },
  };
  assert.equal(formatStatusline(snapshot, new Date(2026, 4, 6, 12, 0, 0)), "Codex 5h:95% left 7d:97% left pro reset:18:43 credits:553");
});

test("parses x-codex rate-limit headers", () => {
  const snapshot = parseCodexRateLimitHeaders({
    "x-codex-primary-used-percent": "5",
    "x-codex-primary-window-minutes": "300",
    "x-codex-secondary-used-percent": "3",
    "x-codex-bengalfox-primary-used-percent": "12",
    "x-codex-bengalfox-limit-name": "GPT-5.3-Codex-Spark",
    "x-codex-credits-has-credits": "true",
    "x-codex-credits-balance": "553.45",
  });
  assert.equal(snapshot.defaultLimit.primary.leftPercent, 95);
  assert.equal(snapshot.defaultLimit.secondary.leftPercent, 97);
  assert.equal(snapshot.additionalLimits[0].name, "GPT-5.3-Codex-Spark");
  assert.equal(snapshot.additionalLimits[0].primary.leftPercent, 88);
  assert.equal(snapshot.credits.balance, "553.45");
});
