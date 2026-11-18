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
  if (b && b.by !== me && !b.players.includes(me)) yourTurn("inv" + b.id, `${nm(b.by)} t'invite à la roue des gages!`, `Mise : ${b.mise} jetons. Inscris-toi dans l'onglet Gages.`);
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
  if (b && b.by !== me && !b.players.includes(me) && !Object.keys((b.rolls || {}).r1 || {}).length) yourTurn("inv" + b.id, `${nm(b.by)} t'invite aux dés!`, `Mise : ${b.mise} jetons. Inscris-toi dans l'onglet Gages.`);
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

/* ---------- Classement ---------- */
function renderLedger() {
  const { esc, MEMBERS, shortDate } = A(); const bets = A().S.bets;
  const resetAt = (bets.find(b => b.type === "zero") || {}).created || 0;
  const net = {}; MEMBERS.forEach(m => net[m.id] = 0);   // gains et pertes depuis la dernière remise à zéro
  const hist = [];
  for (const b of bets) {
    if (b.status !== "fini" || b.created < resetAt) continue;
    if (b.type === "roue" || b.type === "des") { b.players.forEach(p => net[p] -= b.mise); net[b.winner] += b.mise * b.players.length; hist.push(`${b.type === "roue" ? "Roue" : "Dés"} : ${nm(b.winner)} +${J(b.mise * (b.players.length - 1))}`); }
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

function render() { if (!window.JSAPI) return; renderSlotStatic(); renderWheel(); renderDice(); renderLedger(); }
window.Gages = { render, renderPoker };
render(); renderPoker();
