import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateScore,
  codeLengthForDay,
  evaluateGuess,
  isExactMatch,
  isValidGuess,
  maxAttemptsForLength,
} from "../server/gameLogic.js";

test("duplicate-aware matching: 1843 vs 4812", () => {
  assert.deepEqual(evaluateGuess("1843", "4812"), ["yellow", "green", "yellow", "gray"]);
});

test("exact match", () => {
  const fb = evaluateGuess("0047", "0047");
  assert.deepEqual(fb, ["green", "green", "green", "green"]);
  assert.equal(isExactMatch(fb), true);
});

test("all wrong", () => {
  assert.deepEqual(evaluateGuess("1234", "5678"), ["gray", "gray", "gray", "gray"]);
});

test("repeated digits do not over-count yellows", () => {
  assert.deepEqual(evaluateGuess("1123", "1111"), ["green", "green", "gray", "gray"]);
  assert.deepEqual(evaluateGuess("1122", "2211"), ["yellow", "yellow", "yellow", "yellow"]);
  assert.deepEqual(evaluateGuess("1112", "2111"), ["yellow", "green", "green", "yellow"]);
});

test("leading zeros stay string-based", () => {
  assert.deepEqual(evaluateGuess("0012", "0102"), ["green", "yellow", "yellow", "green"]);
});

test("validation", () => {
  assert.equal(isValidGuess("123456", 6), true);
  assert.equal(isValidGuess("12345", 6), false);
  assert.equal(isValidGuess("1234567", 6), false);
  assert.equal(isValidGuess("abc123", 6), false);
  assert.equal(isValidGuess("12 345", 6), false);
  assert.equal(isValidGuess("0047", 4), true);
});

test("daily length and attempts", () => {
  assert.equal(codeLengthForDay(1), 4);
  assert.equal(maxAttemptsForLength(4), 5);
  assert.equal(codeLengthForDay(2), 5);
  assert.equal(maxAttemptsForLength(5), 6);
  assert.equal(codeLengthForDay(3), 6);
  assert.equal(maxAttemptsForLength(6), 7);
  assert.equal(codeLengthForDay(4), 7);
  assert.equal(maxAttemptsForLength(7), 8);
  assert.equal(codeLengthForDay(5), 8);
  assert.equal(maxAttemptsForLength(8), 9);
  assert.equal(codeLengthForDay(9), 8);
});

test("scoring never negative and rewards remaining attempts", () => {
  assert.equal(calculateScore({ won: false, codeLength: 6, remainingAttempts: 0, completionTimeSeconds: 10 }), 0);
  const win = calculateScore({ won: true, codeLength: 4, remainingAttempts: 3, completionTimeSeconds: 40 });
  assert.equal(win, 400 + 150 + 260);
  const slow = calculateScore({ won: true, codeLength: 4, remainingAttempts: 0, completionTimeSeconds: 900 });
  assert.equal(slow, 400);
});
