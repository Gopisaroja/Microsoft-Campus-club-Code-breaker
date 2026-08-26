import test from "node:test";
import assert from "node:assert/strict";
import { daysBetween, deriveDailyCode } from "../server/challenge.js";
import { codeLengthForDay } from "../server/gameLogic.js";

test("day 1 is the configured start date", () => {
  assert.equal(daysBetween("2026-08-26", "2026-08-26") + 1, 1);
  assert.equal(daysBetween("2026-08-26", "2026-08-27") + 1, 2);
  assert.equal(daysBetween("2026-08-26", "2026-08-30") + 1, 5);
});

test("same date and length always yield the same daily code", () => {
  const a = deriveDailyCode("2026-08-26", 4);
  const b = deriveDailyCode("2026-08-26", 4);
  assert.equal(a, b);
  assert.match(a, /^[0-9]{4}$/);
});

test("next day yields a different challenge length and typically a different code", () => {
  const d1 = deriveDailyCode("2026-08-26", codeLengthForDay(1));
  const d2 = deriveDailyCode("2026-08-27", codeLengthForDay(2));
  assert.equal(d1.length, 4);
  assert.equal(d2.length, 5);
});
