import crypto from "node:crypto";
import { config } from "./config.js";
import { codeLengthForDay, digitsFromHmac, maxAttemptsForLength } from "./gameLogic.js";

export function nowInTimezone(timeZone = config.timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

export function daysBetween(startDate, currentDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const current = Date.parse(`${currentDate}T00:00:00Z`);
  return Math.floor((current - start) / 86400000);
}

export function getChallengeMeta(nowDate = nowInTimezone().date) {
  const override = Number(config.testDayOverride);
  const dayNumber = Number.isFinite(override) && override >= 1
    ? Math.floor(override)
    : Math.max(1, daysBetween(config.gameStartDate, nowDate) + 1);
  const codeLength = codeLengthForDay(dayNumber);
  return {
    date: nowDate,
    dayNumber,
    codeLength,
    maxAttempts: maxAttemptsForLength(codeLength),
    timezone: config.timezone,
  };
}

export function deriveDailyCode(date, codeLength) {
  const hmac = crypto
    .createHmac("sha256", config.codeSecret)
    .update(`mcc-codebreaker:${date}:${codeLength}`)
    .digest("hex");
  return digitsFromHmac(hmac, codeLength);
}
