const views = {
  home: "view-home",
  register: "view-register",
  brief: "view-brief",
  play: "view-play",
  result: "view-result",
  leaderboard: "view-leaderboard",
  admin: "view-admin",
};

let challenge = null;
let game = null;
let currentGuess = "";
let submitting = false;
let briefSeen = sessionStorage.getItem("mcc_brief") === "1";

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: res.status, data });
  return data;
}

function showView(name) {
  document.querySelectorAll(".view").forEach((el) => el.classList.remove("is-active"));
  document.getElementById(views[name]).classList.add("is-active");
  document.getElementById("brandSub").textContent =
    name === "home" ? "TECHNICAL GAME HUB" : "CODEBREAKER / TECHNICAL GAME HUB";
  document.querySelectorAll("[data-nav]").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === (name === "register" || name === "brief" || name === "play" || name === "result" ? "codebreaker" : name));
  });
  window.scrollTo({ top: 0, behavior: "instant" });
}

function pathToRoute(pathname) {
  if (pathname.startsWith("/codebreaker")) return "codebreaker";
  if (pathname.startsWith("/leaderboard")) return "leaderboard";
  if (pathname.startsWith("/admin")) return "admin";
  return "home";
}

async function refreshMe() {
  const me = await api("/api/me");
  document.body.classList.toggle("is-admin", Boolean(me.admin));
  return me;
}

function renderSlots() {
  const row = document.getElementById("liveSlots");
  const len = challenge?.codeLength || 4;
  row.innerHTML = "";
  for (let i = 0; i < len; i += 1) {
    const el = document.createElement("div");
    el.className = "digit";
    el.textContent = currentGuess[i] || "_";
    row.appendChild(el);
  }
}

function renderKeypad() {
  const pad = document.getElementById("keypad");
  pad.innerHTML = "";
  for (const key of ["1","2","3","4","5","6","7","8","9","0","DEL","CLR"]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = key;
    btn.addEventListener("click", () => applyKey(key === "DEL" ? "Backspace" : key === "CLR" ? "Escape" : key));
    pad.appendChild(btn);
  }
}

function applyKey(key) {
  if (!challenge || game?.status !== "in_progress") return;
  const len = challenge.codeLength;
  if (key === "Backspace") currentGuess = currentGuess.slice(0, -1);
  else if (key === "Escape") currentGuess = "";
  else if (/^[0-9]$/.test(key) && currentGuess.length < len) currentGuess += key;
  else if (key === "Enter") { submitGuess(); return; }
  document.getElementById("guessInput").value = currentGuess;
  renderSlots();
}

function fbLabel(kind) {
  if (kind === "green") return "Exact";
  if (kind === "yellow") return "Present";
  return "Absent";
}

function renderHistory() {
  const box = document.getElementById("history");
  box.innerHTML = "";
  (game?.guesses || []).forEach((row) => {
    const wrap = document.createElement("div");
    wrap.className = "history-row";
    const digits = document.createElement("div");
    digits.className = "history-digits";
    [...row.guess].forEach((d, i) => {
      const el = document.createElement("div");
      el.className = `digit is-${row.feedback[i]}`;
      el.textContent = d;
      el.setAttribute("aria-label", `${d} ${fbLabel(row.feedback[i])}`);
      digits.appendChild(el);
    });
    const pegs = document.createElement("div");
    pegs.className = "pegs";
    row.feedback.forEach((kind) => {
      const peg = document.createElement("span");
      peg.className = `peg ${kind}`;
      peg.title = fbLabel(kind);
      pegs.appendChild(peg);
    });
    wrap.append(digits, pegs);
    box.appendChild(wrap);
  });
}

function paintGame() {
  document.getElementById("statDay").textContent = `DAY ${game.dayNumber}`;
  document.getElementById("statLen").textContent = `${game.codeLength}-DIGIT CODE`;
  document.getElementById("statAttempts").textContent = `${game.attemptsUsed} / ${game.maxAttempts}`;
  document.getElementById("briefAttempts").textContent = `You have ${game.codeLength + 1} attempts.`;
  renderSlots();
  renderHistory();
}

function showResult() {
  const won = game.status === "won";
  document.getElementById("resultTitle").textContent = won ? "CODE CRACKED" : "MISSION FAILED";
  document.getElementById("resultSub").textContent = won
    ? `MISSION COMPLETE · Attempts used: ${game.attemptsUsed} / ${game.maxAttempts}`
    : "THE CODE WAS:";
  document.getElementById("resultCode").textContent = game.secretCode || "";
  document.getElementById("resultScore").innerHTML = won
    ? `Score ${game.score}<br>Formula: (length × 100) + (remaining attempts × 50) + max(0, 300 − seconds).`
    : `Score ${game.score}. The daily challenge stays the same for every player today.`;
  showView("result");
}

async function loadGame() {
  game = await api("/api/game");
  challenge = {
    date: game.challengeDate,
    dayNumber: game.dayNumber,
    codeLength: game.codeLength,
    maxAttempts: game.maxAttempts,
  };
  currentGuess = "";
  paintGame();
  if (game.status !== "in_progress") showResult();
}

async function submitGuess() {
  if (submitting || game?.status !== "in_progress") return;
  const error = document.getElementById("guessError");
  if (!/^[0-9]+$/.test(currentGuess) || currentGuess.length !== challenge.codeLength) {
    error.textContent = `Enter exactly ${challenge.codeLength} digits.`;
    return;
  }
  submitting = true;
  document.getElementById("submitGuess").disabled = true;
  try {
    game = await api("/api/game/guess", { method: "POST", body: JSON.stringify({ guess: currentGuess }) });
    currentGuess = "";
    error.textContent = "";
    paintGame();
    if (game.status !== "in_progress") showResult();
  } catch (err) {
    error.textContent = err.message;
    if (err.data?.game) {
      game = err.data.game;
      paintGame();
      if (game.status !== "in_progress") showResult();
    }
  } finally {
    submitting = false;
    document.getElementById("submitGuess").disabled = false;
  }
}

async function renderLeaderboard(range = "today") {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.range === range));
  const [board, active] = await Promise.all([
    api(`/api/leaderboard?range=${range}`),
    api("/api/active"),
  ]);
  document.getElementById("activeCountLine").textContent = `${String(active.count).padStart(2, "0")} PLAYERS ONLINE · rankings persist across devices.`;
  const body = document.getElementById("lbBody");
  const cards = document.getElementById("lbCards");
  body.innerHTML = "";
  cards.innerHTML = "";
  if (!board.rows.length) {
    body.innerHTML = `<tr><td colspan="7">No completed missions in this window yet.</td></tr>`;
    return;
  }
  board.rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${String(row.rank).padStart(2,"0")}</td><td>${row.name}</td><td>${row.branch}</td><td>Day ${row.day}</td><td>${row.score}</td><td>${row.attempts}</td><td>${row.status}</td>`;
    body.appendChild(tr);
    const card = document.createElement("div");
    card.className = "lb-card";
    card.innerHTML = `<strong>${String(row.rank).padStart(2,"0")} ${row.name}</strong><div>${row.branch} · Day ${row.day}</div><div>${row.score} · ${row.attempts} · ${row.status}</div>`;
    cards.appendChild(card);
  });
}

async function openAdmin() {
  showView("admin");
  const me = await refreshMe();
  document.getElementById("adminLogin").hidden = me.admin;
  document.getElementById("adminDash").hidden = !me.admin;
  if (!me.admin) return;
  const data = await api("/api/admin/dashboard");
  document.getElementById("adminStats").innerHTML = `
    <div class="stat"><b>${data.totalParticipants}</b><span>PARTICIPANTS</span></div>
    <div class="stat"><b>${data.totalWins}/${data.totalLosses}</b><span>WINS / LOSSES</span></div>
    <div class="stat"><b>${data.averageScore}</b><span>AVG SCORE</span></div>`;
  document.getElementById("activeBody").innerHTML = data.online.map((p) =>
    `<tr><td>${p.full_name}</td><td>${p.branch}</td><td>${p.section}</td><td>${p.day_number}</td><td>${p.status}</td></tr>`
  ).join("") || `<tr><td colspan="5">No live players.</td></tr>`;
  document.getElementById("adminLb").innerHTML = data.leaderboard.map((p) =>
    `<tr><td>${p.full_name}</td><td>${p.branch}</td><td>${p.day_number}</td><td>${p.score}</td><td>${p.status}</td><td>${p.attempts_used}</td></tr>`
  ).join("") || `<tr><td colspan="6">No records.</td></tr>`;
}

async function route() {
  const dest = pathToRoute(location.pathname);
  await refreshMe();
  challenge = await api("/api/challenge");
  if (dest === "home") return showView("register");
  if (dest === "leaderboard") {
    showView("leaderboard");
    return renderLeaderboard("today");
  }
  if (dest === "admin") return openAdmin();

  const me = await refreshMe();
  if (!me.player) return showView("register");
  if (!briefSeen) return showView("brief");
  showView("play");
  await loadGame();
}

function go(path) {
  history.pushState({}, "", path);
  route();
}

document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-link]");
  if (!link) return;
  const url = new URL(link.href, location.origin);
  if (url.origin !== location.origin) return;
  e.preventDefault();
  go(url.pathname);
});

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = document.getElementById("registerError");
  const payload = {
    fullName: document.getElementById("fullName").value,
    branch: document.getElementById("branch").value,
    section: document.getElementById("section").value,
    year: document.getElementById("year").value,
  };
  if (Object.values(payload).some((v) => !String(v).trim())) {
    error.textContent = "Every field is required.";
    return;
  }
  try {
    await api("/api/register", { method: "POST", body: JSON.stringify(payload) });
    error.textContent = "";
    briefSeen = false;
    sessionStorage.removeItem("mcc_brief");
    showView("brief");
  } catch (err) {
    error.textContent = err.message;
  }
});

document.getElementById("letsGo").addEventListener("click", async () => {
  briefSeen = true;
  sessionStorage.setItem("mcc_brief", "1");
  showView("play");
  await loadGame();
});

document.getElementById("submitGuess").addEventListener("click", submitGuess);
document.getElementById("guessInput").addEventListener("input", (e) => {
  currentGuess = e.target.value.replace(/\D/g, "").slice(0, challenge?.codeLength || 8);
  renderSlots();
});
document.addEventListener("keydown", (e) => {
  if (!document.getElementById("view-play").classList.contains("is-active")) return;
  if (e.key === "Enter") { e.preventDefault(); submitGuess(); }
  else applyKey(e.key);
});

document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", () => renderLeaderboard(btn.dataset.range));
});

document.getElementById("adminLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: document.getElementById("adminPassword").value }) });
    await openAdmin();
  } catch (err) {
    document.getElementById("adminError").textContent = err.message;
  }
});
document.getElementById("adminLogout").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST", body: "{}" });
  await openAdmin();
});
document.getElementById("sendReport").addEventListener("click", async () => {
  const result = await api("/api/admin/report/weekly", { method: "POST", body: "{}" });
  alert(result.sent ? "Weekly report sent." : `Report logged (${result.reason}). Configure SMTP to deliver email.`);
});

window.addEventListener("popstate", route);
renderKeypad();
route();
setInterval(() => {
  if (document.getElementById("view-play").classList.contains("is-active")) {
    api("/api/game/heartbeat", { method: "POST", body: "{}" }).catch(() => {});
  }
}, 20000);
