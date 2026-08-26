# MCC Technical Game Hub — Codebreaker

Complete Codebreaker daily challenge integrated into the Microsoft Campus Club Technical Game Hub.

## Run locally

```bash
cd C:\Users\ELCOT\Projects\codebreaker
copy .env.example .env
npm install
npm test
npm start
```

Open http://localhost:3000

## What you must configure in `.env`

| Variable | Purpose |
|---|---|
| `GAME_START_DATE` | Day 1 of the competition (`2026-08-26` by default) |
| `TIMEZONE` | Official calendar timezone (`Asia/Kolkata`) |
| `CODE_SECRET` | Server secret used to derive the **same daily code for every player** |
| `SESSION_SECRET` | Signs player cookies |
| `ORGANIZER_PASSWORD` | Password for `/admin` Control Center |
| `ORGANIZER_EMAIL` | Defaults to the organizer inbox |
| `EMAIL_API_KEY` / `SMTP_*` | Transactional email. If empty, weekly reports are logged and the app still runs |
| `TEST_DAY_OVERRIDE` | Optional. Force day 1–5 locally without waiting for calendar dates |

The organizer dashboard is at `/admin`. It is cookie-authenticated on the server. The organizer email is never shown in the public UI.

Weekly reports are attempted every Monday at 09:00 in `TIMEZONE`, and can also be sent from Control Center.

## Game rules

- Day N uses code length `min(8, 4 + N - 1)` and `length + 1` attempts.
- Matching is two-pass Mastermind (green, then yellow). Codes are strings, so leading zeros are valid.
- Scores are calculated only on the server.
