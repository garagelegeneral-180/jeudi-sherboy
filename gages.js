// Les gages de Jeudi Sherboy : poker en direct, roue, dés et classement.
// Jetons fictifs seulement. Chacun joue depuis son téléphone et s'inscrit à la partie, comme les jeux en avion.
const A = () => window.JSAPI;
const $ = s => document.querySelector(s);
const P = () => self.Poker;
const J = n => Math.round(n).toLocaleString("fr-CA") + " jetons";
const nm = id => A().byId[id]?.name || "?";
const present = id => (A().S.week.rsvp || {})[id] === "oui";
const newId = () => "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const MISES = [10, 25, 50, 100, 250];
const START = 1000;   // solde de départ de chaque compte en banque
let wheelMise = 50, diceMise = 50, pokerBuyin = 1000, raiseTo = null, confirmReset = false;
const animated = new Set();

// Pour jouer, il suffit d'avoir choisi son nom et de s'inscrire à la partie.
function needPresent() {
  const { me, showPicker } = A();
  if (!me) { showPicker(); return true; }
  return false;
}
const tx = (col, id, fn, msg) => A().run(A().store.tx(col, id, fn), msg);
const openOf = type => A().S.bets.find(b => b.type === type && b.status === "ouvert" && b.week === A().WEEK);
const lastDone = type => A().S.bets.find(b => b.type === type && b.status === "fini" && b.week === A().WEEK);

/* ---------- Confettis pour le gagnant ---------- */
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cols = ["#ff2e88", "#ff7a1a", "#ffd21f", "#7ed321", "#16c6c0", "#3b6cff", "#9b3dff"];
  const big = arguments[0] === "big", n = big ? 220 : 120;
  for (let i = 0; i < n; i++) {
    const d = document.createElement("i");
    if (i % 3 === 0) { d.className = "confetti emo"; d.textContent = i % 2 ? "🍺" : "🍄"; d.style.fontSize = (22 + Math.random() * 22) + "px"; }
    else { d.className = "confetti"; d.style.background = cols[i % cols.length]; }
    d.style.left = Math.random() * 100 + "vw";
    d.style.animationDuration = (1.8 + Math.random() * 1.6) + "s";
    d.style.animationDelay = Math.random() * (big ? 1.6 : 0.8) + "s"; d.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(d); setTimeout(() => d.remove(), 5000);
  }
}

/* ---------- Signal « à toi de jouer » : vibration, son et notification ---------- */
let audio = null;
document.addEventListener("click", () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch {} }, { once: true });
function ding() {
  try { if (!audio) return; const t = audio.currentTime;
    [880, 1320].forEach((f, i) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = f; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.0001, t + i * 0.15); g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.15 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.15 + 0.25);
      o.start(t + i * 0.15); o.stop(t + i * 0.15 + 0.3); }); } catch {}
}
const turnSeen = new Set();
function yourTurn(key, title, body) {
  if (turnSeen.has(key)) return; turnSeen.add(key);
  navigator.vibrate?.([200, 100, 200]); ding();
  A().toast(title);
  if (document.hidden && "Notification" in window && Notification.permission === "granted")
    navigator.serviceWorker?.ready.then(r => r.showNotification(title, { body, icon: "icons/icon-192.png", tag: "tour", renotify: true })).catch(() => {});
}

/* ---------- Choix de mise ---------- */
const miseButtons = (cur, key) => `<div class="rounds">${MISES.map(m => `<button class="round${m === cur ? " next" : ""}" data-${key}="${m}">${m}</button>`).join("")}</div>`;

/* ---------- La roue ---------- */
let wAngle = 0, wSpinning = false;
function drawBetWheel(names) {
  const c = $("#betwheel"), x = c.getContext("2d"), n = names.length, R = 270, cx = 280, cy = 280;
  const cs = getComputedStyle(document.documentElement), tok = v => cs.getPropertyValue(v).trim();
  const cols = ["#ff2e88", "#ff7a1a", "#e3b100", "#3aa61c", "#11a6a1", "#3b6cff", "#9b3dff", "#c2397a"];
  x.clearRect(0, 0, 560, 560);
  if (!n) { x.fillStyle = tok("--muted"); x.font = "500 26px DM Sans, sans-serif"; x.textAlign = "center"; x.fillText("Ouvre un gage pour commencer", cx, cy); return; }
  for (let k = 0; k < n; k++) {
    const a0 = wAngle + k * 2 * Math.PI / n, a1 = a0 + 2 * Math.PI / n;
    x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, a0, a1); x.closePath(); x.fillStyle = cols[k % cols.length]; x.fill();
    x.strokeStyle = "rgba(0,0,0,.25)"; x.lineWidth = 2; x.stroke();
    x.save(); x.translate(cx, cy); x.rotate(a0 + Math.PI / n); x.fillStyle = "#fff"; x.font = "800 28px DM Sans, sans-serif"; x.textAlign = "right";
    x.fillText(names[k].slice(0, 14), R - 20, 10); x.restore();
  }
  x.beginPath(); x.arc(cx, cy, 38, 0, 2 * Math.PI); x.fillStyle = tok("--card"); x.fill();
  x.beginPath(); x.moveTo(cx + R - 8, cy); x.lineTo(cx + R + 16, cy - 18); x.lineTo(cx + R + 16, cy + 18); x.closePath(); x.fillStyle = tok("--ink"); x.fill();
}
function spinTo(names, winnerIdx, done) {
  const n = names.length, seg = 2 * Math.PI / n;
  let target = -(winnerIdx + 0.5) * seg; while (target < wAngle) target += 2 * Math.PI;
  target += 8 * Math.PI + (Math.random() - 0.5) * seg * 0.6;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = wAngle, dur = reduce ? 10 : 4200, t0 = performance.now(); wSpinning = true;
  (function step(t) {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); wAngle = start + (target - start) * e; drawBetWheel(names);
    if (p < 1) requestAnimationFrame(step); else { wSpinning = false; done(); }
  })(t0);
}
function renderWheel() {
  const { me, esc } = A();
  const b = openOf("roue"), done = lastDone("roue");
  let html;
  if (!b) {
    html = `<div class="row2" style="align-items:center"><span class="note">Mise par personne</span>${miseButtons(wheelMise, "wm")}</div>
      <button class="btn primary" id="wopen">Ouvrir un gage à ${wheelMise} jetons</button>`;
  } else {
    const joined = b.players.includes(me), pot = b.mise * b.players.length;
    html = `<div class="sub">Gage ouvert par ${esc(nm(b.by))} : <b>${b.mise} jetons</b> chacun. Pot : <b>${J(pot)}</b>.</div>
      <div class="rounds">${b.players.map(p => `<span class="round on">${esc(nm(p))}</span>`).join("") || `<span class="note">Personne n'a encore misé.</span>`}</div>
      <div class="row2">${!joined ? `<button class="btn primary" id="wjoin">Je m'inscris (${b.mise} jetons)</button>` : `<button class="toggle" id="wleave">Je me retire</button>`}
      ${joined && b.players.length >= 2 ? `<button class="btn primary" id="wspin">Faire tourner la roue</button>` : ""}
      ${b.by === me ? `<button class="toggle" id="wcancel">Annuler le gage</button>` : ""}</div>
      ${joined && b.players.length < 2 ? `<div class="note">Il faut au moins 2 joueurs. Les autres peuvent s'inscrire sur leur téléphone.</div>` : ""}`;
  }
  if (b && b.by !== me && !b.players.includes(me)) yourTurn("inv" + b.id, `${nm(b.by)} t'invite à la roue des gages!`, `Mise : ${b.mise} jetons. Inscris-toi dans l'onglet Casino.`);
  $("#wheelbox").innerHTML = html;
  if (!wSpinning) {
    if (b) drawBetWheel(b.players.map(nm));
    else if (done && !animated.has(done.id) && Date.now() - done.finishedAt < 30000) {
      animated.add(done.id); $("#betresult").textContent = "La roue tourne…";
      spinTo(done.players.map(nm), done.players.indexOf(done.winner), () => { $("#betresult").textContent = `${nm(done.winner)} ramasse ${J(done.mise * done.players.length)}!`; confetti(); });
    } else {
      if (done) { animated.add(done.id); drawBetWheel(done.players.map(nm)); $("#betresult").textContent = `Dernier gage : ${nm(done.winner)} a ramassé ${J(done.mise * done.players.length)}.`; }
      else { drawBetWheel([]); $("#betresult").textContent = ""; }
    }
  }
}
$("#wheelbox").addEventListener("click", e => {
  const { me } = A(); const t = e.target;
  if (t.dataset.wm) { wheelMise = +t.dataset.wm; return renderWheel(); }
  if (t.id === "wopen") { if (needPresent()) return; const id = newId();
    return tx("bets", id, () => ({ type: "roue", week: A().WEEK, status: "ouvert", mise: wheelMise, players: [me], by: me, created: Date.now() }), "Gage ouvert. Les autres peuvent s'inscrire."); }
  const b = openOf("roue"); if (!b) return;
  if (t.id === "wjoin") { if (needPresent()) return; tx("bets", b.id, cur => cur && cur.status === "ouvert" && !cur.players.includes(me) ? { ...cur, players: [...cur.players, me] } : undefined, "Inscrit!"); }
  if (t.id === "wleave") tx("bets", b.id, cur => cur && cur.status === "ouvert" ? { ...cur, players: cur.players.filter(p => p !== me) } : undefined);
  if (t.id === "wcancel") tx("bets", b.id, cur => cur && cur.status === "ouvert" ? { ...cur, status: "annule" } : undefined, "Gage annulé");
  if (t.id === "wspin") tx("bets", b.id, cur => {
    if (!cur || cur.status !== "ouvert" || cur.players.length < 2) return undefined;
    const a = new Uint32Array(1); crypto.getRandomValues(a);
    return { ...cur, status: "fini", winner: cur.players[a[0] % cur.players.length], finishedAt: Date.now() };
  });
});

/* ---------- Les dés ---------- */
function resolveDice(b) {
  const r = b.round || 1, elig = r === 1 ? b.players : b.tied, rolls = (b.rolls || {})["r" + r] || {};
  if (!elig.every(p => rolls[p])) return undefined;
  const tot = p => rolls[p][0] + rolls[p][1], top = Math.max(...elig.map(tot)), lead = elig.filter(p => tot(p) === top);
  if (lead.length === 1) return { ...b, status: "fini", winner: lead[0], finishedAt: Date.now() };
  return { ...b, round: r + 1, tied: lead };
}
function renderDice() {
  const { me, esc } = A();
  const b = openOf("des"), done = lastDone("des");
  let html = "", show = null;
  if (!b) {
    html = `<div class="row2" style="align-items:center"><span class="note">Mise par personne</span>${miseButtons(diceMise, "dm")}</div>
      <button class="btn primary" id="dopen">Ouvrir une partie à ${diceMise} jetons</button>`;
    show = done;
  } else {
    const r = b.round || 1, elig = r === 1 ? b.players : b.tied, rolls = (b.rolls || {})["r" + r] || {};
    const started = Object.keys(((b.rolls || {}).r1) || {}).length > 0, joined = b.players.includes(me);
    if (elig.includes(me) && !rolls[me] && b.players.length >= 2) yourTurn("de" + b.id + r, "À toi de lancer les dés!", r > 1 ? "Égalité : relance pour départager." : "Les autres attendent ton lancer.");
    html = `<div class="sub">Partie ouverte par ${esc(nm(b.by))} : <b>${b.mise} jetons</b> chacun. Pot : <b>${J(b.mise * b.players.length)}</b>${r > 1 ? ` · <b>Égalité! Relance ${r - 1}</b>` : ""}.</div>
      <div class="row2">${!joined && !started ? `<button class="btn primary" id="djoin">Je m'inscris (${b.mise} jetons)</button>` : ""}
      ${elig.includes(me) && !rolls[me] && b.players.length >= 2 ? `<button class="btn primary" id="droll">Lancer mes dés</button>` : ""}
      ${joined && !started ? `<button class="toggle" id="dleave">Je me retire</button>` : ""}
      ${b.by === me && !started ? `<button class="toggle" id="dcancel">Annuler</button>` : ""}</div>
      ${b.players.length < 2 ? `<div class="note">Il faut au moins 2 joueurs.</div>` : ""}`;
    show = b;
  }
  if (b && b.by !== me && !b.players.includes(me) && !Object.keys((b.rolls || {}).r1 || {}).length) yourTurn("inv" + b.id, `${nm(b.by)} t'invite aux dés!`, `Mise : ${b.mise} jetons. Inscris-toi dans l'onglet Casino.`);
  $("#dicebox").innerHTML = html;
  if (show) {
    const r = show.round || 1, elig = r === 1 ? show.players : show.tied, rolls = (show.rolls || {})["r" + r] || {};
    $("#dice").innerHTML = elig.map(p => { const d = rolls[p];
      return `<div class="die${show.winner === p ? " win" : ""}${d && !animated.has(show.id + p + r) ? " shake" : ""}"><span class="note">${esc(nm(p))}</span><b>${d ? FACES[d[0] - 1] + FACES[d[1] - 1] : "··"}</b><span class="note">${d ? d[0] + d[1] : "en attente"}</span></div>`; }).join("");
    elig.forEach(p => { if (rolls[p]) animated.add(show.id + p + r); });
    $("#diceresult").textContent = show.status === "fini" ? `${nm(show.winner)} ramasse ${J(show.mise * show.players.length)}!` : "";
    if (show.status === "fini" && !animated.has(show.id) && Date.now() - show.finishedAt < 30000) { animated.add(show.id); confetti(); }
  } else { $("#dice").innerHTML = ""; $("#diceresult").textContent = ""; }
  // Quand tout le monde a lancé, n'importe quel téléphone règle la partie (même résultat partout).
  if (b && resolveDice(b)) tx("bets", b.id, cur => cur && cur.status === "ouvert" ? resolveDice(cur) : undefined);
}
$("#dicebox").addEventListener("click", e => {
  const { me } = A(); const t = e.target;
  if (t.dataset.dm) { diceMise = +t.dataset.dm; return renderDice(); }
  if (t.id === "dopen") { if (needPresent()) return;
    return tx("bets", newId(), () => ({ type: "des", week: A().WEEK, status: "ouvert", mise: diceMise, players: [me], by: me, round: 1, rolls: {}, created: Date.now() }), "Partie ouverte"); }
  const b = openOf("des"); if (!b) return;
  if (t.id === "djoin") { if (needPresent()) return; tx("bets", b.id, cur => cur && cur.status === "ouvert" && !cur.players.includes(me) ? { ...cur, players: [...cur.players, me] } : undefined, "Inscrit!"); }
  if (t.id === "dleave") tx("bets", b.id, cur => cur ? { ...cur, players: cur.players.filter(p => p !== me) } : undefined);
  if (t.id === "dcancel") tx("bets", b.id, cur => cur ? { ...cur, status: "annule" } : undefined, "Partie annulée");
  if (t.id === "droll") {
    t.disabled = true;
    const box = [...document.querySelectorAll("#dice .die")].find(d => d.firstChild.textContent === nm(me));
    let k = 0; const spin = setInterval(() => { if (box) box.querySelector("b").textContent = FACES[k++ % 6] + FACES[(k * 3) % 6]; }, 70);
    setTimeout(() => {
      clearInterval(spin);
      const a = new Uint32Array(2); crypto.getRandomValues(a); const roll = [a[0] % 6 + 1, a[1] % 6 + 1];
      tx("bets", b.id, cur => {
        if (!cur || cur.status !== "ouvert") return undefined;
        const r = cur.round || 1, key = "r" + r, rolls = { ...(cur.rolls || {}) }; rolls[key] = { ...(rolls[key] || {}) };
        if (rolls[key][me]) return undefined;
        rolls[key][me] = roll; const next = { ...cur, rolls };
        return resolveDice(next) || next;
      });
    }, 800);
  }
});

/* ---------- Le poker ---------- */
const tableOpen = () => { const t = A().S.table; return t && t.open ? t : null; };
function pokerTx(fn, msg) { return tx("tables", "main", cur => (cur && cur.open ? fn(cur) : undefined), msg); }
function renderPoker() {
  const { me, esc } = A(); const box = $("#poker"); const t = tableOpen(); const PK = P();
  if (!t) {
    box.innerHTML = `<div class="row2" style="align-items:center"><span class="note">Tapis de départ</span>${[500, 1000, 2000, 5000].map(v => `<button class="round${v === pokerBuyin ? " next" : ""}" data-pb="${v}">${v}</button>`).join("")}</div>
      <button class="btn primary" id="popen">Ouvrir la table à ${J(pokerBuyin)}</button>`;
    return;
  }
  const h = t.hand, live = h && h.street !== "done", seat = t.seats.find(s => s.id === me);
  const pot = h ? Object.values(h.contrib).reduce((a, b) => a + b, 0) : 0;
  const myTurn = live && h.toAct === me;
  if (myTurn) yourTurn("pk" + h.no + h.street + h.log.length, "À toi de jouer au poker!", `Pot : ${J(pot)}. La gang t'attend.`);
  const seatsHTML = t.seats.map(s => {
    const inH = h && h.players.includes(s.id), st = !inH ? "" : h.folded[s.id] ? "couché" : h.allin[s.id] ? "tapis" : "";
    const showCards = h && h.street === "done" && h.shown && inH && !h.folded[s.id];
    return `<li class="pk-seat${live && h.toAct === s.id ? " turn" : ""}${st === "couché" ? " out" : ""}">
      ${A().avatar(A().byId[s.id] || { name: "?", color: "#888" })}
      <span><b>${esc(nm(s.id))}</b>${h && h.dealerId === s.id ? ` <span class="dbtn">D</span>` : ""}<br><span class="note">${J(s.stack)}${st ? " · " + st : ""}${live && inH && h.bet[s.id] ? " · mise " + J(h.bet[s.id]) : ""}${h && h.hands && h.hands[s.id] ? " · " + h.hands[s.id] : ""}</span></span>
      <span class="pk-mini">${showCards ? h.hole[s.id].map(c => PK.cardHTML(c)).join("") : inH && !h.folded[s.id] && live ? PK.cardHTML(null, true) + PK.cardHTML(null, true) : ""}</span></li>`;
  }).join("");
  const board = h ? [0, 1, 2, 3, 4].map(i => PK.cardHTML(h.board[i], !h.board[i])).join("") : "";
  const mine = h && h.hole[me] && !h.folded[me] ? `<div class="pk-hand">${h.hole[me].map(c => PK.cardHTML(c)).join("")}${h.board.length >= 3 ? `<span class="note">${PK.handName(PK.best(h.hole[me].concat(h.board)))}</span>` : ""}</div>` : "";
  let actions = "";
  if (myTurn) {
    const toCall = h.cur - h.bet[me], stack = seat.stack, minT = Math.min(h.cur + h.minRaise, h.bet[me] + stack), maxT = h.bet[me] + stack;
    if (raiseTo == null || raiseTo < minT || raiseTo > maxT) raiseTo = minT;
    const half = Math.min(maxT, h.cur + Math.max(h.minRaise, Math.round(pot / 2))), full = Math.min(maxT, h.cur + Math.max(h.minRaise, pot));
    actions = `<div class="pk-act"><div class="note"><b>À toi de jouer!</b> ${toCall ? `Pour suivre : ${J(Math.min(toCall, stack))}` : "Personne n'a misé."}</div>
      <div class="row2"><button class="btn" data-pa="fold">Se coucher</button>
      <button class="btn primary" data-pa="${toCall ? "call" : "check"}">${toCall ? "Suivre " + J(Math.min(toCall, stack)) : "Passer"}</button>
      ${maxT > h.cur ? `<button class="btn hot" data-pa="allin">Tapis (${J(stack)})</button>` : ""}</div>
      ${maxT > minT ? `<div class="row2" style="align-items:center"><input type="range" id="praise" min="${minT}" max="${maxT}" step="${t.sb}" value="${raiseTo}" aria-label="Montant de la relance">
      <button class="btn primary" data-pa="raise">Relancer à ${J(raiseTo)}</button></div>
      <div class="rounds"><button class="round" data-pr="${minT}">Min</button><button class="round" data-pr="${half}">½ pot</button><button class="round" data-pr="${full}">Pot</button></div>` : ""}</div>`;
  }
  const idle = live && h.toAct !== me && Date.now() - h.since > 60000 && seat;
  const result = h && h.street === "done" && h.result ? `<div class="pk-result">${h.result.map(r => `<b>${esc(nm(r.id))}</b> ramasse ${J(r.amount)}${r.hand ? ` avec ${r.hand.toLowerCase()}` : ""}`).join("<br>")}</div>` : "";
  const log = h ? h.log.slice(-4).map(l => { const [id, txt] = l.includes("|") ? l.split("|") : [null, l]; return `<li>${id ? `<b>${esc(nm(id))}</b> ` : ""}${esc(txt)}</li>`; }).join("") : "";
  box.innerHTML = `<div class="sub">Table ouverte · tapis de départ ${J(t.buyin)} · blinds ${t.sb}/${t.bb}</div>
    <div class="pk-table"><div class="pk-board">${board || `<span class="note">Pas de main en cours.</span>`}</div>${h ? `<div class="pk-pot">Pot : ${J(pot)}${live ? " · " + ({ preflop: "avant le flop", flop: "flop", turn: "turn", river: "river" }[h.street]) : ""}</div>` : ""}</div>
    ${result}${mine}${actions}
    <ul class="people pk-seats">${seatsHTML}</ul>
    ${log ? `<ul class="pk-log">${log}</ul>` : ""}
    <div class="row2">
      ${!seat ? `<button class="btn primary" id="pjoin">Je m'inscris à la table (${J(t.buyin)})</button>` : ""}
      ${seat && !live && t.seats.filter(s => s.stack > 0).length >= 2 ? `<button class="btn primary" id="pdeal">Distribuer la main</button>` : ""}
      ${seat && seat.stack === 0 && !live ? `<button class="toggle" id="prebuy">Me recaver (${J(t.buyin)})</button>` : ""}
      ${seat && !PK.inHandActive(t, me) ? `<button class="toggle" id="pleave">Quitter la table</button>` : ""}
      ${idle ? `<button class="toggle" id="pidle">${esc(nm(h.toAct))} dort : passer son tour</button>` : ""}
      ${seat && !live ? `<button class="toggle" id="pclose">${confirmReset === "table" ? "Confirmer : fermer la table" : "Fermer la table"}</button>` : ""}
    </div>`;
  if (h && h.street === "done" && h.result && !animated.has("hand" + h.no) && Date.now() - h.endedAt < 20000) { animated.add("hand" + h.no); if (h.result.some(r => r.id === me)) confetti(); }
}
$("#poker").addEventListener("input", e => { if (e.target.id === "praise") { raiseTo = +e.target.value; const b = $('[data-pa="raise"]'); if (b) b.textContent = "Relancer à " + J(raiseTo); } });
$("#poker").addEventListener("click", e => {
  const { me } = A(); const t = e.target.closest("button"); if (!t) return; const PK = P();
  if (t.dataset.pb) { pokerBuyin = +t.dataset.pb; return renderPoker(); }
  if (t.dataset.pr) { raiseTo = +t.dataset.pr; return renderPoker(); }
  if (t.id === "popen") { if (needPresent()) return;
    return tx("tables", "main", cur => cur && cur.open ? undefined : { ...PK.join(PK.newTable(pokerBuyin), me), open: true, by: me, week: A().WEEK, created: Date.now() }, "Table ouverte. Les autres peuvent s'inscrire."); }
  if (t.id === "pjoin") { if (needPresent()) return; return pokerTx(c => PK.join(c, me), "Tu es inscrit à la table"); }
  if (t.id === "pdeal") return pokerTx(c => PK.startHand(c));
  if (t.id === "prebuy") return pokerTx(c => PK.rebuy(c, me), "Recave faite");
  if (t.id === "pleave") return pokerTx(c => PK.leave(c, me), "Tu as quitté la table");
  if (t.id === "pidle") return pokerTx(c => PK.timeoutFold(c));
  if (t.dataset.pa) { const a = t.dataset.pa; const amt = raiseTo; raiseTo = null; return pokerTx(c => PK.act(c, me, a, amt)); }
  if (t.id === "pclose") {
    if (confirmReset !== "table") { confirmReset = "table"; setTimeout(() => { confirmReset = false; renderPoker(); }, 4000); return renderPoker(); }
    confirmReset = false;
    let summary = null;
    A().run(A().store.tx("tables", "main", cur => {
      if (!cur || !cur.open || (cur.hand && cur.hand.street !== "done")) return undefined;
      let c = cur; for (const s of cur.seats.slice()) c = PK.leave(c, s.id);
      summary = { buyins: c.buyins, finals: c.cashouts };
      return { open: false, closedAt: Date.now() };
    }).then(() => summary && A().store.tx("bets", newId(), () => ({ type: "poker", week: A().WEEK, status: "fini", ...summary, created: Date.now(), finishedAt: Date.now() }))), "Table fermée. Les résultats sont dans le classement.");
  }
});
setInterval(() => { const t = tableOpen(); if (t && t.hand && t.hand.street !== "done" && !document.querySelector("#praise:active")) renderPoker(); }, 10000);

/* ---------- Sherboy Slots ---------- */
const SYM = [
  ["logo", 1, 500, `<img src="icons/icon-192.png" alt="Logo">`], ["sept", 2, 150, "7"], ["shroom", 2, 100, `<img src="icons/sym-shroom.png" alt="Amanite">`],
  ["beer", 3, 60, `<img src="icons/sym-beer.png" alt="Bière">`], ["lob", 3, 40, `<img src="icons/sym-lob.png" alt="Homard">`],
  ["kite", 4, 30, `<img src="icons/sym-kite.png" alt="Kitesurf">`], ["saw", 4, 20, `<img src="icons/sym-saw.png" alt="Scie à chaîne">`],
  ["rifle", 5, 15, `<img src="icons/sym-rifle.png" alt="Carabine">`], ["melon", 5, 12, "🍉"], ["raisin", 6, 9, "🍇"], ["citron", 6, 8, "🍋"], ["cerise", 7, 6, "🍒"]];
const SYMW = SYM.reduce((a, x) => a + x[1], 0);
const symHTML = k => { const x = SYM.find(z => z[0] === k); return `<span class="sym${k === "sept" ? " seven" : /melon|raisin|citron|cerise/.test(k) ? " fruit" : ""}">${x[3]}</span>`; };
function drawSym() { const a = new Uint32Array(1); crypto.getRandomValues(a); let r = a[0] % SYMW; for (const x of SYM) { if (r < x[1]) return x[0]; r -= x[1]; } }
function slotGain(reels, mise) {
  const [a, b, c] = reels;
  if (a === b && b === c) return mise * SYM.find(x => x[0] === a)[2];
  if (reels.filter(x => x === "cerise").length === 2) return mise * 5;
  if (reels.includes("logo")) return mise * 2;
  if (a === b || b === c || a === c) return mise * 2;
  return 0;
}
let slotMise = 25, slotBusy = false;
function renderSlotStatic() {
  $("#slotmise").innerHTML = [10, 25, 50, 100].map(m => `<button class="round${m === slotMise ? " next" : ""}" data-sm="${m}">${m}</button>`).join("");
  if (!$("#paytable").innerHTML) $("#paytable").innerHTML = SYM.map(x => `<span>${symHTML(x[0]).repeat(3)} × ${x[2]}</span>`).join("") +
    `<span>${symHTML("cerise").repeat(2)} × 5</span><span>un ${symHTML("logo")} × 2</span><span>une paire × 2</span>`;
  const reels = document.querySelectorAll("#slot .reel");
  if (!reels[0].innerHTML) reels.forEach((r, i) => r.innerHTML = symHTML(["logo", "sept", "beer"][i]));
}
$("#slotmise").addEventListener("click", e => { if (e.target.dataset.sm) { slotMise = +e.target.dataset.sm; renderSlotStatic(); } });
$("#slotgo").addEventListener("click", () => {
  if (slotBusy || needPresent()) return;
  slotBusy = true; $("#slotgo").disabled = true; $("#slotresult").textContent = ""; $("#slot").classList.remove("win");
  const final = [drawSym(), drawSym(), drawSym()], gain = slotGain(final, slotMise);
  const reels = [...document.querySelectorAll("#slot .reel")];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  reels.forEach(r => r.classList.add("spin"));
  const timers = reels.map(r => setInterval(() => r.innerHTML = symHTML(SYM[Math.floor(Math.random() * SYM.length)][0]), 80));
  reels.forEach((r, i) => setTimeout(() => {
    clearInterval(timers[i]); r.classList.remove("spin"); r.innerHTML = symHTML(final[i]); navigator.vibrate?.(30);
    if (i === 2) {
      slotBusy = false; $("#slotgo").disabled = false;
      const jackpot = final[0] === "logo" && final[1] === "logo" && final[2] === "logo";
      $("#slotresult").textContent = jackpot ? `GROS LOT!!! +${J(gain)}` : gain > slotMise ? `Gagné : ${J(gain)}!` : gain === slotMise ? "Mise remboursée" : gain ? `Tu récupères ${J(gain)}` : "Pas de chance. Encore une?";
      if (gain >= slotMise * 10) { $("#slot").classList.add("win"); confetti(jackpot ? "big" : ""); }
      else if (gain > slotMise) $("#slot").classList.add("win");
      tx("bets", newId(), () => ({ type: "slot", by: A().me, mise: slotMise, gain, reels: final, week: A().WEEK, status: "fini", created: Date.now() }));
    }
  }, reduce ? 50 * (i + 1) : 900 + i * 550));
});

/* ---------- Les courses : homards et chevaux (même moteur) ---------- */
// [nom, chance de gagner, paiement] : environ 90 % redonné aux parieurs.
const RACES = {
  homards: { label: "course de homards", box: "#racebox", track: "#track", result: "#raceresult", noun: "homard",
    runner: () => `<img src="icons/sym-lob.png" alt="">`, lost: "Ton homard a mangé la poussière.",
    list: [["Pince-Sans-Rire", 0.30, 3], ["Homer le Homard", 0.22, 4], ["Thermidor", 0.18, 5], ["La Bisque", 0.14, 6.5], ["Capitaine Carapace", 0.10, 9], ["Lucky Pinces", 0.06, 15]] },
  chevaux: { label: "course de chevaux", box: "#horsebox", track: "#htrack", result: "#horseresult", noun: "cheval",
    runner: () => `<span class="horse">🏇</span>`, lost: "Ton cheval est encore au paddock.",
    list: [["Éclair de Sherbrooke", 0.30, 3], ["Pinte Express", 0.22, 4], ["Coup de Sabot", 0.18, 5], ["Ti-Galop", 0.14, 6.5], ["Tonnerre du Lac", 0.10, 9], ["Jument Jasette", 0.06, 15]] }
};
const LOBS = RACES.homards.list;
const RACE_MS = 9000, COUNT_MS = 3000;
const raceState = { homards: { mise: 50, pick: 0, anim: null }, chevaux: { mise: 50, pick: 0, anim: null } };
const openRaceOf = type => A().S.bets.find(b => b.type === type && (b.status === "ouvert" || (b.status === "fini" && Date.now() < b.finishAt)));
const lastRaceOf = type => A().S.bets.find(b => b.type === type && b.status === "fini");
const openRace = () => openRaceOf("homards"), lastRace = () => lastRaceOf("homards");
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
// Position (0 à 1) de chaque coureur au temps t : même calcul sur tous les téléphones grâce à la graine.
function racePlan(b, n) {
  const r = rng(b.seed);
  return Array.from({ length: n }, (_, i) => {
    const T = i === b.winner ? RACE_MS * 0.86 : RACE_MS * (0.89 + r() * 0.1);
    return { T, a: 0.06 + r() * 0.08, f: 2 + r() * 4, ph: r() * 6.28 };
  });
}
const posAt = (p, t) => { const u = Math.max(0, Math.min(1, t / p.T)); return Math.min(1, u + p.a * Math.sin(p.f * u * 6.28 + p.ph) * u * (1 - u)); };
function drawTrackOf(type, b, t) {
  const R = RACES[type], tr = $(R.track); const W = Math.max(120, tr.clientWidth - 40 - 40 - 30);   // départ, coureur, arrêt au fil
  if (!tr.dataset.built) {
    tr.innerHTML = R.list.map((l, i) => `<div class="lane" data-lane="${i}"><span class="lname">${i + 1}. ${l[0]} · ×${l[2]}</span><span class="bettors"></span><span class="lob">${R.runner()}</span></div>`).join("");
    tr.dataset.built = 1;
  }
  const plan = b && b.seed ? racePlan(b, R.list.length) : null;
  tr.querySelectorAll(".lane").forEach((ln, i) => {
    const x = plan && t > 0 ? posAt(plan[i], t) : 0;
    ln.querySelector(".lob").style.left = (36 + x * W) + "px";
    ln.classList.toggle("win", !!(b && b.status === "fini" && t >= RACE_MS && b.winner === i));
    ln.querySelector(".bettors").innerHTML = b ? Object.entries(b.bets || {}).filter(([, v]) => v.lob === i).map(([id]) => A().avatar(A().byId[id] || { name: "?", color: "#888" })).join("") : "";
  });
  let cd = tr.querySelector(".countdown");
  if (b && b.status === "fini" && t < 0) { if (!cd) { cd = document.createElement("div"); cd.className = "countdown"; tr.appendChild(cd); } cd.textContent = Math.ceil(-t / 1000); }
  else if (cd) cd.remove();
}
const drawTrack = (b, t) => drawTrackOf("homards", b, t);
function runRaceOf(type, b) {
  const R = RACES[type], st = raceState[type];
  cancelAnimationFrame(st.anim);
  const step = () => {
    const t = Date.now() - b.startAt;
    drawTrackOf(type, b, t);
    if (t < RACE_MS) { st.anim = requestAnimationFrame(step); return; }
    const me = A().me, mine = (b.bets || {})[me];
    $(R.result).textContent = `${R.list[b.winner][0]} gagne la course!` + (mine ? (mine.lob === b.winner ? ` Tu ramasses ${J(Math.round(mine.mise * R.list[b.winner][2]))}!` : " " + R.lost) : "");
    if (!animated.has("race" + b.id)) { animated.add("race" + b.id); if (mine && mine.lob === b.winner) confetti("big"); }
    renderLedger();
    setTimeout(() => { if (!openRaceOf(type)) $(R.box).innerHTML = `<button class="btn primary" data-ropen="${type}">Nouvelle course</button>`; }, 400);
  };
  step();
}
function renderRaceOf(type) {
  const { me, esc } = A(); const R = RACES[type], st = raceState[type], b = openRaceOf(type);
  let html = "";
  if (!b) {
    html = `<button class="btn primary" data-ropen="${type}">Ouvrir une course</button>`;
    const last = lastRaceOf(type);
    if (last && !st.anim) { drawTrackOf(type, last, RACE_MS); $(R.result).textContent = `Dernière course : ${R.list[last.winner][0]} a gagné.`; }
    else if (!last) drawTrackOf(type, null, 0);
  } else if (b.status === "ouvert") {
    const mine = (b.bets || {})[me];
    if (mine) st.pick = mine.lob;
    const n = Object.keys(b.bets || {}).length;
    if (b.by !== me && !mine) yourTurn("inv" + b.id, `${nm(b.by)} ouvre une ${R.label}!`, `Choisis ton ${R.noun} dans l'onglet Casino.`);
    html = `<div class="sub">Course ouverte par ${esc(nm(b.by))} · ${n} parieur${n > 1 ? "s" : ""}. Choisis ton ${R.noun} :</div>
      <div class="picklob">${R.list.map((l, i) => `<button data-lob="${i}" class="${i === st.pick ? "next" : ""}"><span>${i + 1}. ${l[0]}</span><b>×${l[2]}</b></button>`).join("")}</div>
      <div class="row2" style="align-items:center"><span class="note">Mise</span>${miseButtons(st.mise, "rm")}</div>
      <div class="row2"><button class="btn primary" data-rbet="1">${mine ? "Changer mon pari" : "Je parie"} ${st.mise} jetons sur ${R.list[st.pick][0]}</button>
      ${mine ? `<button class="toggle" data-runbet="1">Retirer mon pari</button>` : ""}
      ${(b.by === me || mine) && n >= 1 ? `<button class="btn hot" data-rgo="1">Départ!</button>` : ""}
      ${b.by === me ? `<button class="toggle" data-rcancel="1">Annuler</button>` : ""}</div>`;
    drawTrackOf(type, b, 0); $(R.result).textContent = "";
  } else {
    html = `<div class="sub">Course en cours! Regarde ton ${R.noun}.</div>`;
    runRaceOf(type, b);
  }
  $(R.box).innerHTML = html;
}
const renderRace = () => { renderRaceOf("homards"); renderRaceOf("chevaux"); };
for (const type of Object.keys(RACES)) $(RACES[type].box).addEventListener("click", e => {
  const { me } = A(); const t = e.target.closest("button"); if (!t) return; const R = RACES[type], st = raceState[type];
  if (t.dataset.rm) { st.mise = +t.dataset.rm; return renderRaceOf(type); }
  if (t.dataset.lob) { st.pick = +t.dataset.lob; return renderRaceOf(type); }
  if (t.dataset.ropen) { if (needPresent()) return;
    return tx("bets", newId(), () => ({ type, week: A().WEEK, status: "ouvert", by: me, bets: {}, created: Date.now() }), "Course ouverte. Les autres peuvent parier."); }
  const b = openRaceOf(type); if (!b || b.status !== "ouvert") return;
  if (t.dataset.rbet) { if (needPresent()) return; const pick = st.pick, mise = st.mise;
    tx("bets", b.id, cur => cur && cur.status === "ouvert" ? { ...cur, bets: { ...(cur.bets || {}), [me]: { lob: pick, mise } } } : undefined, `Pari placé sur ${R.list[pick][0]}!`); }
  if (t.dataset.runbet) tx("bets", b.id, cur => { if (!cur || cur.status !== "ouvert") return undefined; const bets = { ...(cur.bets || {}) }; delete bets[me]; return { ...cur, bets }; });
  if (t.dataset.rcancel) tx("bets", b.id, cur => cur && cur.status === "ouvert" ? { ...cur, status: "annule" } : undefined, "Course annulée");
  if (t.dataset.rgo) tx("bets", b.id, cur => {
    if (!cur || cur.status !== "ouvert" || !Object.keys(cur.bets || {}).length) return undefined;
    const a = new Uint32Array(2); crypto.getRandomValues(a);
    let r = a[0] / 4294967296, winner = R.list.length - 1;
    for (let i = 0; i < R.list.length; i++) { if (r < R.list[i][1]) { winner = i; break; } r -= R.list[i][1]; }
    const startAt = Date.now() + COUNT_MS;
    return { ...cur, status: "fini", winner, seed: a[1] || 7, startAt, finishAt: startAt + RACE_MS };
  });
});

/* ---------- La roulette (européenne, un seul zéro) ---------- */
const ROU_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = n => n === 0 ? "vert" : RED.has(n) ? "rouge" : "noir";
const ROU_KINDS = [["rouge", "Rouge"], ["noir", "Noir"], ["pair", "Pair"], ["impair", "Impair"], ["manque", "1 à 18"], ["passe", "19 à 36"], ["d1", "1 à 12"], ["d2", "13 à 24"], ["d3", "25 à 36"]];
const ROU_SPIN = 7000, ROU_LEAD = 1500;
let rouMise = 25, rouAnim = null, rouAngle = 0;
function rouWins(k, v, n) {
  if (k === "num") return v === n ? 36 : 0;
  if (n === 0) return 0;
  if (k === "rouge") return RED.has(n) ? 2 : 0; if (k === "noir") return !RED.has(n) ? 2 : 0;
  if (k === "pair") return n % 2 === 0 ? 2 : 0; if (k === "impair") return n % 2 ? 2 : 0;
  if (k === "manque") return n <= 18 ? 2 : 0; if (k === "passe") return n >= 19 ? 2 : 0;
  if (k[0] === "d") { const d = +k[1]; return n > (d - 1) * 12 && n <= d * 12 ? 3 : 0; }
  return 0;
}
const rouGain = (list, n) => (list || []).reduce((a, x) => a + x.m * rouWins(x.k, x.v, n), 0);
const rouStake = list => (list || []).reduce((a, x) => a + x.m, 0);
const openRou = () => A().S.bets.find(b => b.type === "roulette" && (b.status === "ouvert" || (b.status === "fini" && Date.now() < b.finishAt)));
const lastRou = () => A().S.bets.find(b => b.type === "roulette" && b.status === "fini");
function drawRou(angle, ballOn) {
  const c = $("#rouwheel"), x = c.getContext("2d"), cx = 280, cy = 280, R = 262, seg = 2 * Math.PI / 37;
  x.clearRect(0, 0, 560, 560);
  x.beginPath(); x.arc(cx, cy, R + 14, 0, 2 * Math.PI); x.fillStyle = "#6b3f1f"; x.fill();
  ROU_ORDER.forEach((n, i) => {
    const a0 = angle + i * seg - Math.PI / 2 - seg / 2;
    x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, a0, a0 + seg); x.closePath();
    x.fillStyle = n === 0 ? "#118a3c" : RED.has(n) ? "#c9182b" : "#1d1d1d"; x.fill();
    x.strokeStyle = "#d9b44a"; x.lineWidth = 2; x.stroke();
    x.save(); x.translate(cx, cy); x.rotate(a0 + seg / 2 + Math.PI / 2); x.fillStyle = "#fff"; x.font = "700 22px DM Sans, sans-serif"; x.textAlign = "center"; x.fillText(n, 0, -R + 30); x.restore();
  });
  x.beginPath(); x.arc(cx, cy, R * 0.55, 0, 2 * Math.PI); x.fillStyle = "#5a3418"; x.fill();
  x.beginPath(); x.arc(cx, cy, R * 0.18, 0, 2 * Math.PI); x.fillStyle = "#d9b44a"; x.fill();
  // la bille, en haut de la roue
  const by = ballOn ? cy - R + 54 : cy - R - 2;
  x.beginPath(); x.arc(cx, by, 11, 0, 2 * Math.PI); x.fillStyle = "#fff"; x.fill(); x.strokeStyle = "#999"; x.lineWidth = 2; x.stroke();
  x.beginPath(); x.moveTo(cx - 14, 4); x.lineTo(cx + 14, 4); x.lineTo(cx, 24); x.closePath(); x.fillStyle = "#ffd21f"; x.fill();
}
// Angle final : le numéro gagnant arrive sous la flèche du haut. Même calcul sur tous les téléphones.
function rouAngleAt(b, t) {
  const seg = 2 * Math.PI / 37, idx = ROU_ORDER.indexOf(b.result);
  const end = -idx * seg + 2 * Math.PI * (5 + (b.seed % 3)), u = Math.max(0, Math.min(1, t / ROU_SPIN));
  return end * (1 - Math.pow(1 - u, 3));
}
function runRou(b) {
  cancelAnimationFrame(rouAnim);
  const step = () => {
    const t = Date.now() - b.startAt;
    drawRou(rouAngleAt(b, t), t >= ROU_SPIN * 0.92);
    if (t < ROU_SPIN) { rouAnim = requestAnimationFrame(step); $("#rouresult").textContent = t < 0 ? "Rien ne va plus…" : "La bille tourne…"; return; }
    const me = A().me, mine = (b.bets || {})[me], g = rouGain(mine, b.result), st = rouStake(mine);
    $("#rouresult").textContent = `${b.result} ${colorOf(b.result)}!` + (mine ? (g ? ` Tu ramasses ${J(g)}!` : " La banque garde ta mise.") : "");
    if (!animated.has("rou" + b.id)) { animated.add("rou" + b.id); if (g > st) confetti(b.result === 0 || g >= st * 10 ? "big" : ""); }
    renderLedger();
    setTimeout(() => { if (!openRou()) renderRou(); }, 400);
  };
  step();
}
function renderRou() {
  const { me, esc } = A(); const b = openRou();
  if (!b) {
    const last = lastRou();
    if (!rouAnim) drawRou(last ? rouAngleAt(last, ROU_SPIN) : 0, !!last);
    if (last && !rouAnim) $("#rouresult").textContent = `Dernier tour : ${last.result} ${colorOf(last.result)}.`;
    $("#roubox").innerHTML = `<button class="btn primary" id="rouopen">Ouvrir la table de roulette</button>`; return;
  }
  if (b.status === "fini") { $("#roubox").innerHTML = `<div class="sub">Rien ne va plus! La roue tourne.</div>`; runRou(b); return; }
  const mine = (b.bets || {})[me] || [], n = Object.keys(b.bets || {}).length;
  if (b.by !== me && !mine.length) yourTurn("inv" + b.id, `${nm(b.by)} ouvre la roulette!`, "Place tes mises dans l'onglet Casino.");
  const chip = (k, v) => { const sum = mine.filter(x => x.k === k && x.v === v).reduce((a, x) => a + x.m, 0); return sum ? `<span class="chip">${sum}</span>` : ""; };
  drawRou(0, false); $("#rouresult").textContent = "Faites vos jeux!";
  $("#roubox").innerHTML = `<div class="sub">Table ouverte par ${esc(nm(b.by))} · ${n} joueur${n > 1 ? "s" : ""}. Touche une case pour miser ${rouMise} jetons.</div>
    <div class="row2" style="align-items:center"><span class="note">Jeton</span>${miseButtons(rouMise, "roum")}</div>
    <div class="rbets">${ROU_KINDS.map(([k, l]) => `<button data-rk="${k}" class="${k === "rouge" ? "rouge" : k === "noir" ? "noir" : ""}">${l}${chip(k, null)}</button>`).join("")}</div>
    <div class="rnums"><button data-rn="0" class="vert">0${chip("num", 0)}</button>${Array.from({ length: 36 }, (_, i) => i + 1).map(n => `<button data-rn="${n}" class="${colorOf(n)}">${n}${chip("num", n)}</button>`).join("")}</div>
    <div class="note">Tes mises : ${J(rouStake(mine))}${Object.entries(b.bets || {}).filter(([id]) => id !== me).map(([id, l]) => ` · ${esc(nm(id))} : ${J(rouStake(l))}`).join("")}</div>
    <div class="row2">${mine.length ? `<button class="toggle" id="rouclear">Retirer mes mises</button>` : ""}
    ${(b.by === me || mine.length) && n >= 1 ? `<button class="btn hot" id="rouspin">Lancer la bille</button>` : ""}
    ${b.by === me ? `<button class="toggle" id="roucancel">Fermer la table</button>` : ""}</div>`;
}
$("#roubox").addEventListener("click", e => {
  const { me } = A(); const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.roum) { rouMise = +t.dataset.roum; return renderRou(); }
  if (t.id === "rouopen") { if (needPresent()) return;
    return tx("bets", newId(), () => ({ type: "roulette", week: A().WEEK, status: "ouvert", by: me, bets: {}, created: Date.now() }), "Table de roulette ouverte"); }
  const b = openRou(); if (!b || b.status !== "ouvert") return;
  const add = (k, v) => { if (needPresent()) return; const m = rouMise;
    tx("bets", b.id, cur => cur && cur.status === "ouvert" ? { ...cur, bets: { ...(cur.bets || {}), [me]: [...((cur.bets || {})[me] || []), { k, v, m }].slice(-40) } } : undefined); };
  if (t.dataset.rk) add(t.dataset.rk, null);
  if (t.dataset.rn != null) add("num", +t.dataset.rn);
  if (t.id === "rouclear") tx("bets", b.id, cur => { if (!cur || cur.status !== "ouvert") return undefined; const bets = { ...(cur.bets || {}) }; delete bets[me]; return { ...cur, bets }; });
  if (t.id === "roucancel") tx("bets", b.id, cur => cur && cur.status === "ouvert" ? { ...cur, status: "annule" } : undefined, "Table fermée");
  if (t.id === "rouspin") tx("bets", b.id, cur => {
    if (!cur || cur.status !== "ouvert" || !Object.keys(cur.bets || {}).length) return undefined;
    const a = new Uint32Array(2); crypto.getRandomValues(a);
    const startAt = Date.now() + ROU_LEAD;
    return { ...cur, status: "fini", result: a[0] % 37, seed: a[1], startAt, finishAt: startAt + ROU_SPIN };
  });
});

/* ---------- Plinko ---------- */
const PLK_MULT = [33, 11, 4, 2, 1.1, 0.5, 0.3, 0.5, 1.1, 2, 4, 11, 33];   // environ 95 % redonné
const PLK_ROWS = 12;
let plkMise = 25, plkBusy = false;
function plkGeom() { const c = $("#plinko"), W = c.width, H = c.height, top = 40, gap = (H - 130) / PLK_ROWS, dx = (W - 40) / (PLK_ROWS + 1); return { c, W, H, top, gap, dx }; }
function drawPlinko(ball, hit) {
  const { c, W, H, top, gap, dx } = plkGeom(), x = c.getContext("2d");
  const cs = getComputedStyle(document.documentElement), tok = v => cs.getPropertyValue(v).trim();
  x.clearRect(0, 0, W, H);
  for (let r = 0; r < PLK_ROWS; r++) for (let k = 0; k <= r + 2; k++) {
    const px = W / 2 + (k - (r + 2) / 2) * dx, py = top + r * gap;
    x.beginPath(); x.arc(px, py, 5, 0, 2 * Math.PI); x.fillStyle = tok("--muted"); x.fill();
  }
  const cols = ["#ff2e88", "#ff5a3c", "#ff7a1a", "#ffb31f", "#e3c21f", "#9ccf2a", "#3aa61c", "#9ccf2a", "#e3c21f", "#ffb31f", "#ff7a1a", "#ff5a3c", "#ff2e88"];
  PLK_MULT.forEach((m, i) => {
    const px = W / 2 + (i - PLK_ROWS / 2) * dx, py = top + PLK_ROWS * gap + 18;
    x.fillStyle = cols[i]; x.globalAlpha = hit === i ? 1 : 0.85;
    x.beginPath(); x.roundRect ? x.roundRect(px - dx / 2 + 2, py, dx - 4, 34, 6) : x.rect(px - dx / 2 + 2, py, dx - 4, 34); x.fill();
    x.globalAlpha = 1; x.fillStyle = "#1b1610"; x.font = `800 ${dx > 34 ? 15 : 12}px DM Sans, sans-serif`; x.textAlign = "center"; x.fillText("×" + m, px, py + 23);
    if (hit === i) { x.strokeStyle = "#fff"; x.lineWidth = 4; x.stroke(); }
  });
  if (ball) { x.beginPath(); x.arc(ball.x, ball.y, 10, 0, 2 * Math.PI); x.fillStyle = "#e8262b"; x.fill(); x.strokeStyle = "#fff"; x.lineWidth = 3; x.stroke(); }
}
function renderPlinkoStatic() {
  $("#plkmise").innerHTML = [10, 25, 50, 100].map(m => `<button class="round${m === plkMise ? " next" : ""}" data-pm="${m}">${m}</button>`).join("");
  if (!plkBusy) drawPlinko(null, null);
}
$("#plkmise").addEventListener("click", e => { if (e.target.dataset.pm) { plkMise = +e.target.dataset.pm; renderPlinkoStatic(); } });
$("#plkgo").addEventListener("click", () => {
  if (plkBusy || needPresent()) return;
  plkBusy = true; $("#plkgo").disabled = true; $("#plkresult").textContent = "";
  const a = new Uint32Array(1); crypto.getRandomValues(a);
  const moves = Array.from({ length: PLK_ROWS }, (_, i) => (a[0] >> i) & 1), slot = moves.reduce((s, m) => s + m, 0);
  const mise = plkMise, gain = Math.round(mise * PLK_MULT[slot]);
  // Le résultat est enregistré tout de suite : rien ne se perd si le téléphone se met en veille pendant la chute.
  tx("bets", newId(), () => ({ type: "plinko", by: A().me, mise, gain, slot, week: A().WEEK, status: "fini", created: Date.now() }));
  const { W, top, gap, dx } = plkGeom();
  // points de passage : la bille descend de clou en clou
  const pts = [{ x: W / 2, y: top - 30 }]; let k = 0;
  for (let r = 0; r < PLK_ROWS; r++) { k += moves[r]; pts.push({ x: W / 2 + (k - (r + 1) / 2) * dx, y: top + r * gap + gap / 2 }); }
  pts.push({ x: W / 2 + (slot - PLK_ROWS / 2) * dx, y: top + PLK_ROWS * gap + 30 });
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, per = reduce ? 1 : 140, t0 = performance.now();
  (function step(t) {
    const p = (t - t0) / per, i = Math.min(pts.length - 2, Math.floor(p)), u = Math.min(1, p - i);
    const A1 = pts[i], B = pts[i + 1];
    const ball = { x: A1.x + (B.x - A1.x) * u, y: A1.y + (B.y - A1.y) * u - Math.sin(u * Math.PI) * 10 };
    drawPlinko(ball, null);
    if (p < pts.length - 1) return requestAnimationFrame(step);
    drawPlinko(pts[pts.length - 1], slot); navigator.vibrate?.(40);
    plkBusy = false; $("#plkgo").disabled = false;
    $("#plkresult").textContent = gain > mise ? `×${PLK_MULT[slot]} : tu ramasses ${J(gain)}!` : gain === mise ? "Mise remboursée" : `×${PLK_MULT[slot]} : tu récupères ${J(gain)}`;
    if (PLK_MULT[slot] >= 11) confetti(PLK_MULT[slot] >= 33 ? "big" : "");
  })(t0);
});

/* ---------- Défis d'adresse : bûcheron et tir (même moteur) ---------- */
// Quelqu'un ouvre un défi, les autres s'inscrivent, chacun joue sur son téléphone. Le meilleur score ramasse le pot.
const DEFIS_A = {
  bucheron: { label: "concours de bûcheron", box: "#lumberbox", arena: "#lumberarena", unit: "coups", play: playLumber },
  tir: { label: "tir aux canettes", box: "#tirbox", arena: "#tirarena", unit: "points", play: playTir }
};
const defiMise = { bucheron: 50, tir: 50 };
let playing = null;
const openDefi = g => A().S.bets.find(b => b.type === "defi" && b.game === g && b.status === "ouvert");
const lastDefi = g => A().S.bets.find(b => b.type === "defi" && b.game === g && b.status === "fini");
function resolveDefi(b) {
  if (b.players.length < 2 || !b.players.every(p => b.scores && b.scores[p] != null)) return undefined;
  const top = Math.max(...b.players.map(p => b.scores[p])), winners = b.players.filter(p => b.scores[p] === top);
  return { ...b, status: "fini", winners, finishedAt: Date.now() };
}
function renderDefi(g) {
  const { me, esc } = A(); const D2 = DEFIS_A[g], b = openDefi(g), last = lastDefi(g);
  if (playing === g) return;
  let html;
  if (!b) {
    html = `<div class="row2" style="align-items:center"><span class="note">Mise</span>${miseButtons(defiMise[g], "dm-" + g)}</div>
      <div class="row2"><button class="btn primary" data-dopen="${g}">Lancer un défi à ${defiMise[g]} jetons</button><button class="toggle" data-dprac="${g}">Pratique (sans mise)</button></div>`;
    if (last) html += `<div class="note">Dernier défi : ${last.winners.map(nm).join(" et ")} avec ${Math.max(...Object.values(last.scores))} ${D2.unit}. ${last.players.map(p => `${esc(nm(p))} ${last.scores[p]}`).join(" · ")}</div>`;
  } else {
    const joined = b.players.includes(me), done = b.scores && b.scores[me] != null;
    if (!joined && b.by !== me) yourTurn("inv" + b.id, `${nm(b.by)} te lance un défi : ${D2.label}!`, `Mise : ${b.mise} jetons. Inscris-toi dans l'onglet Casino.`);
    html = `<div class="sub">Défi lancé par ${esc(nm(b.by))} : <b>${b.mise} jetons</b> chacun. Pot : <b>${J(b.mise * b.players.length)}</b>.</div>
      <div class="rounds">${b.players.map(p => `<span class="round ${b.scores && b.scores[p] != null ? "on" : ""}">${esc(nm(p))}${b.scores && b.scores[p] != null ? " · " + b.scores[p] : " · à jouer"}</span>`).join("")}</div>
      <div class="row2">${!joined ? `<button class="btn primary" data-djoin="${g}">Je m'inscris (${b.mise} jetons)</button>` : ""}
      ${joined && !done ? `<button class="btn hot" data-dplay="${g}">À moi de jouer!</button>` : ""}
      ${joined && !done && !Object.keys(b.scores || {}).length ? `<button class="toggle" data-dleave="${g}">Me retirer</button>` : ""}
      ${b.by === me ? `<button class="toggle" data-dclose="${g}">${Object.keys(b.scores || {}).length >= 2 ? "Terminer avec ceux qui ont joué" : "Annuler"}</button>` : ""}</div>
      ${joined && !done ? "" : `<div class="note">${done ? "Ton score est enregistré. On attend les autres." : ""}</div>`}`;
    if (joined && !done) yourTurn("play" + b.id, `À toi de jouer : ${D2.label}!`, "Les autres attendent ton score.");
    const r = resolveDefi(b); if (r) tx("bets", b.id, cur => cur && cur.status === "ouvert" ? resolveDefi(cur) : undefined);
  }
  if (last && !animated.has("defi" + last.id) && Date.now() - last.finishedAt < 30000) { animated.add("defi" + last.id); if (last.winners.includes(me)) { confetti("big"); A().toast(`Tu gagnes le ${D2.label}!`); } }
  $(D2.box).innerHTML = html;
}
function startPlay(g, onScore) {
  playing = g; const D2 = DEFIS_A[g], ar = $(D2.arena); ar.hidden = false; ar.scrollIntoView({ block: "center", behavior: "smooth" });
  $(D2.box).innerHTML = `<div class="note">C'est parti! Donne tout.</div>`;
  let n = 3; ar.innerHTML = `<div class="big">3</div>`;
  const cd = setInterval(() => { n--; if (n > 0) ar.querySelector(".big").textContent = n; else { clearInterval(cd); D2.play(ar, score => { playing = null; onScore(score); setTimeout(() => { ar.hidden = true; renderDefi(g); }, 1800); }); } }, 700);
}
for (const g of Object.keys(DEFIS_A)) $(DEFIS_A[g].box).addEventListener("click", e => {
  const { me } = A(); const t = e.target.closest("button"); if (!t) return;
  if (t.dataset["dm-" + g] !== undefined || t.getAttribute("data-dm-" + g)) { defiMise[g] = +t.getAttribute("data-dm-" + g); return renderDefi(g); }
  if (t.dataset.dprac) return startPlay(g, sc => A().toast(`Pratique : ${sc} ${DEFIS_A[g].unit}`));
  if (t.dataset.dopen) { if (needPresent()) return;
    return tx("bets", newId(), () => ({ type: "defi", game: g, week: A().WEEK, status: "ouvert", mise: defiMise[g], players: [me], scores: {}, by: me, created: Date.now() }), "Défi lancé! Les autres peuvent s'inscrire."); }
  const b = openDefi(g); if (!b) return;
  if (t.dataset.djoin) { if (needPresent()) return; tx("bets", b.id, cur => cur && cur.status === "ouvert" && !cur.players.includes(me) ? { ...cur, players: [...cur.players, me] } : undefined, "Inscrit au défi!"); }
  if (t.dataset.dleave) tx("bets", b.id, cur => cur ? { ...cur, players: cur.players.filter(p => p !== me) } : undefined);
  if (t.dataset.dclose) tx("bets", b.id, cur => {
    if (!cur || cur.status !== "ouvert") return undefined;
    const played = cur.players.filter(p => cur.scores && cur.scores[p] != null);
    if (played.length < 2) return { ...cur, status: "annule" };
    return resolveDefi({ ...cur, players: played });
  });
  if (t.dataset.dplay) startPlay(g, score => tx("bets", b.id, cur => {
    if (!cur || cur.status !== "ouvert" || !cur.players.includes(me) || (cur.scores || {})[me] != null) return undefined;
    const next = { ...cur, scores: { ...(cur.scores || {}), [me]: score } };
    return resolveDefi(next) || next;
  }, `Score enregistré : ${score}`));
});

/* Bûcheron : alterner gauche et droite pendant 10 secondes */
function playLumber(ar, done) {
  let hits = 0, next = "g", left = 10, maxH = 230;
  ar.innerHTML = `<div class="hud"><span>🪓 <b id="lhits">0</b> coups</span><span>⏱ <b id="ltime">10</b> s</span></div>
    <div class="tree" style="height:${maxH}px"></div><div class="chips"></div>
    <div class="axes"><button data-side="g" class="next-side">◀ Hache</button><button data-side="d">Hache ▶</button></div>`;
  const tree = ar.querySelector(".tree"), chips = ar.querySelector(".chips");
  const onHit = e => {
    const b = e.target.closest("[data-side]"); if (!b || left <= 0) return; e.preventDefault();
    if (b.dataset.side !== next) { navigator.vibrate?.(60); return; }   // même côté deux fois : ça ne compte pas
    hits++; next = next === "g" ? "d" : "g"; navigator.vibrate?.(8);
    ar.querySelector("#lhits").textContent = hits;
    ar.querySelectorAll("[data-side]").forEach(x => x.classList.toggle("next-side", x.dataset.side === next));
    tree.style.height = Math.max(20, maxH - hits * 2.2) + "px";
    const c = document.createElement("i"); c.className = "chip-w"; c.style.left = (50 + (b.dataset.side === "g" ? -8 : 8)) + "%"; c.style.setProperty("--dx", (b.dataset.side === "g" ? -1 : 1) * (30 + Math.random() * 60) + "px");
    chips.appendChild(c); setTimeout(() => c.remove(), 650);
  };
  ar.addEventListener("pointerdown", onHit);
  const timer = setInterval(() => {
    left--; ar.querySelector("#ltime").textContent = left;
    if (left <= 0) { clearInterval(timer); ar.removeEventListener("pointerdown", onHit);
      ar.insertAdjacentHTML("beforeend", `<div class="big">${hits >= 60 ? "TIMBER!" : hits} </div>`); done(hits); }
  }, 1000);
}

/* Tir aux canettes : 20 secondes */
function playTir(ar, done) {
  let score = 0, left = 20, live = true;
  ar.innerHTML = `<div class="hud"><span>🎯 <b id="tscore">0</b> points</span><span>⏱ <b id="ttime">20</b> s</span></div>`;
  const spawn = () => {
    if (!live) return;
    const r = Math.random(), kind = r < 0.12 ? "gold" : r < 0.27 ? "shroom" : "can";
    const el = document.createElement("button"); el.className = "target " + (kind === "gold" ? "gold" : "");
    el.innerHTML = kind === "shroom" ? `<img src="icons/sym-shroom.png" alt="Amanite">` : `<img src="icons/sym-beer.png" alt="Canette">`;
    el.style.left = (12 + Math.random() * 76) + "%"; el.style.top = (22 + Math.random() * 68) + "%"; el.dataset.kind = kind;
    ar.appendChild(el);
    setTimeout(() => el.remove(), kind === "gold" ? 650 : 950);
    setTimeout(spawn, 280 + Math.random() * 380);
  };
  const shoot = e => {
    const t = e.target.closest(".target"); if (!t || !live) return; e.preventDefault();
    const pts = t.dataset.kind === "gold" ? 3 : t.dataset.kind === "shroom" ? -2 : 1;
    score = Math.max(0, score + pts); ar.querySelector("#tscore").textContent = score; navigator.vibrate?.(pts > 0 ? 15 : 80);
    const b = document.createElement("span"); b.className = "boom"; b.textContent = pts > 0 ? `💥+${pts}` : "🍄-2"; b.style.left = t.style.left; b.style.top = t.style.top;
    ar.appendChild(b); setTimeout(() => b.remove(), 520); t.remove();
  };
  ar.addEventListener("pointerdown", shoot);
  spawn();
  const timer = setInterval(() => {
    left--; ar.querySelector("#ttime").textContent = left;
    if (left <= 0) { clearInterval(timer); live = false; ar.removeEventListener("pointerdown", shoot); ar.querySelectorAll(".target").forEach(x => x.remove());
      ar.insertAdjacentHTML("beforeend", `<div class="big">${score} pts</div>`); done(score); }
  }, 1000);
}

/* ---------- Quiz geek : solo contre la banque ---------- */
const QUIZ = [
  ["Dans Star Wars, quelle est la planète natale de Luke Skywalker?", ["Tatooine", "Hoth", "Naboo", "Endor"]],
  ["Que veut dire « HTML »?", ["HyperText Markup Language", "High Tech Modern Language", "Hyper Transfer Mail Link", "Home Tool Markup Language"]],
  ["Quel plombier moustachu est la mascotte de Nintendo?", ["Mario", "Luigi", "Wario", "Toad"]],
  ["Combien de bits dans un octet?", ["8", "4", "16", "10"]],
  ["Quelle est la plus grosse planète du système solaire?", ["Jupiter", "Saturne", "Neptune", "La Terre"]],
  ["Dans Le Seigneur des anneaux, qui porte l'anneau jusqu'au Mordor?", ["Frodon", "Gandalf", "Aragorn", "Legolas"]],
  ["Quel langage est surtout utilisé pour animer les pages web dans le navigateur?", ["JavaScript", "COBOL", "Fortran", "Pascal"]],
  ["Dans Minecraft, quelle créature verte explose quand elle s'approche?", ["Le Creeper", "Le Zombie", "L'Enderman", "Le Squelette"]],
  ["Qui a fondé Microsoft avec Paul Allen?", ["Bill Gates", "Steve Jobs", "Elon Musk", "Mark Zuckerberg"]],
  ["Quel est le symbole chimique de l'or?", ["Au", "Or", "Ag", "Go"]],
  ["Dans Star Trek, quel est le prénom du capitaine Kirk?", ["James", "Jean-Luc", "William", "Benjamin"]],
  ["Quel jeu vidéo met en vedette un hérisson bleu très rapide?", ["Sonic", "Crash Bandicoot", "Spyro", "Rayman"]],
  ["En binaire, combien vaut 1010?", ["10", "12", "5", "1010"]],
  ["Quelle mission a posé les premiers humains sur la Lune en 1969?", ["Apollo 11", "Apollo 13", "Gemini 4", "Artemis 1"]],
  ["Dans Retour vers le futur, à quelle vitesse la DeLorean voyage dans le temps?", ["88 milles à l'heure", "100 milles à l'heure", "65 milles à l'heure", "120 milles à l'heure"]],
  ["Qui a créé le système d'exploitation Linux?", ["Linus Torvalds", "Richard Stallman", "Ken Thompson", "Tim Berners-Lee"]],
  ["Dans Pac-Man, combien de fantômes poursuivent Pac-Man?", ["4", "3", "5", "6"]],
  ["Quel super-héros est aussi Bruce Wayne?", ["Batman", "Superman", "Iron Man", "Spider-Man"]],
  ["Quelle est l'étoile la plus proche de la Terre?", ["Le Soleil", "Proxima du Centaure", "Sirius", "L'étoile polaire"]],
  ["Dans The Legend of Zelda, comment s'appelle le héros?", ["Link", "Zelda", "Ganon", "Epona"]],
  ["Que signifie « CPU »?", ["Central Processing Unit", "Computer Power Unit", "Central Program Utility", "Core Personal Unit"]],
  ["Dans Matrix, quelle pilule Neo avale-t-il?", ["La rouge", "La bleue", "La verte", "Aucune"]],
  ["Quel est le jeu vidéo de blocs qui tombent, créé en URSS en 1984?", ["Tetris", "Pong", "Breakout", "Space Invaders"]],
  ["Combien de lunes a la planète Mars?", ["2", "1", "0", "4"]],
  ["Dans Harry Potter, quel est le nom de la chouette d'Harry?", ["Hedwige", "Croûtard", "Buck", "Pattenrond"]],
  ["Quelle compagnie fabrique les consoles PlayStation?", ["Sony", "Nintendo", "Microsoft", "Sega"]],
  ["Quel nombre est la « réponse à la grande question » dans Le Guide du voyageur galactique?", ["42", "7", "13", "100"]],
  ["Quel animal est la mascotte de Linux?", ["Un manchot", "Un renard", "Un éléphant", "Un hibou"]],
  ["Dans Star Wars, qui dit « Je suis ton père »?", ["Dark Vador", "Yoda", "Obi-Wan Kenobi", "L'Empereur"]],
  ["Quelle unité mesure la fréquence d'un processeur?", ["Le hertz", "Le watt", "L'octet", "Le volt"]]
];
const QUIZ_PAY = [0, 0, 0, 1, 2, 4];
let quizMise = 25, quiz = null;
function renderQuiz() {
  const box = $("#quizbox");
  if (!quiz) {
    box.innerHTML = `<div class="row2" style="align-items:center"><span class="note">Mise</span>${miseButtons(quizMise, "qm")}</div>
      <button class="btn primary" data-qstart="1">Commencer le quiz (${quizMise} jetons)</button>`;
    return;
  }
  const q = quiz.qs[quiz.i];
  if (!q) {
    const gain = quizMise * QUIZ_PAY[quiz.score];
    box.innerHTML = `<div class="quiz-q">${quiz.score} sur 5!</div><div class="result">${gain > quizMise ? `Tu ramasses ${J(gain)}!` : gain === quizMise ? "Mise remboursée." : "La banque garde ta mise. Révise ton Star Wars!"}</div>
      <button class="btn primary" data-qagain="1">Rejouer</button>`;
    return;
  }
  box.innerHTML = `<div class="note">Question ${quiz.i + 1} sur 5 · ${quiz.score} bonne${quiz.score > 1 ? "s" : ""} réponse${quiz.score > 1 ? "s" : ""}</div>
    <div class="quiz-q">${A().esc(q.t)}</div>
    <div class="quiz-a">${q.opts.map((o, i) => `<button data-qa="${i}">${A().esc(o)}</button>`).join("")}</div>`;
}
$("#quizbox").addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.qm) { quizMise = +t.dataset.qm; return renderQuiz(); }
  if (t.dataset.qagain) { quiz = null; return renderQuiz(); }
  if (t.dataset.qstart) {
    if (needPresent()) return;
    const pool = QUIZ.map((q, i) => i).sort(() => Math.random() - 0.5).slice(0, 5);
    quiz = { i: 0, score: 0, qs: pool.map(i => { const [t2, ans] = QUIZ[i]; const opts = ans.slice().sort(() => Math.random() - 0.5); return { t: t2, opts, good: opts.indexOf(ans[0]) }; }) };
    return renderQuiz();
  }
  if (t.dataset.qa != null && quiz && !quiz.lock) {
    const q = quiz.qs[quiz.i], pick = +t.dataset.qa; quiz.lock = true;
    document.querySelectorAll("#quizbox [data-qa]").forEach((b, i) => { if (i === q.good) b.classList.add("good"); else if (i === pick) b.classList.add("bad"); });
    if (pick === q.good) quiz.score++; else navigator.vibrate?.(60);
    setTimeout(() => {
      quiz.lock = false; quiz.i++;
      if (quiz.i >= 5) {
        const gain = quizMise * QUIZ_PAY[quiz.score];
        tx("bets", newId(), () => ({ type: "quiz", by: A().me, mise: quizMise, gain, score: quiz.score, week: A().WEEK, status: "fini", created: Date.now() }));
        if (quiz.score === 5) confetti("big");
      }
      renderQuiz();
    }, 900);
  }
});

/* ---------- Classement ---------- */
function renderLedger() {
  const { esc, MEMBERS, shortDate } = A(); const bets = A().S.bets;
  const resetAt = (bets.find(b => b.type === "zero") || {}).created || 0;
  const net = {}; MEMBERS.forEach(m => net[m.id] = 0);   // gains et pertes depuis la dernière remise à zéro
  const hist = [];
  for (const b of bets) {
    if (b.status !== "fini" || b.created < resetAt) continue;
    if (b.type === "roue" || b.type === "des") { b.players.forEach(p => net[p] -= b.mise); net[b.winner] += b.mise * b.players.length; hist.push(`${b.type === "roue" ? "Roue" : "Dés"} : ${nm(b.winner)} +${J(b.mise * (b.players.length - 1))}`); }
    else if (RACES[b.type]) {
      if (Date.now() < b.finishAt) continue;   // pas de spoiler avant l'arrivée
      const L = RACES[b.type].list; let best = null;
      for (const [id, v] of Object.entries(b.bets || {})) { const g = v.lob === b.winner ? Math.round(v.mise * L[b.winner][2]) : 0; net[id] = (net[id] || 0) + g - v.mise; if (g && (!best || g > best.g)) best = { id, g: g - v.mise }; }
      hist.push(`${b.type === "homards" ? "Homards" : "Chevaux"} : ${L[b.winner][0]} gagne${best ? ` · ${nm(best.id)} +${J(best.g)}` : ""}`);
    }
    else if (b.type === "roulette") {
      if (Date.now() < b.finishAt) continue;
      let best = null;
      for (const [id, list] of Object.entries(b.bets || {})) { const d = rouGain(list, b.result) - rouStake(list); net[id] = (net[id] || 0) + d; if (d > 0 && (!best || d > best.d)) best = { id, d }; }
      hist.push(`Roulette : ${b.result} ${colorOf(b.result)}${best ? ` · ${nm(best.id)} +${J(best.d)}` : ""}`);
    }
    else if (b.type === "defi") {
      const pot = b.mise * b.players.length, share = Math.floor(pot / b.winners.length);
      b.players.forEach(p => net[p] = (net[p] || 0) - b.mise); b.winners.forEach(w => net[w] = (net[w] || 0) + share);
      hist.push(`${b.game === "tir" ? "Tir" : "Bûcheron"} : ${b.winners.map(nm).join(" et ")} +${J(share - b.mise)}`);
    }
    else if (b.type === "quiz") { net[b.by] = (net[b.by] || 0) + b.gain - b.mise; if (b.score === 5) hist.push(`Quiz geek : ${nm(b.by)} 5 sur 5!`); else continue; }
    else if (b.type === "plinko") { net[b.by] = (net[b.by] || 0) + b.gain - b.mise; if (b.gain >= b.mise * 11) hist.push(`Plinko : ${nm(b.by)} +${J(b.gain - b.mise)}`); else continue; }
    else if (b.type === "slot") { net[b.by] = (net[b.by] || 0) + b.gain - b.mise; if (b.gain >= b.mise * 10) hist.push(`Slots : ${nm(b.by)} +${J(b.gain - b.mise)}`); else continue; }
    else if (b.type === "poker") { const ids = new Set([...Object.keys(b.buyins || {}), ...Object.keys(b.finals || {})]);
      let top = null; ids.forEach(id => { const d = (b.finals[id] || 0) - (b.buyins[id] || 0); net[id] = (net[id] || 0) + d; if (!top || d > top.d) top = { id, d }; });
      if (top) hist.push(`Poker : ${nm(top.id)} ${top.d >= 0 ? "+" : ""}${J(top.d)}`); }
    else continue;
    hist[hist.length - 1] = shortDate((d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)(new Date(b.created))) + "|" + hist[hist.length - 1];
  }
  // Compte en banque : 1 000 jetons au départ, plus tous les gains et pertes. Gardé pour toujours dans Firebase.
  const bal = id => START + (net[id] || 0);
  const myBal = bal(A().me);
  $("#bank").innerHTML = A().me ? `<span class="eyebrow">Ton compte en banque</span><b class="money ${myBal < 0 ? "moins" : ""}">${J(myBal)}</b><span class="note">${myBal < 0 ? "Dans le rouge! La banque te fait confiance… pour l'instant." : myBal > START ? `${J(myBal - START)} de profit depuis le départ.` : "Tout le monde part avec " + J(START) + "."}</span>` : "";
  const rows = Object.entries(net).sort((a, b) => b[1] - a[1]);
  $("#ledger").innerHTML = rows.map(([id, v], i) => `<li>${A().avatar(A().byId[id] || { name: "?", color: "#888" })}<span>${esc(nm(id))}${i === 0 && v > 0 ? ` <span class="note">— Roi des jetons 👑</span>` : ""}</span><span class="pill" style="border:none"><span class="money ${START + v < 0 ? "moins" : ""}">${J(START + v)}</span> <span class="note">(${v >= 0 ? "+" : ""}${Math.round(v).toLocaleString("fr-CA")})</span></span></li>`).join("");
  $("#bethist").innerHTML = hist.slice(0, 8).map(l => { const [d, t] = l.split("|"); return `<li><span class="d">${esc(d)}</span><span>${esc(t)}</span><span></span></li>`; }).join("") || `<li class="empty" style="display:block">Aucun gage encore. Ouvre la roue ou une partie de dés!</li>`;
  $("#settledone").textContent = confirmReset === "zero" ? "Confirmer : tout le monde à 1 000 jetons" : "Remettre tous les comptes à 1 000 jetons";
}
$("#settledone").addEventListener("click", () => {
  if (confirmReset !== "zero") { confirmReset = "zero"; setTimeout(() => { confirmReset = false; renderLedger(); }, 4000); return renderLedger(); }
  confirmReset = false; tx("bets", newId(), () => ({ type: "zero", status: "fini", by: A().me, created: Date.now() }), "Tous les comptes sont revenus à 1 000 jetons");
});

function render() { if (!window.JSAPI) return; renderSlotStatic(); renderPlinkoStatic(); renderRou(); renderRace(); renderDefi("bucheron"); renderDefi("tir"); if (!quiz) renderQuiz(); renderWheel(); renderDice(); renderLedger(); }
window.Gages = { render, renderPoker };
// En ouvrant l'onglet Gages, on redessine la piste à la bonne largeur.
document.querySelector('nav.tabs [data-t="gages"]')?.addEventListener("click", () => setTimeout(() => { render(); renderPoker(); }, 30));
addEventListener("resize", () => { for (const type of Object.keys(RACES)) { const b = openRaceOf(type) || lastRaceOf(type); if (b && !raceState[type].anim) drawTrackOf(type, b, b.status === "fini" ? RACE_MS : 0); } });
render(); renderPoker();
