const SUPABASE_URL = "https://gwrjhlutvrnnbqemtwqm.supabase.co";
const SUPABASE_KEY = "sb_publishable_tLF0vjaiHVD9wGsy5QGMxA_cqUaJE5G";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const BUDGET = 45;
const POS_LIMITS = { GK: 1, D: 2, F: 3 };
const POS_LABELS = { GK: "Målvakt", D: "Back", F: "Forward" };
const ROUND_KEY = "fh_current_round";

let league = null;
let managers = [];
let teams = {};
let me = null;
let currentRound = Number(localStorage.getItem(ROUND_KEY) || 1);
let activeMarketPos = "GK";
let adminMatch = 1;

const el = id => document.getElementById(id);
const money = v => Number(v).toFixed(1).replace(".", ",") + " m";

function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}

async function ensureAuth() {
  let { data: { session } } = await db.auth.getSession();

  if (!session) {
    const { error } = await db.auth.signInAnonymously();
    if (error) throw error;
  }
}

async function rpc(name, args = {}) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}

async function loadManagers() {
  managers = await rpc("get_managers") || [];
}

async function loadMe() {
  const rows = await rpc("whoami_manager");
  me = rows?.[0] || null;
}

async function loadLeague() {
  const { data, error } = await db
    .from("league_state")
    .select("data")
    .eq("id", "main")
    .single();

  if (error) throw error;
  league = data.data;
}

async function loadTeams() {
  const { data, error } = await db
    .from("manager_teams")
    .select("manager_id,round,players");

  if (error) throw error;

  teams = {};

  (data || []).forEach(r => {
    teams[r.manager_id] ||= {};
    teams[r.manager_id][String(r.round)] = r.players || [];
  });
}

async function boot() {
  try {
    await ensureAuth();

    await Promise.all([
      loadManagers(),
      loadLeague(),
      loadTeams(),
      loadMe()
    ]);

    if (!me) return showLogin();

    showApp();
    refreshAll();

  } catch (err) {
    console.error(err);
    showLogin();

    el("loginError").textContent =
      "Kunde inte ansluta till Fantasy Hölle.";
  }
}

function showLogin() {
  el("loginScreen").style.display = "grid";
  el("appShell").style.display = "none";

  const first = managers.length === 0;

  el("loginTitle").textContent =
    first ? "Skapa ligans admin" : "Logga in";

  el("loginHelp").textContent =
    first
      ? "Första personen blir admin. Skriv ditt namn och välj en 4-siffrig PIN."
      : "Skriv ditt managernamn och din PIN.";
}

function showApp() {
  el("loginScreen").style.display = "none";
  el("appShell").style.display = "block";

  el("adminNav").style.display =
    me?.is_admin ? "" : "none";
}

async function loginManager() {
  const name = el("loginName").value.trim();
  const pin = el("loginPin").value.trim();

  el("loginError").textContent = "";

  if (!name || !/^\d{4}$/.test(pin)) {
    el("loginError").textContent =
      "Skriv namn och en PIN med 4 siffror.";
    return;
  }

  try {
    if (managers.length === 0) {
      await rpc("bootstrap_admin", {
        p_name: name,
        p_pin: pin
      });
    } else {
      await rpc("claim_manager", {
        p_name: name,
        p_pin: pin
      });
    }

    await Promise.all([
      loadManagers(),
      loadTeams(),
      loadMe()
    ]);

    if (!me) {
      throw new Error("Kunde inte koppla manager.");
    }

    showApp();
    refreshAll();

    showToast("Inloggad som " + me.name);

  } catch (err) {
    console.error(err);

    el("loginError").textContent =
      "Fel namn/PIN eller managern finns inte.";
  }
}

window.loginManager = loginManager;

async function logoutManager() {
  await rpc("release_manager").catch(() => {});
  await db.auth.signOut();
  location.reload();
}

window.logoutManager = logoutManager;

function playerById(id) {
  return league.players.find(p => p.id === id);
}

function roundObj(round = currentRound) {
  return league.rounds.find(
    r => Number(r.id) === Number(round)
  );
}

function teamFor(managerId, round = currentRound) {
  return teams[managerId]?.[String(round)] || [];
}

function teamCost(ids) {
  return ids.reduce(
    (sum, id) => sum + (playerById(id)?.price || 0),
    0
  );
}

function countPos(ids, pos) {
  return ids.filter(
    id => playerById(id)?.pos === pos
  ).length;
}

function validTeam(ids) {
  return (
    ids.length === 6 &&
    countPos(ids, "GK") === 1 &&
    countPos(ids, "D") === 2 &&
    countPos(ids, "F") === 3 &&
    teamCost(ids) <= BUDGET
  );
}

function positionSlots(ids) {
  return {
    GK: ids.filter(id => playerById(id)?.pos === "GK"),
    D: ids.filter(id => playerById(id)?.pos === "D"),
    F: ids.filter(id => playerById(id)?.pos === "F")
  };
}

function statBlank() {
  return {
    played: 0,
    goals: 0,
    assists: 0,
    savedPenalty: 0,
    missedPenalty: 0,
    pen2: 0,
    pen10: 0,
    matchPenalty: 0,
    plusMinus: 0,
    conceded: ""
  };
}

function getStat(round, match, pid) {
  return (
    (((league.stats?.[String(round)] || {})
      [String(match)] || {})[pid]) ||
    statBlank()
  );
}

function setStat(round, match, pid, obj) {
  league.stats ||= {};
  league.stats[String(round)] ||= {};
  league.stats[String(round)][String(match)] ||= {};
  league.stats[String(round)][String(match)][pid] = obj;
}

function calcScore(player, s) {
  const scoring = {
    GK: {
      goal: 20,
      assist: 8,
      played: 1,
      savedPenalty: 3,
      pen2: -2,
      pen10: -4,
      matchPenalty: -10
    },

    D: {
      goal: 5,
      assist: 2,
      played: 1,
      missedPenalty: -3,
      plusPositive: 2,
      plusNegative: -2,
      pen2: -2,
      pen10: -4,
      matchPenalty: -10
    },

    F: {
      goal: 3,
      assist: 2,
      played: 1,
      missedPenalty: -3,
      plusPositive: 2,
      plusNegative: -2,
      pen2: -2,
      pen10: -4,
      matchPenalty: -10
    }
  };

  let pts = 0;
  const cfg = scoring[player.pos];

  pts += Number(s.goals || 0) * cfg.goal;
  pts += Number(s.assists || 0) * cfg.assist;

  if (Number(s.played || 0) > 0) {
    pts += cfg.played;
  }

  pts += Number(s.pen2 || 0) * cfg.pen2;
  pts += Number(s.pen10 || 0) * cfg.pen10;
  pts += Number(s.matchPenalty || 0) * cfg.matchPenalty;

  if (player.pos === "GK") {
    pts +=
      Number(s.savedPenalty || 0) *
      cfg.savedPenalty;

    if (
      s.conceded !== "" &&
      Number(s.played || 0) > 0
    ) {
      const c = Number(s.conceded);

      if (c <= 3) pts += 5;
      else if (c <= 5) pts += 3;
      else if (c >= 9) pts -= 5;
      else if (c >= 7) pts -= 2;
    }
  } else {
    pts +=
      Number(s.missedPenalty || 0) *
      cfg.missedPenalty;

    const pm = Number(s.plusMinus || 0);

    pts += pm * 2;  
  }

  return pts;
}

function playerRoundScore(pid, round) {
  const p = playerById(pid);
  const r = roundObj(round);

  if (!p || !r) return 0;

  let total = 0;

  for (let m = 1; m <= r.matches; m++) {
    total += calcScore(
      p,
      getStat(round, m, pid)
    );
  }

  return total;
}

function managerRoundScore(managerId, round) {
  return teamFor(managerId, round).reduce(
    (sum, pid) =>
      sum + playerRoundScore(pid, round),
    0
  );
}

function managerTotal(managerId) {
  return league.rounds.reduce(
    (sum, r) =>
      sum + managerRoundScore(managerId, r.id),
    0
  );
}

function standings() {
  return managers
    .map(m => ({
      m,
      total: managerTotal(m.id)
    }))
    .sort((a, b) => b.total - a.total);
}

function finesTable() {
  const map = {};

  managers.forEach(m => {
    map[m.id] = 0;
  });

  for (const r of league.rounds) {
    const arr = managers
      .map(m => ({
        id: m.id,
        score: managerRoundScore(m.id, r.id)
      }))
      .sort((a, b) => a.score - b.score);

    arr
      .slice(0, Math.min(3, arr.length))
      .forEach(x => {
        map[x.id] += Number(
          league.settings.bottom3Fine || 0
        );
      });
  }

  const reverse = standings().slice().reverse();

  if (reverse.length) {
    map[reverse[0].m.id] += Number(
      league.settings.overallLastFine || 0
    );
  }

  standings()
    .slice(0, 3)
    .forEach((x, i) => {
      map[x.m.id] -= Number(
        league.settings.prizes[i] || 0
      );
    });

  return map;
}

async function saveMyTeam() {
  const ids = teamFor(me.id);

  const { error } = await db
    .from("manager_teams")
    .upsert(
      {
        manager_id: me.id,
        round: currentRound,
        players: ids,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "manager_id,round"
      }
    );

  if (error) throw error;
}

async function saveLeague() {
  const { error } = await db
    .from("league_state")
    .update({
      data: league,
      updated_at: new Date().toISOString()
    })
    .eq("id", "main");

  if (error) throw error;
}

function nav(view) {
  document
    .querySelectorAll(".view")
    .forEach(v =>
      v.classList.remove("active")
    );

  document
    .querySelectorAll(".navbtn")
    .forEach(v =>
      v.classList.remove("active")
    );

  el("view-" + view).classList.add("active");

  document
    .querySelector(
      `.navbtn[data-view="${view}"]`
    )
    ?.classList.add("active");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  refreshAll();
}

window.nav = nav;

function refreshHeader() {
  el("leagueTitle").textContent =
    league.leagueName;

  el("whoAmI").textContent =
    me.name +
    (me.is_admin ? " • ADMIN" : "");

  el("roundSelect").innerHTML =
    league.rounds
      .map(
        r =>
          `<option value="${r.id}" ${
            Number(r.id) === currentRound
              ? "selected"
              : ""
          }>${r.name}</option>`
      )
      .join("");
}

function refreshTeam() {
  const ids = teamFor(me.id);
  const cost = teamCost(ids);
  const left = BUDGET - cost;

  el("teamManagerName").textContent =
    me.name;

  el("budgetLeft").textContent =
    money(left);

  el("budgetSpent").textContent =
    money(cost);

  el("teamCount").textContent =
    `${ids.length}/6`;

  el("budgetBar").style.width =
    Math.min(
      100,
      (cost / BUDGET) * 100
    ) + "%";

  const locked = roundObj().locked;

  el("roundLockBadge").textContent =
    locked ? "LÅST" : "ÖPPEN";

  el("roundLockBadge").className =
    "badge " +
    (locked ? "danger" : "ok");

  renderTeamSlots(ids);
  renderMarket();
  renderManagerTeams();}

function renderManagerTeams() {
  const area = el("managerTeams");
  if (!area) return;

  if (!roundObj().locked) {
    area.innerHTML = "";
    return;
  }

  area.innerHTML = managers.map(m => {
    const ids = teamFor(m.id, currentRound);
    const names = ids
      .map(id => playerById(id)?.name)
      .filter(Boolean)
      .join(", ");

    return `
      <div class="card" style="margin-top:10px;">
        <strong>${m.name}</strong><br>
        ${names || "Inget lag sparat"}
      </div>
    `;
  }).join("");
}

function renderTeamSlots(ids) {
  const pos = positionSlots(ids);
  const area = el("teamSlots");

  area.innerHTML = "";

  for (const p of ["GK", "D", "F"]) {
    const title =
      document.createElement("div");

    title.className = "section-label";
    title.textContent = POS_LABELS[p];

    area.appendChild(title);

    for (
      let i = 0;
      i < POS_LIMITS[p];
      i++
    ) {
      const pid = pos[p][i];
      const pl = playerById(pid);

      const d =
        document.createElement("div");

      d.className =
        "slot " + (pl ? "filled" : "");

      d.innerHTML = pl
        ? `<div>
             <b>${pl.name}</b>
             <small>
               ${money(pl.price)}
               •
               ${playerRoundScore(
                 pl.id,
                 currentRound
               )} p
             </small>
           </div>
           <button
             class="ghost mini"
             data-remove="${pl.id}"
           >
             Ta bort
           </button>`
        : `<span class="muted">
             Tom plats
           </span>`;

      area.appendChild(d);
    }
  }

  area
    .querySelectorAll("[data-remove]")
    .forEach(
      b =>
        b.onclick = () =>
          togglePlayer(
            b.dataset.remove
          )
    );
}

function renderMarket() {
  document
    .querySelectorAll(".market-tab")
    .forEach(b =>
      b.classList.toggle(
        "active",
        b.dataset.pos ===
          activeMarketPos
      )
    );

  const ids = teamFor(me.id);
  const area = el("marketList");

  area.innerHTML = "";

  league.players
    .filter(
      p =>
        p.pos === activeMarketPos
    )
    .sort(
      (a, b) =>
        b.price - a.price
    )
    .forEach(p => {
      const chosen =
        ids.includes(p.id);

      const d =
        document.createElement("div");

      d.className = "player-card";

      d.innerHTML = `
        <div class="avatar">
          ${p.name
            .slice(0, 2)
            .toUpperCase()}
        </div>

        <div class="grow">
          <b>${p.name}</b>
          <small>
            ${POS_LABELS[p.pos]}
            •
            ${playerRoundScore(
              p.id,
              currentRound
            )} p
          </small>
        </div>

        <div class="price">
          ${money(p.price)}
        </div>

        <button
          class="${
            chosen
              ? "selected"
              : "primary"
          } mini"
        >
          ${
            chosen
              ? "Vald"
              : "+"
          }
        </button>
      `;

      d.querySelector("button").onclick =
        () => togglePlayer(p.id);

      area.appendChild(d);
    });
}

async function togglePlayer(pid) {
  if (roundObj().locked) {
    return showToast(
      "Omgången är låst"
    );
  }

  let ids = [
    ...teamFor(me.id)
  ];

  if (ids.includes(pid)) {
    ids = ids.filter(
      x => x !== pid
    );
  } else {
    const p = playerById(pid);

    if (ids.length >= 6) {
      return showToast(
        "Laget är fullt"
      );
    }

    if (
      countPos(ids, p.pos) >=
      POS_LIMITS[p.pos]
    ) {
      return showToast(
        `Max antal ${
          POS_LABELS[p.pos]
            .toLowerCase()
        }`
      );
    }

    if (
      teamCost(ids) +
        p.price >
      BUDGET
    ) {
      return showToast(
        "Budgeten räcker inte"
      );
    }

    ids.push(pid);
  }

  teams[me.id] ||= {};
  teams[me.id][
    String(currentRound)
  ] = ids;

  try {
    await saveMyTeam();
    refreshAll();
  } catch (e) {
    console.error(e);

    showToast(
      "Kunde inte spara laget"
    );
  }
}

async function saveTeam() {
  const ids = teamFor(me.id);

  if (!validTeam(ids)) {
    return showToast(
      "Välj 1 MV, 2 backar och 3 forwards inom 45 m"
    );
  }
if (currentRound > 1) {
  const previousIds = teamFor(me.id, currentRound - 1);

  if (previousIds.length === 6) {
    const playersOut = previousIds.filter(id => !ids.includes(id)).length;

    if (playersOut > 2) {
      return showToast("Du får max göra 2 byten per omgång");
    }
  }
}  try {
    await saveMyTeam();

    showToast(
      "Laget är sparat"
    );
  } catch {
    showToast(
      "Kunde inte spara"
    );
  }
}

window.saveTeam = saveTeam;

async function copyPreviousTeam() {
  if (currentRound <= 1) {
    return showToast(
      "Ingen tidigare omgång"
    );
  }

  if (roundObj().locked) {
    return showToast(
      "Omgången är låst"
    );
  }

  teams[me.id] ||= {};

  teams[me.id][
    String(currentRound)
  ] = [
    ...teamFor(
      me.id,
      currentRound - 1
    )
  ];

  try {
    await saveMyTeam();
    refreshAll();

    showToast(
      "Föregående lag kopierat"
    );
  } catch {
    showToast(
      "Kunde inte kopiera laget"
    );
  }
}

window.copyPreviousTeam =
  copyPreviousTeam;

function refreshStandings() {
  const arr = standings();
  const fines = finesTable();

  el("standingsHead").innerHTML =
    `<tr>
      <th>#</th>
      <th>Manager</th>
      ${league.rounds
        .map(
          r =>
            `<th>O${r.id}</th>`
        )
        .join("")}
      <th>Total</th>
      <th>Netto böter</th>
    </tr>`;

  el("standingsBody").innerHTML =
    arr
      .map(
        (x, i) =>
          `<tr>
            <td>${i + 1}</td>
            <td>
              <b>${x.m.name}</b>
            </td>

            ${league.rounds
              .map(
                r =>
                  `<td>
                    ${managerRoundScore(
                      x.m.id,
                      r.id
                    )}
                  </td>`
              )
              .join("")}

            <td>
              <b>${x.total}</b>
            </td>

            <td>
              ${fines[x.m.id]} kr
            </td>
          </tr>`
      )
      .join("");
}

function refreshRound() {
  const r = roundObj();

  el("roundTitle").textContent =
    `${r.name} • ${r.matches} matcher`;

  el("roundPlayerScores").innerHTML =
    [...league.players]
      .sort(
        (a, b) =>
          playerRoundScore(
            b.id,
            r.id
          ) -
          playerRoundScore(
            a.id,
            r.id
          )
      )
      .map(
        p =>
          `<div class="rank-row">
            <span>
              ${p.name}
              <small>
                ${POS_LABELS[p.pos]}
              </small>
            </span>

            <b>
              ${playerRoundScore(
                p.id,
                r.id
              )} p
            </b>
          </div>`
      )
      .join("");
}

function refreshEconomy() {
  const fines = finesTable();
  const arr = standings();

  const prizeTotal =
    league.settings.prizes.reduce(
      (a, b) =>
        a + Number(b || 0),
      0
    );

  el("economySummary").innerHTML = `
    <div class="kpi">
      <span>Omgångsböter</span>
      <b>
        ${
          Math.min(
            3,
            managers.length
          ) *
          league.rounds.length *
          league.settings.bottom3Fine
        } kr
      </b>
    </div>

    <div class="kpi">
      <span>Jumboböter</span>
      <b>
        ${
          league.settings
            .overallLastFine
        } kr
      </b>
    </div>

    <div class="kpi">
      <span>Prisavdrag</span>
      <b>${prizeTotal} kr</b>
    </div>
  `;

  el("economyRows").innerHTML =
    arr
      .map(
        (x, i) =>
          `<div class="money-row">
            <span>
              <b>${x.m.name}</b>
              <small>
                ${i + 1}. totalt
                • ${x.total} p
              </small>
            </span>

            <b>
              ${fines[x.m.id]} kr
            </b>
          </div>`
      )
      .join("");
}

function stepControl(
  label,
  key,
  value
) {
  return `
    <div class="stepper">
      <small>${label}</small>

      <div>
        <button
          type="button"
          data-step="${key}"
          data-delta="-1"
        >
          −
        </button>

        <b>${value}</b>

        <button
          type="button"
          data-step="${key}"
          data-delta="1"
        >
          +
        </button>
      </div>
    </div>
  `;
}

function refreshAdmin() {
  if (!me?.is_admin) return;

  const r = roundObj();

  el("adminRoundTitle").textContent =
    `${r.name} – statistik`;

  if (adminMatch > r.matches) {
    adminMatch = 1;
  }

  el("matchTabs").innerHTML = "";

  for (
    let i = 1;
    i <= r.matches;
    i++
  ) {
    const b =
      document.createElement(
        "button"
      );

    b.className =
      "chip " +
      (i === adminMatch
        ? "active"
        : "");

    b.textContent =
      "Match " + i;

    b.onclick = () => {
      adminMatch = i;
      refreshAdmin();
    };

    el("matchTabs")
      .appendChild(b);
  }

  el("lockRoundBtn").textContent =
    r.locked
      ? "Lås upp omgång"
      : "Lås omgång";

  renderAdminStats();

  el("managersAdmin").innerHTML =
    managers
      .map(
        m =>
          `<div class="manager-row">
            <span>
              <b>${m.name}</b>
              <small>
                ${
                  m.is_admin
                    ? "Admin"
                    : "Manager"
                }
              </small>
            </span>

            ${
              m.id !== me.id
                ? `<button
                    class="ghost mini"
                    data-del="${m.id}"
                   >
                    Ta bort
                   </button>`
                : ""
            }
          </div>`
      )
      .join("");

  el("managersAdmin")
    .querySelectorAll(
      "[data-del]"
    )
    .forEach(
      b =>
        b.onclick = () =>
          deleteManager(
            b.dataset.del
          )
    );
}

function renderAdminStats() {
  const area =
    el("adminStats");

  area.innerHTML = "";

  league.players.forEach(p => {
    const s = getStat(
      currentRound,
      adminMatch,
      p.id
    );

    const row =
      document.createElement(
        "div"
      );

    row.className = "stat-card";

    row.innerHTML = `
      <div class="stat-head">
        <div>
          <b>${p.name}</b>

          <small>
            ${POS_LABELS[p.pos]}
            •
            <span class="score">
              ${calcScore(p, s)} p
            </span>
          </small>
        </div>

        <button
          class="${
            s.played
              ? "selected"
              : "ghost"
          } mini"
          data-played
        >
          ${
            s.played
              ? "✓ Spelade"
              : "Spelade?"
          }
        </button>
      </div>

      <div class="quick-grid">

        ${stepControl(
          "Mål",
          "goals",
          s.goals || 0
        )}

        ${stepControl(
          "Assist",
          "assists",
          s.assists || 0
        )}

        ${
          p.pos === "GK"
            ? stepControl(
                "Insläppta",
                "conceded",
                s.conceded === ""
                  ? 0
                  : s.conceded
              ) +
              stepControl(
                "Räddad straff",
                "savedPenalty",
                s.savedPenalty || 0
              )
            : stepControl(
                "+ / −",
                "plusMinus",
                s.plusMinus || 0
              ) +
              stepControl(
                "Missad straff",
                "missedPenalty",
                s.missedPenalty || 0
              )
        }

        ${stepControl(
          "2 min",
          "pen2",
          s.pen2 || 0
        )}

        ${stepControl(
          "2+10",
          "pen10",
          s.pen10 || 0
        )}

        ${stepControl(
          "Matchstraff",
          "matchPenalty",
          s.matchPenalty || 0
        )}

      </div>
    `;

    row
      .querySelector(
        "[data-played]"
      )
      .onclick = async () => {
        const c = {
          ...getStat(
            currentRound,
            adminMatch,
            p.id
          ),

          played:
            s.played
              ? 0
              : 1
        };

        setStat(
          currentRound,
          adminMatch,
          p.id,
          c
        );

        await adminSaveAndRefresh();
      };

    row
      .querySelectorAll(
        "[data-step]"
      )
      .forEach(btn => {
        btn.onclick = async () => {
          const key =
            btn.dataset.step;

          const delta =
            Number(
              btn.dataset.delta
            );

          const c = {
            ...getStat(
              currentRound,
              adminMatch,
              p.id
            )
          };

          let val =
            Number(c[key] || 0) +
            delta;

          if (
            key !== "plusMinus"
          ) {
            val = Math.max(
              0,
              val
            );
          }

          c[key] = val;

          setStat(
            currentRound,
            adminMatch,
            p.id,
            c
          );

          await adminSaveAndRefresh();
        };
      });

    area.appendChild(row);
  });
}

async function adminSaveAndRefresh() {
  try {
    await saveLeague();
    refreshAll();
  } catch (e) {
    console.error(e);

    showToast(
      "Kunde inte spara adminändringen"
    );
  }
}

async function toggleRoundLock() {
  league.rounds[
    currentRound - 1
  ].locked =
    !league.rounds[
      currentRound - 1
    ].locked;

  await adminSaveAndRefresh();

  showToast(
    league.rounds[
      currentRound - 1
    ].locked
      ? "Omgång låst"
      : "Omgång upplåst"
  );
}

window.toggleRoundLock =
  toggleRoundLock;

async function addManager() {
  const name =
    el("newManagerName")
      .value
      .trim();

  const pin =
    el("newManagerPin")
      .value
      .trim();

  if (
    !name ||
    !/^\d{4}$/.test(pin)
  ) {
    return showToast(
      "Namn + PIN med 4 siffror"
    );
  }

  try {
    await rpc(
      "admin_create_manager",
      {
        p_name: name,
        p_pin: pin
      }
    );

    el("newManagerName")
      .value = "";

    el("newManagerPin")
      .value = "";

    await loadManagers();

    refreshAll();

    showToast(
      "Manager tillagd"
    );

  } catch (e) {
    console.error(e);

    showToast(
      "Kunde inte lägga till manager"
    );
  }
}

window.addManager =
  addManager;

async function deleteManager(id) {
  if (
    !confirm(
      "Ta bort manager och alla deras fantasy-lag?"
    )
  ) {
    return;
  }

  try {
    await rpc(
      "admin_delete_manager",
      {
        p_manager_id: id
      }
    );

    await Promise.all([
      loadManagers(),
      loadTeams()
    ]);

    refreshAll();

    showToast(
      "Manager borttagen"
    );

  } catch (e) {
    console.error(e);

    showToast(
      "Kunde inte ta bort manager"
    );
  }
}

function refreshAll() {
  if (!league || !me) return;

  refreshHeader();
  refreshTeam();
  refreshStandings();
  refreshRound();
  refreshEconomy();
  refreshAdmin();
}

document.addEventListener(
  "DOMContentLoaded",
  () => {

    document
      .querySelectorAll(
        ".navbtn"
      )
      .forEach(
        b =>
          b.onclick = () =>
            nav(
              b.dataset.view
            )
      );

    document
      .querySelectorAll(
        ".market-tab"
      )
      .forEach(b => {
        b.onclick = () => {
          activeMarketPos =
            b.dataset.pos;

          renderMarket();
        };
      });

    el("roundSelect").onchange =
      e => {
        currentRound =
          Number(
            e.target.value
          );

        localStorage.setItem(
          ROUND_KEY,
          currentRound
        );

        refreshAll();
      };

    boot();

    if (
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker
        .register("./sw.js")
        .catch(() => {});
    }
  }
);
