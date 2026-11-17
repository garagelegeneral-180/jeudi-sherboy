// Jeudi Sherboy : logique de l'app.
// Avec un config.js rempli, les données sont partagées par Firebase.
// Sans config, l'app tourne en mode essai, sur ce téléphone seulement.
const CFG = self.JS_CONFIG, D = self.JS_DATA;
const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const MEMBERS = CFG.members, QUORUM = CFG.quorum || 4;
const byId = Object.fromEntries(MEMBERS.map(m => [m.id, m]));
const configured = !JSON.stringify(CFG.firebase).includes("A_REMPLIR");
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
             set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

/* ---------- Dates ---------- */
const pad = n => String(n).padStart(2, "0");
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function thisThursday() { const n = new Date(); const d = new Date(n.getFullYear(), n.getMonth(), n.getDate()); d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7)); return d; }
const THU = thisThursday(), WEEK = keyOf(THU), IS_THU = new Date().getDay() === 4;
const THU19 = new Date(THU.getFullYear(), THU.getMonth(), THU.getDate(), 19);
const weekIndex = d => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5 / 7);
const WI = weekIndex(THU);
const monthKey = () => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1); };
const fmt = (d, o) => d.toLocaleDateString("fr-CA", o);
const shortDate = k => { const [y, m, d] = k.split("-").map(Number); return fmt(new Date(y, m - 1, d), { day: "numeric", month: "short" }); };

/* ---------- Données ---------- */
let S = { week: {}, weeks: [], ideas: [], state: {}, log: [], photos: [], prefs: {} };
let me = ls.get("js-me", null);
let store;

// Opérations partagées : union, retrait, incrément (Firestore ou mode essai).
const OP = { union: v => ({ __op: "union", v }), remove: v => ({ __op: "remove", v }), inc: n => ({ __op: "inc", v: n }) };

function localStore() {
  const KEY = "js-local-v1";
  const db = ls.get(KEY, { weeks: {}, ideas: {}, state: {}, log: {}, photos: {}, prefs: {}, tokens: {} });
  const subs = [];
  const save = () => { ls.set(KEY, db); subs.forEach(f => f()); };
  const apply = (target, patch) => {
    for (const [k, v] of Object.entries(patch)) {
      if (v && v.__op === "union") { const a = Array.isArray(target[k]) ? target[k] : []; if (!a.includes(v.v)) a.push(v.v); target[k] = a; }
      else if (v && v.__op === "remove") { target[k] = (target[k] || []).filter(x => x !== v.v); }
      else if (v && v.__op === "inc") { target[k] = (target[k] || 0) + v.v; }
      else if (v && typeof v === "object" && !Array.isArray(v)) { target[k] = target[k] && typeof target[k] === "object" ? target[k] : {}; apply(target[k], v); }
      else target[k] = v;
    }
  };
  const list = (col, sortKey, dir) => Object.entries(db[col]).map(([id, v]) => ({ id, ...v })).sort((a, b) => dir * ((a[sortKey] || 0) > (b[sortKey] || 0) ? 1 : -1));
  const listen = (fn) => { subs.push(fn); fn(); };
  return {
    mode: "local",
    watch(cbs) {
      listen(() => {
        cbs.week(db.weeks[WEEK] || {});
        cbs.weeks(Object.entries(db.weeks).map(([id, v]) => ({ id, ...v })));
        cbs.ideas(list("ideas", "created", 1));
        cbs.state(db.state.main || {});
        cbs.log(list("log", "date", -1));
        cbs.photos(list("photos", "created", -1).slice(0, 30));
        cbs.prefs(db.prefs);
      });
    },
    async setWeek(p) { db.weeks[WEEK] = db.weeks[WEEK] || {}; apply(db.weeks[WEEK], p); save(); },
    async setState(p) { db.state.main = db.state.main || {}; apply(db.state.main, p); save(); },
    async setPrefs(id, p) { db.prefs[id] = db.prefs[id] || {}; apply(db.prefs[id], p); save(); },
    async add(col, v) { db[col]["x" + Date.now() + Math.random().toString(36).slice(2, 6)] = { ...v, created: Date.now() }; save(); },
    async update(col, id, p) { if (db[col][id]) { apply(db[col][id], p); save(); } },
    async remove(col, id) { delete db[col][id]; save(); },
    async saveToken() {}
  };
}

async function firebaseStore() {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")]);
  const app = initializeApp(CFG.firebase);
  const a = auth.getAuth(app);
  await auth.signInAnonymously(a);
  let db;
  try { db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() }); } catch { db = fs.getFirestore(app); }
  const conv = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && v.__op === "union") out[k] = fs.arrayUnion(v.v);
      else if (v && v.__op === "remove") out[k] = fs.arrayRemove(v.v);
      else if (v && v.__op === "inc") out[k] = fs.increment(v.v);
      else if (v && typeof v === "object" && !Array.isArray(v)) out[k] = conv(v);
      else out[k] = v;
    }
    return out;
  };
  const docs = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const ts = v => (v && v.toMillis ? v.toMillis() : v || 0);
  return {
    mode: "firebase", app, fs, db,
    watch(cbs) {
      const onErr = e => { console.error(e); setSync("Erreur de connexion"); };
      fs.onSnapshot(fs.doc(db, "weeks", WEEK), { includeMetadataChanges: true }, s => { cbs.week(s.data() || {}); setSync(s.metadata.fromCache ? "Hors ligne" : "En direct"); }, onErr);
      fs.onSnapshot(fs.query(fs.collection(db, "weeks"), fs.orderBy(fs.documentId(), "desc"), fs.limit(60)), s => cbs.weeks(docs(s)), onErr);
      fs.onSnapshot(fs.query(fs.collection(db, "ideas"), fs.limit(200)), s => cbs.ideas(docs(s).map(d => ({ ...d, created: ts(d.created) })).sort((x, y) => x.created - y.created)), onErr);
      fs.onSnapshot(fs.doc(db, "state", "main"), s => cbs.state(s.data() || {}), onErr);
      fs.onSnapshot(fs.query(fs.collection(db, "log"), fs.orderBy("date", "desc"), fs.limit(50)), s => cbs.log(docs(s)), onErr);
      fs.onSnapshot(fs.query(fs.collection(db, "photos"), fs.orderBy("created", "desc"), fs.limit(30)), s => cbs.photos(docs(s)), onErr);
      fs.onSnapshot(fs.collection(db, "prefs"), s => cbs.prefs(Object.fromEntries(s.docs.map(d => [d.id, d.data()]))), onErr);
    },
    setWeek: p => fs.setDoc(fs.doc(db, "weeks", WEEK), conv(p), { merge: true }),
    setState: p => fs.setDoc(fs.doc(db, "state", "main"), conv(p), { merge: true }),
    setPrefs: (id, p) => fs.setDoc(fs.doc(db, "prefs", id), conv(p), { merge: true }),
    add: (col, v) => fs.addDoc(fs.collection(db, col), { ...conv(v), created: fs.serverTimestamp() }),
    update: (col, id, p) => fs.updateDoc(fs.doc(db, col, id), conv(p)),
    remove: (col, id) => fs.deleteDoc(fs.doc(db, col, id)),
    saveToken: (token, member) => fs.setDoc(fs.doc(db, "tokens", token), { member, updated: fs.serverTimestamp(), ua: navigator.userAgent.slice(0, 120) })
  };
}

const run = (p, okMsg) => Promise.resolve(p).then(() => okMsg && toast(okMsg)).catch(e => { console.error(e); toast("Ça n'a pas passé. Vérifie ta connexion et réessaie."); });

/* ---------- Petits outils ---------- */
function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => el.hidden = true, 2400); }
function setSync(t) { $("#sync").textContent = t; }
const avatar = (m, cls = "av") => `<span class="${cls}" style="background:${m.color}">${esc(m.name[0])}</span>`;

/* ---------- Choix du nom ---------- */
function showPicker() {
  $("#namegrid").innerHTML = MEMBERS.map(m => `<button data-me="${m.id}">${avatar(m)}${esc(m.name)}</button>`).join("");
  $("#picker").hidden = false;
}
$("#namegrid").onclick = e => { const b = e.target.closest("[data-me]"); if (!b) return; setMe(b.dataset.me); $("#picker").hidden = true; };
MEMBERS.forEach(m => { const o = document.createElement("option"); o.value = m.id; o.textContent = m.name; $("#me").appendChild(o); });
$("#me").onchange = () => setMe($("#me").value);
function setMe(id) {
  me = id; ls.set("js-me", id); $("#me").value = id;
  const tok = ls.get("js-token", null);
  if (tok && store) run(store.saveToken(tok, id));
  renderAll();
}

/* ---------- Ce jeudi ---------- */
$("#date").textContent = fmt(THU, { weekday: "long", day: "numeric", month: "long" }) + " · 19 h · Sherbrooke";
$("#rsvptitle").textContent = IS_THU ? "T'es-tu là ce soir?" : "T'es-tu là jeudi?";
function tick() {
  const ms = Math.max(0, THU19 - new Date());
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
  $("#count").innerHTML = ms === 0 ? `<div><b>C'est ce soir!</b><span>santé</span></div>` :
    [[d, "jours"], [h, "heures"], [m, "min"]].map(([v, l]) => `<div><b>${pad(v)}</b><span>${l}</span></div>`).join("");
}
tick(); setInterval(tick, 30000);

$("#extras").innerHTML = D.extras.map(([k, label]) => `<button class="toggle" data-x="${k}" aria-pressed="false">${esc(label)}</button>`).join("");
const extraTag = Object.fromEntries(D.extras.map(([k, , tag]) => [k, tag]));
const captainOf = wi => MEMBERS[((wi % MEMBERS.length) + MEMBERS.length) % MEMBERS.length];

let wasUp = null;
function renderJeudi() {
  const w = S.week, rsvp = w.rsvp || {}, ex = w.extras || {};
  document.querySelectorAll("#rsvp button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === rsvp[me]));
  const mine = ex[me] || [];
  document.querySelectorAll("#extras button").forEach(b => b.setAttribute("aria-pressed", mine.includes(b.dataset.x)));
  const oui = MEMBERS.filter(m => rsvp[m.id] === "oui").length;
  $("#meter").style.width = Math.min(100, oui / QUORUM * 100) + "%";
  const up = oui >= QUORUM;
  $("#quorumtxt").textContent = up ? `${oui} présents · confirmé` : `${oui}/${QUORUM} · il en manque ${QUORUM - oui}`;
  $("#stamp").innerHTML = up ? `<div class="stamp${wasUp === false ? " fresh" : ""}">ÇA LÈVE</div>` : "";
  wasUp = up;
  $("#quorumnote").textContent = `Le jeudi « lève » à ${QUORUM} présents. Le capitaine choisit l'endroit si personne ne s'entend.`;
  const order = { oui: 0, peut: 1, non: 2 }, lab = { oui: "présent", peut: "peut-être", non: "absent" };
  const capt = captainOf(WI).id;
  $("#people").innerHTML = MEMBERS.slice().sort((a, b) => (order[rsvp[a.id]] ?? 3) - (order[rsvp[b.id]] ?? 3)).map(m => {
    const r = rsvp[m.id];
    const tags = [...(ex[m.id] || []).map(k => extraTag[k]).filter(Boolean), m.id === capt ? "capitaine" : ""].filter(Boolean).join(" · ");
    return `<li>${avatar(m)}<span>${esc(m.name)}${m.id === me ? " (toi)" : ""}${tags ? `<span class="note"> — ${esc(tags)}</span>` : ""}</span><span class="pill ${r || "rien"}">${lab[r] || "pas répondu"}</span></li>`;
  }).join("");
}
$("#rsvp").onclick = e => { const b = e.target.closest("button"); if (!b || !me) return;
  run(store.setWeek({ rsvp: { [me]: b.dataset.v } }), b.dataset.v === "oui" ? "Noté, t'es dans la gang jeudi" : "Réponse enregistrée"); };
$("#extras").onclick = e => { const b = e.target.closest("button"); if (!b || !me) return;
  const on = ((S.week.extras || {})[me] || []).includes(b.dataset.x);
  run(store.setWeek({ extras: { [me]: on ? OP.remove(b.dataset.x) : OP.union(b.dataset.x) } })); };

/* Capitaine */
function renderCapt() {
  const c = captainOf(WI);
  $("#capt").innerHTML = `${avatar(c)}<div><b>${esc(c.name)}</b><div class="note">Capitaine du ${fmt(THU, { day: "numeric", month: "long" })}</div></div>`;
  $("#queue").textContent = "Ensuite : " + [1, 2, 3].map(k => { const d = new Date(THU); d.setDate(d.getDate() + 7 * k); return `${captainOf(WI + k).name} le ${fmt(d, { day: "numeric", month: "short" })}`; }).join(" · ");
}

/* Défi */
const ALLDEFIS = D.defis.concat(D.hardcore);
function renderDefi() {
  const i = S.week.defi ?? (WI % D.defis.length);
  const ok = S.week.defiOk || [];
  $("#defitag").textContent = i >= D.defis.length ? "Défi hardcore" : "Défi du jeudi";
  $("#defi").textContent = ALLDEFIS[i % ALLDEFIS.length];
  $("#defiok").setAttribute("aria-pressed", ok.includes(me));
  $("#defiwho").textContent = ok.length ? "Relevé par : " + ok.map(id => byId[id]?.name || "?").join(", ") : "Personne ne l'a encore relevé.";
}
$("#defiok").onclick = () => { if (!me) return; const on = (S.week.defiOk || []).includes(me); run(store.setWeek({ defiOk: on ? OP.remove(me) : OP.union(me) }), on ? null : "Bravo, défi relevé!"); };
function pickDefi(from, len, msg) { const cur = S.week.defi ?? -1; let n; do { n = from + Math.floor(Math.random() * len); } while (n === cur && len > 1); run(store.setWeek({ defi: n, defiOk: [] }), msg); }
$("#definew").onclick = () => pickDefi(0, D.defis.length, "Nouveau défi pigé");
$("#defihc").onclick = () => pickDefi(D.defis.length, D.hardcore.length, "Défi hardcore pigé. Bonne chance!");

/* Prédicteur */
function renderGuess() {
  const g = S.week.guess || {};
  $("#guess").innerHTML = [2, 3, 4, 5, 6, 7, 8].map(n => `<button class="round${g[me] === n ? " next" : ""}" data-g="${n}">${n}</button>`).join("");
  const list = Object.entries(g).map(([id, n]) => `${byId[id]?.name || "?"} : ${n}`);
  $("#guesses").textContent = list.length ? "Les gages : " + list.join(" · ") : "Personne n'a encore gagé.";
}
$("#guess").onclick = e => { const b = e.target.closest("[data-g]"); if (!b || !me) return; run(store.setWeek({ guess: { [me]: +b.dataset.g } }), "Gage enregistré"); };

/* ---------- Idées ---------- */
let kind = "Resto";
document.querySelectorAll("#addform [data-k]").forEach(b => b.onclick = () => { kind = b.dataset.k; document.querySelectorAll("#addform [data-k]").forEach(x => x.setAttribute("aria-pressed", x === b)); });
$("#addform").onsubmit = e => { e.preventDefault(); const t = $("#ideain").value.trim(); if (!t || !me) return;
  $("#ideain").value = ""; run(store.add("ideas", { k: kind, t, v: [me], by: me }), "Idée ajoutée"); };
const vetoedIds = () => new Set(Object.values(S.state.vetos || {}).filter(v => v && v.m === monthKey()).map(v => v.i));
function renderIdees() {
  const vetoed = vetoedIds();
  const myVeto = (S.state.vetos || {})[me]; const usedVeto = myVeto && myVeto.m === monthKey();
  const list = S.ideas.slice().sort((a, b) => (b.v || []).length - (a.v || []).length);
  $("#ideas").innerHTML = list.length ? list.map(i => { const v = vetoed.has(i.id); const votes = i.v || []; return `<li class="idea${v ? " veto" : ""}">
    <button class="vote" data-vote="${i.id}" aria-pressed="${votes.includes(me)}" aria-label="Voter pour ${esc(i.t)}">+${votes.length}</button>
    <div style="min-width:0"><div class="kind">${esc(i.k)}</div><div class="t">${esc(i.t)}</div></div>
    <div class="acts">${v ? `<span class="note">veto</span>` : (usedVeto ? "" : `<button class="mini" data-veto="${i.id}">veto</button>`)}${i.by === me ? `<button class="mini" data-del="${i.id}">retirer</button>` : ""}</div></li>`; }).join("")
    : `<li class="empty">Aucune idée encore. Ajoute la première ou pige dans les suggestions de la semaine.</li>`;
  $("#vetonote").textContent = usedVeto ? "Tu as utilisé ton veto du mois." : "Chaque Sherboy a un veto par mois. Utilise-le sagement.";
  drawWheel();
}
$("#ideas").onclick = e => {
  const v = e.target.closest("[data-vote]"), x = e.target.closest("[data-veto]"), d = e.target.closest("[data-del]");
  if (!me) return;
  if (v) { const i = S.ideas.find(i => i.id === v.dataset.vote); const on = (i.v || []).includes(me); run(store.update("ideas", i.id, { v: on ? OP.remove(me) : OP.union(me) })); }
  if (x) run(store.setState({ vetos: { [me]: { i: x.dataset.veto, m: monthKey() } } }), "Veto posé");
  if (d) run(store.remove("ideas", d.dataset.del), "Idée retirée");
};

/* Suggestions de la semaine */
let weekShift = 0;
function renderWeekly() {
  const wk = WI + weekShift;
  $("#weeklbl").textContent = "Semaine du " + fmt(THU, { day: "numeric", month: "short" });
  const taken = new Set(S.ideas.map(i => i.t.toLowerCase()).concat((S.state.pass || []).map(p => p.toLowerCase())));
  const picks = Object.entries(D.spots).map(([k, list]) => { const fresh = list.filter(s => !taken.has(s[0].toLowerCase())); const L = fresh.length ? fresh : list; return [k, ...L[((wk % L.length) + L.length) % L.length]]; });
  $("#weekly").innerHTML = picks.map(([k, n, d]) => `<li class="idea two"><div style="min-width:0"><div class="kind">${k}</div><div class="t">${esc(n)}</div><div class="note">${esc(d)}</div></div><button class="btn primary" style="padding:8px 12px" data-addspot="${esc(n)}" data-k="${k}">Ajouter</button></li>`).join("");
}
$("#weekly").onclick = e => { const b = e.target.closest("[data-addspot]"); if (!b || !me) return; run(store.add("ideas", { k: b.dataset.k, t: b.dataset.addspot, v: [me], by: me }), b.dataset.addspot + " ajouté aux idées"); };
$("#weekmore").onclick = () => { weekShift++; renderWeekly(); };

/* Roue */
let angle = 0, spinning = false;
const wheelItems = () => { const vetoed = vetoedIds(); return S.ideas.filter(i => !vetoed.has(i.id)).sort((a, b) => (b.v || []).length - (a.v || []).length).slice(0, 6); };
function drawWheel() {
  const c = $("#wheel"), x = c.getContext("2d"), items = wheelItems(), n = items.length, R = 270, cx = 280, cy = 280;
  const cs = getComputedStyle(document.documentElement), tok = v => cs.getPropertyValue(v).trim();
  const cols = ["--accent", "--pop", "--ok", "--maybe", "--no", "--muted"].map(tok);
  x.clearRect(0, 0, 560, 560);
  if (!n) { x.fillStyle = tok("--muted"); x.font = "500 26px DM Sans, sans-serif"; x.textAlign = "center"; x.fillText("Ajoute des idées", cx, cy); return; }
  for (let k = 0; k < n; k++) {
    const a0 = angle + k * 2 * Math.PI / n, a1 = a0 + 2 * Math.PI / n;
    x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, a0, a1); x.closePath(); x.fillStyle = cols[k % cols.length]; x.fill();
    x.save(); x.translate(cx, cy); x.rotate(a0 + Math.PI / n); x.fillStyle = "#fff"; x.font = "700 24px DM Sans, sans-serif"; x.textAlign = "right";
    let t = items[k].t; if (t.length > 16) t = t.slice(0, 15) + "…"; x.fillText(t, R - 18, 8); x.restore();
  }
  x.beginPath(); x.arc(cx, cy, 34, 0, 2 * Math.PI); x.fillStyle = tok("--card"); x.fill();
  x.beginPath(); x.moveTo(cx + R - 6, cy); x.lineTo(cx + R + 14, cy - 16); x.lineTo(cx + R + 14, cy + 16); x.closePath(); x.fillStyle = tok("--ink"); x.fill();
}
$("#spin").onclick = () => {
  const items = wheelItems(); if (spinning || !items.length) return; spinning = true; $("#result").textContent = "";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const target = angle + (reduce ? 0 : 8 * Math.PI) + Math.random() * 2 * Math.PI, start = angle, dur = reduce ? 10 : 3200, t0 = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); angle = start + (target - start) * e; drawWheel();
    if (p < 1) requestAnimationFrame(step);
    else { spinning = false; const n = items.length, a = ((-angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); $("#result").textContent = "Jeudi : " + items[Math.floor(a / (2 * Math.PI / n)) % n].t; }
  })(t0);
};
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", drawWheel);

/* ---------- Carnet ---------- */
function renderRounds() {
  const r = S.state.rounds || {};
  const min = Math.min(...MEMBERS.map(m => r[m.id] || 0));
  $("#rounds").innerHTML = MEMBERS.map(m => `<button class="round${(r[m.id] || 0) === min ? " next" : ""}" data-r="${m.id}">${esc(m.name)} · ${r[m.id] || 0}</button>`).join("");
}
$("#rounds").onclick = e => { const b = e.target.closest("[data-r]"); if (!b) return; run(store.setState({ rounds: { [b.dataset.r]: OP.inc(1) } }), "Tournée notée, santé!"); };

let stars = 4;
function renderStars() { $("#starpick").innerHTML = [1, 2, 3, 4, 5].map(n => `<button type="button" data-s="${n}" class="${n <= stars ? "on" : ""}" aria-label="${n} étoile${n > 1 ? "s" : ""}">★</button>`).join(""); }
$("#starpick").onclick = e => { const b = e.target.closest("[data-s]"); if (b) { stars = +b.dataset.s; renderStars(); } };
$("#logform").onsubmit = e => {
  e.preventDefault(); const p = $("#logplace").value.trim(); if (!p) return;
  const n = MEMBERS.filter(m => (S.week.rsvp || {})[m.id] === "oui").length;
  $("#logplace").value = "";
  run(Promise.all([store.add("log", { date: WEEK, p, s: stars, n, by: me }), store.setState({ pass: OP.union(p) })]), "Soirée ajoutée au carnet");
};
function renderLog() {
  $("#log").innerHTML = S.log.length ? S.log.map(l => `<li><span class="d">${shortDate(l.date)}</span><span><b>${esc(l.p)}</b><br><span class="note">${l.n || "?"} Sherboys</span></span><span class="stars" aria-label="${l.s} sur 5">${"★".repeat(l.s)}${"☆".repeat(5 - l.s)}</span></li>`).join("")
    : `<li class="empty" style="display:block">Le carnet est vide. Après le prochain jeudi, note l'endroit ici.</li>`;
}

function renderPass() {
  const pass = S.state.pass || [];
  const places = Object.values(D.spots).flat().map(s => s[0]);
  pass.forEach(p => { if (!places.some(x => x.toLowerCase() === p.toLowerCase())) places.push(p); });
  const done = p => pass.some(x => x.toLowerCase() === p.toLowerCase());
  $("#passsub").textContent = `${places.filter(done).length} sur ${places.length} endroits tamponnés. Touche un cercle pour le tamponner.`;
  $("#passport").innerHTML = places.map(p => `<button class="pstamp${done(p) ? " done" : ""}" data-p="${esc(p)}" aria-pressed="${done(p)}">${esc(p)}</button>`).join("");
}
$("#passport").onclick = e => { const b = e.target.closest("[data-p]"); if (!b) return; const p = b.dataset.p; const on = (S.state.pass || []).includes(p); run(store.setState({ pass: on ? OP.remove(p) : OP.union(p) })); };

function renderPhotos() {
  $("#photos").innerHTML = S.photos.length ? `<div class="photos">${S.photos.map(p => `<figure><img src="${esc(p.src)}" alt="Photo du ${esc(p.d)}" loading="lazy"><figcaption>${esc(p.d)} · ${esc(byId[p.by]?.name || "")}</figcaption></figure>`).join("")}</div>`
    : `<div class="empty">Pas encore de photo. Ajoute celle de la dernière soirée.</div>`;
}
$("#photoin").onchange = e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f || !me) return;
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => {
    const s = Math.min(1, 640 / Math.max(img.width, img.height)), c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    run(store.add("photos", { src: c.toDataURL("image/jpeg", 0.72), d: fmt(new Date(), { day: "numeric", month: "short" }), by: me }), "Photo ajoutée au mur");
  };
  img.onerror = () => toast("Cette image n'a pas pu être lue. Essaie une photo JPEG ou PNG.");
  img.src = url;
};

/* Titres calculés à partir de l'historique */
function renderBadges() {
  const weeks = S.weeks.slice().sort((a, b) => a.id < b.id ? 1 : -1);
  const best = (score, unit) => { let top = null, v = 0; MEMBERS.forEach(m => { const s = score(m.id); if (s > v) { v = s; top = m; } }); return top ? `${top.name} · ${v} ${unit}${v > 1 ? "s" : ""}` : "Personne encore"; };
  const streak = id => { let n = 0; for (const w of weeks) { if ((w.rsvp || {})[id] === "oui") n++; else if (w.id !== WEEK) break; } return n; };
  const count = key => id => weeks.filter(w => ((w.extras || {})[id] || []).includes(key)).length;
  const ideasBy = id => S.ideas.filter(i => i.by === id).length;
  const last = weeks.find(w => w.id < WEEK && w.guess && w.rsvp);
  let devin = "Personne encore";
  if (last) { const real = Object.values(last.rsvp).filter(v => v === "oui").length; let bestId = null, diff = 99;
    Object.entries(last.guess).forEach(([id, g]) => { const d = Math.abs(g - real); if (d < diff) { diff = d; bestId = id; } });
    if (bestId) devin = `${byId[bestId]?.name} · gage de ${last.guess[bestId]}, il y en a eu ${real}`; }
  const B = [["Le Fidèle", best(streak, "jeudi") + (best(streak, "jeudi") !== "Personne encore" ? " de suite" : "")], ["Le Chauffeur", best(count("lift"), "lift")],
    ["Le Retardataire", best(count("retard"), "retard")], ["L'Explorateur", best(ideasBy, "idée")], ["Le Devin", devin], ["Le Hardcore", best(id => weeks.filter(w => (w.defiOk || []).includes(id)).length, "défi")]];
  $("#badges").innerHTML = B.map(([t, s]) => `<div class="badge"><b>${t}</b><span>${esc(s)}</span></div>`).join("");
}

/* ---------- Rappels et notifications ---------- */
const remDefault = Object.fromEntries(D.reminders.map(r => [r[0], r[3]]));
function renderRem() {
  const p = { ...remDefault, ...((S.prefs[me] || {}).rem || {}) };
  $("#rem").innerHTML = D.reminders.map(([k, h, m]) => `<li><div><div class="when">${h == null ? "Dès que ça lève" : "Jeudi · " + h + " h"}</div><div class="msg">${esc(m)}</div></div><button class="sw" role="switch" aria-checked="${!!p[k]}" aria-label="${esc(m)}" data-rem="${k}"></button></li>`).join("");
}
$("#rem").onclick = e => { const b = e.target.closest("[data-rem]"); if (!b || !me) return;
  const cur = { ...remDefault, ...((S.prefs[me] || {}).rem || {}) }; run(store.setPrefs(me, { rem: { [b.dataset.rem]: !cur[b.dataset.rem] } })); };

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let swReg = null, messaging = null, msgMod = null;
function notifStatus(text, ok, btn) { const s = $("#notifstatus"); s.textContent = text; s.classList.toggle("ok", !!ok); $("#notifbtn").hidden = !btn; if (btn) $("#notifbtn").textContent = btn; }
async function initNotif() {
  if (!configured) return notifStatus("Les notifications vont marcher une fois l'app branchée sur Firebase.", false, null);
  if (isIOS && !standalone) return notifStatus("Sur iPhone, ajoute d'abord l'app à ton écran d'accueil (voir plus bas), puis ouvre-la à partir de l'icône pour activer les notifications.", false, null);
  try { msgMod = await import(FB + "firebase-messaging.js"); } catch { msgMod = null; }
  if (!msgMod || !(await msgMod.isSupported()) || !("Notification" in window)) return notifStatus("Ce navigateur ne peut pas recevoir de notifications. Essaie avec Chrome sur Android ou Safari sur iPhone.", false, null);
  messaging = msgMod.getMessaging(store.app);
  msgMod.onMessage(messaging, p => toast((p.notification && p.notification.body) || "Nouveau message de la gang"));
  if (Notification.permission === "denied") return notifStatus("Les notifications sont bloquées. Va dans les réglages de ton téléphone pour les permettre à Jeudi Sherboy.", false, null);
  if (Notification.permission === "granted" && ls.get("js-token", null)) { notifStatus("Notifications activées sur ce téléphone.", true, "Réactiver"); enableNotif(true); return; }
  notifStatus("Active les notifications pour recevoir les rappels du jeudi.", false, "Activer les notifications");
}
async function enableNotif(silent) {
  try {
    if (!silent && (await Notification.requestPermission()) !== "granted") return notifStatus("Tu as refusé les notifications. Tu peux changer ça dans les réglages du téléphone.", false, null);
    const token = await msgMod.getToken(messaging, { vapidKey: CFG.vapidKey, serviceWorkerRegistration: swReg });
    if (!token) throw new Error("no token");
    const old = ls.get("js-token", null);
    if (old && old !== token) store.remove("tokens", old).catch(() => {});
    ls.set("js-token", token);
    await store.saveToken(token, me);
    notifStatus("Notifications activées sur ce téléphone.", true, "Réactiver");
    if (!silent) toast("C'est beau, tu vas recevoir les rappels");
  } catch (e) { console.error(e); if (!silent) notifStatus("L'activation n'a pas marché. Vérifie ta connexion et réessaie.", false, "Réessayer"); }
}
$("#notifbtn").onclick = () => { if (!me) return showPicker(); enableNotif(false); };

document.querySelectorAll("[data-os]").forEach(b => b.onclick = () => {
  document.querySelectorAll("[data-os]").forEach(x => x.setAttribute("aria-pressed", x === b));
  $("#steps-ios").hidden = b.dataset.os !== "ios"; $("#steps-android").hidden = b.dataset.os !== "android";
});
if (/android/i.test(navigator.userAgent)) document.querySelector('[data-os="android"]').click();

/* ---------- Onglets ---------- */
function showTab(t) {
  document.querySelectorAll("nav.tabs button").forEach(x => x.setAttribute("aria-selected", x.dataset.t === t));
  document.querySelectorAll(".view").forEach(v => v.hidden = v.id !== "v-" + t);
  if (t === "idees") drawWheel();
  window.scrollTo(0, 0);
}
document.querySelectorAll("nav.tabs button").forEach(b => b.onclick = () => { showTab(b.dataset.t); history.replaceState(null, "", "#" + b.dataset.t); });
if (["idees", "carnet", "rappels"].includes(location.hash.slice(1))) showTab(location.hash.slice(1));

function renderAll() {
  if (!me) return;
  renderJeudi(); renderCapt(); renderDefi(); renderGuess();
  renderIdees(); renderWeekly(); renderRounds(); renderLog(); renderPass(); renderPhotos(); renderBadges(); renderRem();
}

/* ---------- Démarrage ---------- */
addEventListener("offline", () => { $("#offline").hidden = false; setSync("Hors ligne"); });
addEventListener("online", () => { $("#offline").hidden = true; });
renderStars();
if (!me) showPicker(); else $("#me").value = me;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("firebase-messaging-sw.js", { scope: "./" }).then(r => { swReg = r; }).catch(e => console.warn("SW", e));
}

(async () => {
  try {
    store = configured ? await firebaseStore() : localStore();
  } catch (e) {
    console.error(e); store = localStore();
    toast("Connexion à Firebase impossible. L'app tourne en mode essai.");
  }
  if (store.mode === "local") { $("#setup").hidden = false; setSync("Mode essai"); }
  const set = k => v => { S[k] = v; renderAll(); };
  store.watch({ week: set("week"), weeks: set("weeks"), ideas: set("ideas"), state: set("state"), log: set("log"), photos: set("photos"), prefs: set("prefs") });
  if (swReg == null && "serviceWorker" in navigator) swReg = await navigator.serviceWorker.ready.catch(() => null);
  initNotif();
})();
