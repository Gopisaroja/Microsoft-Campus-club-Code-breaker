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
let briefSeen =
  sessionStorage.getItem("mcc_brief") === "1";

/* =========================
   API
========================= */

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw Object.assign(
      new Error(
        data.error ||
          `Request failed (${res.status})`
      ),
      {
        status: res.status,
        data,
      }
    );
  }

  return data;
}

/* =========================
   VIEW SYSTEM
========================= */

function showView(name) {
  document
    .querySelectorAll(".view")
    .forEach((el) => {
      el.classList.remove("is-active");
    });

  const target = document.getElementById(
    views[name]
  );

  if (!target) {
    console.error(
      "View not found:",
      views[name]
    );
    return;
  }

  target.classList.add("is-active");

  const brandSub =
    document.getElementById("brandSub");

  if (brandSub) {
    brandSub.textContent =
      name === "home"
        ? "TECHNICAL GAME HUB"
        : "CODEBREAKER / TECHNICAL GAME HUB";
  }

  document
    .querySelectorAll("[data-nav]")
    .forEach((a) => {
      const navName =
        name === "register" ||
        name === "brief" ||
        name === "play" ||
        name === "result"
          ? "codebreaker"
          : name;

      a.classList.toggle(
        "active",
        a.dataset.nav === navName
      );
    });

  window.scrollTo({
    top: 0,
    behavior: "instant",
  });
}

/* =========================
   DIRECT LEADERBOARD
========================= */

async function openLeaderboard() {
  console.log("Opening leaderboard...");

  showView("leaderboard");

  await renderLeaderboard("today");
}

/* =========================
   ROUTING
========================= */

function pathToRoute(pathname) {
  const path =
    pathname.toLowerCase();

  if (
    path === "/codebreaker" ||
    path.startsWith("/codebreaker/")
  ) {
    return "codebreaker";
  }

  if (
    path === "/leaderboard" ||
    path.startsWith("/leaderboard/")
  ) {
    return "leaderboard";
  }

  if (
    path === "/admin" ||
    path.startsWith("/admin/")
  ) {
    return "admin";
  }

  return "home";
}

async function refreshMe() {
  try {
    const me =
      await api("/api/me");

    document.body.classList.toggle(
      "is-admin",
      Boolean(me.admin)
    );

    return me;
  } catch (error) {
    console.error(
      "refreshMe failed:",
      error
    );

    return {
      player: null,
      admin: false,
    };
  }
}

/* =========================
   GAME UI
========================= */

function renderSlots() {
  const row =
    document.getElementById(
      "liveSlots"
    );

  if (!row) return;

  const len =
    challenge?.codeLength || 4;

  row.innerHTML = "";

  for (let i = 0; i < len; i++) {
    const el =
      document.createElement("div");

    el.className = "digit";
    el.textContent =
      currentGuess[i] || "_";

    row.appendChild(el);
  }
}

function renderKeypad() {
  const pad =
    document.getElementById(
      "keypad"
    );

  if (!pad) return;

  pad.innerHTML = "";

  const keys = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "0",
    "DEL",
    "CLR",
  ];

  keys.forEach((key) => {
    const btn =
      document.createElement(
        "button"
      );

    btn.type = "button";
    btn.textContent = key;

    btn.addEventListener(
      "click",
      () => {
        if (key === "DEL") {
          applyKey("Backspace");
        } else if (key === "CLR") {
          applyKey("Escape");
        } else {
          applyKey(key);
        }
      }
    );

    pad.appendChild(btn);
  });
}

function applyKey(key) {
  if (
    !challenge ||
    game?.status !== "in_progress"
  ) {
    return;
  }

  const len =
    challenge.codeLength;

  if (key === "Backspace") {
    currentGuess =
      currentGuess.slice(0, -1);
  } else if (key === "Escape") {
    currentGuess = "";
  } else if (
    /^[0-9]$/.test(key)
  ) {
    if (
      currentGuess.length <
      len
    ) {
      currentGuess += key;
    }
  } else if (
    key === "Enter"
  ) {
    submitGuess();
    return;
  }

  const input =
    document.getElementById(
      "guessInput"
    );

  if (input) {
    input.value =
      currentGuess;
  }

  renderSlots();
}

function fbLabel(kind) {
  if (kind === "green")
    return "Exact";

  if (kind === "yellow")
    return "Present";

  return "Absent";
}

function renderHistory() {
  const box =
    document.getElementById(
      "history"
    );

  if (!box) return;

  box.innerHTML = "";

  (
    game?.guesses || []
  ).forEach((row) => {
    const wrap =
      document.createElement(
        "div"
      );

    wrap.className =
      "history-row";

    const digits =
      document.createElement(
        "div"
      );

    digits.className =
      "history-digits";

    [...row.guess].forEach(
      (d, i) => {
        const el =
          document.createElement(
            "div"
          );

        el.className =
          `digit is-${row.feedback[i]}`;

        el.textContent = d;

        el.setAttribute(
          "aria-label",
          `${d} ${fbLabel(
            row.feedback[i]
          )}`
        );

        digits.appendChild(el);
      }
    );

    const pegs =
      document.createElement(
        "div"
      );

    pegs.className = "pegs";

    row.feedback.forEach(
      (kind) => {
        const peg =
          document.createElement(
            "span"
          );

        peg.className =
          `peg ${kind}`;

        peg.title =
          fbLabel(kind);

        pegs.appendChild(peg);
      }
    );

    wrap.append(
      digits,
      pegs
    );

    box.appendChild(wrap);
  });
}

function paintGame() {
  if (!game) return;

  const statDay =
    document.getElementById(
      "statDay"
    );

  const statLen =
    document.getElementById(
      "statLen"
    );

  const statAttempts =
    document.getElementById(
      "statAttempts"
    );

  const briefAttempts =
    document.getElementById(
      "briefAttempts"
    );

  if (statDay) {
    statDay.textContent =
      `DAY ${game.dayNumber}`;
  }

  if (statLen) {
    statLen.textContent =
      `${game.codeLength}-DIGIT CODE`;
  }

  if (statAttempts) {
    statAttempts.textContent =
      `${game.attemptsUsed} / ${game.maxAttempts}`;
  }

  if (briefAttempts) {
    briefAttempts.textContent =
      `You have ${
        game.codeLength + 1
      } attempts.`;
  }

  renderSlots();
  renderHistory();
}

/* =========================
   RESULT
========================= */

function showResult() {
  if (!game) return;

  const won =
    game.status === "won";

  const title =
    document.getElementById(
      "resultTitle"
    );

  const sub =
    document.getElementById(
      "resultSub"
    );

  const code =
    document.getElementById(
      "resultCode"
    );

  const score =
    document.getElementById(
      "resultScore"
    );

  if (title) {
    title.textContent =
      won
        ? "CODE CRACKED"
        : "MISSION FAILED";
  }

  if (sub) {
    sub.textContent =
      won
        ? `MISSION COMPLETE · Attempts used: ${game.attemptsUsed} / ${game.maxAttempts}`
        : "THE CODE WAS:";
  }

  if (code) {
    code.textContent =
      game.secretCode || "";
  }

  if (score) {
    score.innerHTML =
      won
        ? `Score ${game.score}<br>
           Formula: (length × 100) +
           (remaining attempts × 50) +
           max(0, 300 − seconds).`
        : `Score ${game.score}.`;
  }

  showView("result");
}

/* =========================
   LOAD GAME
========================= */

async function loadGame() {
  try {
    game =
      await api("/api/game");

    challenge = {
      date:
        game.challengeDate,

      dayNumber:
        game.dayNumber,

      codeLength:
        game.codeLength,

      maxAttempts:
        game.maxAttempts,
    };

    currentGuess = "";

    paintGame();

    if (
      game.status !==
      "in_progress"
    ) {
      showResult();
    }
  } catch (error) {
    console.error(
      "loadGame failed:",
      error
    );

    showView("register");
  }
}

/* =========================
   SUBMIT GUESS
========================= */

async function submitGuess() {
  if (
    submitting ||
    !game ||
    game.status !==
      "in_progress"
  ) {
    return;
  }

  const error =
    document.getElementById(
      "guessError"
    );

  if (
    !/^[0-9]+$/.test(
      currentGuess
    ) ||
    currentGuess.length !==
      challenge.codeLength
  ) {
    if (error) {
      error.textContent =
        `Enter exactly ${challenge.codeLength} digits.`;
    }

    return;
  }

  submitting = true;

  const submitButton =
    document.getElementById(
      "submitGuess"
    );

  if (submitButton) {
    submitButton.disabled =
      true;
  }

  try {
    game =
      await api(
        "/api/game/guess",
        {
          method: "POST",

          body: JSON.stringify({
            guess:
              currentGuess,
          }),
        }
      );

    currentGuess = "";

    if (error) {
      error.textContent = "";
    }

    paintGame();

    if (
      game.status !==
      "in_progress"
    ) {
      showResult();
    }
  } catch (err) {
    if (error) {
      error.textContent =
        err.message;
    }

    if (err.data?.game) {
      game =
        err.data.game;

      paintGame();

      if (
        game.status !==
        "in_progress"
      ) {
        showResult();
      }
    }
  } finally {
    submitting = false;

    if (submitButton) {
      submitButton.disabled =
        false;
    }
  }
}

/* =========================
   LEADERBOARD
========================= */

async function renderLeaderboard(
  range = "today"
) {
  console.log(
    "Loading leaderboard:",
    range
  );

  try {
    document
      .querySelectorAll(
        ".tabs button"
      )
      .forEach((b) => {
        b.classList.toggle(
          "active",
          b.dataset.range ===
            range
        );
      });

    const results =
      await Promise.all([
        api(
          `/api/leaderboard?range=${range}`
        ),
        api("/api/active"),
      ]);

    const board =
      results[0];

    const active =
      results[1];

    const activeLine =
      document.getElementById(
        "activeCountLine"
      );

    if (activeLine) {
      activeLine.textContent =
        `${String(
          active.count
        ).padStart(
          2,
          "0"
        )} PLAYERS ONLINE · rankings persist across devices.`;
    }

    const body =
      document.getElementById(
        "lbBody"
      );

    const cards =
      document.getElementById(
        "lbCards"
      );

    if (!body) {
      console.error(
        "lbBody not found"
      );
      return;
    }

    if (!cards) {
      console.error(
        "lbCards not found"
      );
    }

    body.innerHTML = "";

    if (cards) {
      cards.innerHTML = "";
    }

    if (
      !board.rows ||
      !board.rows.length
    ) {
      body.innerHTML = `
        <tr>
          <td colspan="7">
            No completed missions in this window yet.
          </td>
        </tr>
      `;

      return;
    }

    board.rows.forEach(
      (row) => {
        const tr =
          document.createElement(
            "tr"
          );

        tr.innerHTML = `
          <td>
            ${String(
              row.rank
            ).padStart(2, "0")}
          </td>

          <td>
            ${row.name}
          </td>

          <td>
            ${row.branch}
          </td>

          <td>
            Day ${row.day}
          </td>

          <td>
            ${row.score}
          </td>

          <td>
            ${row.attempts}
          </td>

          <td>
            ${row.status}
          </td>
        `;

        body.appendChild(tr);

        if (cards) {
          const card =
            document.createElement(
              "div"
            );

          card.className =
            "lb-card";

          card.innerHTML = `
            <strong>
              ${String(
                row.rank
              ).padStart(
                2,
                "0"
              )} ${row.name}
            </strong>

            <div>
              ${row.branch} · Day ${row.day}
            </div>

            <div>
              ${row.score} ·
              ${row.attempts} ·
              ${row.status}
            </div>
          `;

          cards.appendChild(
            card
          );
        }
      }
    );
  } catch (error) {
    console.error(
      "Leaderboard error:",
      error
    );

    const body =
      document.getElementById(
        "lbBody"
      );

    if (body) {
      body.innerHTML = `
        <tr>
          <td colspan="7">
            Unable to load leaderboard.
          </td>
        </tr>
      `;
    }
  }
}

/* =========================
   ADMIN
========================= */

async function openAdmin() {
  showView("admin");

  const me =
    await refreshMe();

  const login =
    document.getElementById(
      "adminLogin"
    );

  const dash =
    document.getElementById(
      "adminDash"
    );

  if (login) {
    login.hidden = me.admin;
  }

  if (dash) {
    dash.hidden = !me.admin;
  }

  if (!me.admin) return;

  try {
    const data =
      await api(
        "/api/admin/dashboard"
      );

    document.getElementById(
      "adminStats"
    ).innerHTML = `
      <div class="stat">
        <b>
          ${data.totalParticipants}
        </b>
        <span>
          PARTICIPANTS
        </span>
      </div>

      <div class="stat">
        <b>
          ${data.totalWins}/${data.totalLosses}
        </b>
        <span>
          WINS / LOSSES
        </span>
      </div>

      <div class="stat">
        <b>
          ${data.averageScore}
        </b>
        <span>
          AVG SCORE
        </span>
      </div>
    `;

    document.getElementById(
      "activeBody"
    ).innerHTML =
      data.online
        .map(
          (p) => `
            <tr>
              <td>${p.full_name}</td>
              <td>${p.branch}</td>
              <td>${p.section}</td>
              <td>${p.day_number}</td>
              <td>${p.status}</td>
            </tr>
          `
        )
        .join("") ||
      `
        <tr>
          <td colspan="5">
            No live players.
          </td>
        </tr>
      `;

    document.getElementById(
      "adminLb"
    ).innerHTML =
      data.leaderboard
        .map(
          (p) => `
            <tr>
              <td>${p.full_name}</td>
              <td>${p.branch}</td>
              <td>${p.day_number}</td>
              <td>${p.score}</td>
              <td>${p.status}</td>
              <td>${p.attempts_used}</td>
            </tr>
          `
        )
        .join("") ||
      `
        <tr>
          <td colspan="6">
            No records.
          </td>
        </tr>
      `;
  } catch (error) {
    console.error(
      "Admin error:",
      error
    );
  }
}

/* =========================
   ROUTE
========================= */

async function route() {
  const dest =
    pathToRoute(
      location.pathname
    );

  if (dest === "home") {
    showView("register");
    return;
  }

  if (dest === "leaderboard") {
    await openLeaderboard();
    return;
  }

  if (dest === "admin") {
    await openAdmin();
    return;
  }

  if (dest === "codebreaker") {
    const me =
      await refreshMe();

    if (!me.player) {
      showView("register");
      return;
    }

    if (!briefSeen) {
      showView("brief");
      return;
    }

    showView("play");

    await loadGame();
  }
}

/* =========================
   NAVIGATION
========================= */

function go(path) {
  history.pushState(
    {},
    "",
    path
  );

  route();
}

/* =========================
   HEADER LEADERBOARD
========================= */

document.addEventListener(
  "click",
  (e) => {
    const link =
      e.target.closest(
        'a[href="/leaderboard"]'
      );

    if (!link) return;

    e.preventDefault();

    console.log(
      "HEADER LEADERBOARD CLICKED"
    );

    history.pushState(
      {},
      "",
      "/leaderboard"
    );

    openLeaderboard();
  }
);

/* =========================
   RESULT LEADERBOARD
========================= */

const resultLeaderboard =
  document.getElementById(
    "resultLeaderboard"
  );

if (resultLeaderboard) {
  resultLeaderboard.addEventListener(
    "click",
    async (e) => {
      e.preventDefault();

      e.stopPropagation();

      console.log(
        "RESULT LEADERBOARD CLICKED"
      );

      history.pushState(
        {},
        "",
        "/leaderboard"
      );

      await openLeaderboard();
    }
  );
}

/* =========================
   REGISTER
========================= */

const registerForm =
  document.getElementById(
    "registerForm"
  );

if (registerForm) {
  registerForm.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();

      const error =
        document.getElementById(
          "registerError"
        );

      const payload = {
        fullName:
          document
            .getElementById(
              "fullName"
            )
            .value.trim(),

        branch:
          document
            .getElementById(
              "branch"
            )
            .value.trim(),

        section:
          document
            .getElementById(
              "section"
            )
            .value.trim(),

        year:
          document
            .getElementById(
              "year"
            )
            .value.trim(),
      };

      if (
        !payload.fullName ||
        !payload.branch ||
        !payload.section ||
        !payload.year
      ) {
        error.textContent =
          "Every field is required.";

        return;
      }

      const button =
        registerForm.querySelector(
          "button[type='submit']"
        );

      if (button) {
        button.disabled =
          true;

        button.textContent =
          "REGISTERING...";
      }

      try {
        await api(
          "/api/register",
          {
            method: "POST",

            body: JSON.stringify(
              payload
            ),
          }
        );

        briefSeen = false;

        sessionStorage.removeItem(
          "mcc_brief"
        );

        showView("brief");
      } catch (err) {
        console.error(
          "Registration failed:",
          err
        );

        error.textContent =
          err.message ||
          "Registration failed. Please try again.";
      } finally {
        if (button) {
          button.disabled =
            false;

          button.textContent =
            "Continue →";
        }
      }
    }
  );
}

/* =========================
   LET'S GO
========================= */

const letsGo =
  document.getElementById(
    "letsGo"
  );

if (letsGo) {
  letsGo.addEventListener(
    "click",
    async () => {
      briefSeen = true;

      sessionStorage.setItem(
        "mcc_brief",
        "1"
      );

      showView("play");

      await loadGame();
    }
  );
}

/* =========================
   GAME INPUT
========================= */

const submitButton =
  document.getElementById(
    "submitGuess"
  );

if (submitButton) {
  submitButton.addEventListener(
    "click",
    submitGuess
  );
}

const guessInput =
  document.getElementById(
    "guessInput"
  );

if (guessInput) {
  guessInput.addEventListener(
    "input",
    (e) => {
      currentGuess =
        e.target.value
          .replace(/\D/g, "")
          .slice(
            0,
            challenge?.codeLength ||
              8
          );

      renderSlots();
    }
  );
}

document.addEventListener(
  "keydown",
  (e) => {
    const play =
      document.getElementById(
        "view-play"
      );

    if (
      !play ||
      !play.classList.contains(
        "is-active"
      )
    ) {
      return;
    }

    if (
      e.key === "Enter"
    ) {
      e.preventDefault();

      submitGuess();
    } else {
      applyKey(e.key);
    }
  }
);

/* =========================
   LEADERBOARD TABS
========================= */

document
  .querySelectorAll(
    ".tabs button"
  )
  .forEach((btn) => {
    btn.addEventListener(
      "click",
      () => {
        renderLeaderboard(
          btn.dataset.range
        );
      }
    );
  });

/* =========================
   ADMIN LOGIN
========================= */

const adminLogin =
  document.getElementById(
    "adminLogin"
  );

if (adminLogin) {
  adminLogin.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();

      try {
        await api(
          "/api/admin/login",
          {
            method: "POST",

            body: JSON.stringify({
              password:
                document
                  .getElementById(
                    "adminPassword"
                  )
                  .value,
            }),
          }
        );

        await openAdmin();
      } catch (err) {
        document.getElementById(
          "adminError"
        ).textContent =
          err.message;
      }
    }
  );
}

/* =========================
   ADMIN LOGOUT
========================= */

const adminLogout =
  document.getElementById(
    "adminLogout"
  );

if (adminLogout) {
  adminLogout.addEventListener(
    "click",
    async () => {
      await api(
        "/api/admin/logout",
        {
          method: "POST",
          body: "{}",
        }
      );

      await openAdmin();
    }
  );
}

/* =========================
   REPORT
========================= */

const sendReport =
  document.getElementById(
    "sendReport"
  );

if (sendReport) {
  sendReport.addEventListener(
    "click",
    async () => {
      try {
        const result =
          await api(
            "/api/admin/report/weekly",
            {
              method: "POST",
              body: "{}",
            }
          );

        alert(
          result.sent
            ? "Weekly report sent."
            : `Report logged (${result.reason}).`
        );
      } catch (error) {
        alert(
          error.message ||
            "Failed to send report."
        );
      }
    }
  );
}

/* =========================
   BROWSER BACK/FORWARD
========================= */

window.addEventListener(
  "popstate",
  () => {
    route();
  }
);

/* =========================
   START APP
========================= */

renderKeypad();

route();

/* =========================
   HEARTBEAT
========================= */

setInterval(() => {
  const play =
    document.getElementById(
      "view-play"
    );

  if (
    play &&
    play.classList.contains(
      "is-active"
    )
  ) {
    api(
      "/api/game/heartbeat",
      {
        method: "POST",
        body: "{}",
      }
    ).catch(() => {});
  }
}, 20000);
