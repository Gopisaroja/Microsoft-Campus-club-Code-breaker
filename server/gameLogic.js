/**
 * Mastermind-style numeric matching.
 * Codes and guesses are STRINGS so leading zeros are preserved.
 *
 * First pass: exact-position matches → green
 * Second pass: remaining guess digits vs remaining secret digits → yellow
 * Everything else → gray
 */

export function evaluateGuess(secret, guess) {
  if (typeof secret !== "string" || typeof guess !== "string") {
    throw new Error("secret and guess must be strings");
  }
  if (secret.length !== guess.length) {
    throw new Error("length mismatch");
  }

  const n = secret.length;
  const feedback = Array(n).fill("gray");
  const secretUsed = Array(n).fill(false);
  const guessUsed = Array(n).fill(false);

  for (let i = 0; i < n; i += 1) {
    if (guess[i] === secret[i]) {
      feedback[i] = "green";
      secretUsed[i] = true;
      guessUsed[i] = true;
    }
  }

  for (let i = 0; i < n; i += 1) {
    if (guessUsed[i]) continue;
    for (let j = 0; j < n; j += 1) {
      if (secretUsed[j]) continue;
      if (guess[i] === secret[j]) {
        feedback[i] = "yellow";
        secretUsed[j] = true;
        guessUsed[i] = true;
        break;
      }
    }
  }

  return feedback;
}

export function isExactMatch(feedback) {
  return feedback.length > 0 && feedback.every((item) => item === "green");
}

export function codeLengthForDay(dayNumber) {
  const day = Math.max(1, Number(dayNumber) || 1);
  return Math.min(8, 4 + (day - 1));
}

export function maxAttemptsForLength(codeLength) {
  return codeLength + 1;
}

export function isValidGuess(guess, codeLength) {
  if (typeof guess !== "string") return false;
  return new RegExp(`^[0-9]{${codeLength}}$`).test(guess);
}

/**
 * Score is computed only on the server.
 * baseScore = codeLength × 100
 * attemptBonus = remainingAttempts × 50
 * timeBonus = max(0, 300 − completionTimeInSeconds)
 * Losses score 0. Never negative.
 */
export function calculateScore({ won, codeLength, remainingAttempts, completionTimeSeconds }) {
  if (!won) return 0;
  const baseScore = codeLength * 100;
  const attemptBonus = Math.max(0, remainingAttempts) * 50;
  const timeBonus = Math.max(0, 300 - Math.max(0, Math.floor(completionTimeSeconds)));
  return Math.max(0, baseScore + attemptBonus + timeBonus);
}

export function digitsFromHmac(hex, length) {
  let out = "";
  for (let i = 0; out.length < length; i += 1) {
    const slice = hex.slice((i * 2) % Math.max(hex.length - 1, 1), (i * 2) % Math.max(hex.length - 1, 1) + 2);
    const n = Number.parseInt(slice || "0", 16);
    out += String((Number.isFinite(n) ? n : 0) % 10);
  }
  return out.slice(0, length);
}
