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
let S = { week: {}, weeks: [], ideas: [], state: {}, log: [], photos: [], prefs: {}, chat: [], quotes: [], bets: [], gazette: [], table: null };
let me = ls.get("js-me", null);
let store;

// Opérations partagées : union, retrait, incrément (Firestore ou mode essai).
const OP = { union: v => ({ __op: "union", v }), remove: v => ({ __op: "remove", v }), inc: n => ({ __op: "inc", v: n }), del: () => ({ __op: "del" }) };

function localStore() {
  const KEY = "js-local-v1";
  const db = ls.get(KEY, {});
  for (const k of ["weeks", "ideas", "state", "log", "photos", "prefs", "tokens", "chat", "quotes", "bets", "gazette", "tables"]) db[k] = db[k] || {};
  const subs = [];
  const save = () => { ls.set(KEY, db); subs.forEach(f => f()); };
  const apply = (target, patch) => {
    for (const [k, v] of Object.entries(patch)) {
      if (v && v.__op === "del") delete target[k];
      else if (v && v.__op === "union") { const a = Array.isArray(target[k]) ? target[k] : []; if (!a.includes(v.v)) a.push(v.v); target[k] = a; }
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
        cbs.chat(list("chat", "created", 1).slice(-60));
        cbs.quotes(list("quotes", "created", -1));
        cbs.bets(list("bets", "created", -1));
        cbs.gazette(Object.entries(db.gazette).map(([id, v]) => ({ id, ...v })).sort((a, b) => a.id < b.id ? 1 : -1));
        cbs.table(db.tables.main || null);
      });
    },
    async tx(col, id, fn) { const next = fn(db[col][id] ? JSON.parse(JSON.stringify(db[col][id])) : null); if (next !== undefined) { db[col][id] = next; save(); } },
    async merge(col, id, p) { if (db[col][id]) { apply(db[col][id], p); save(); } },
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
      if (v && v.__op === "del") out[k] = fs.deleteField();
      else if (v && v.__op === "union") out[k] = fs.arrayUnion(v.v);
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
      fs.onSnapshot(fs.query(fs.collection(db, "chat"), fs.orderBy("created", "desc"), fs.limit(60)),
        s => cbs.chat(s.docs.map(d => { const v = d.data({ serverTimestamps: "estimate" }); return { id: d.id, ...v, created: ts(v.created) || Date.now() }; }).reverse()), onErr);
      fs.onSnapshot(fs.query(fs.collection(db, "quotes"), fs.orderBy("created", "desc"), fs.limit(100)),
        s => cbs.quotes(s.docs.map(d => { const v = d.data({ serverTimestamps: "estimate" }); return { id: d.id, ...v, created: ts(v.created) || Date.now() }; })), onErr);
      fs.onSnapshot(fs.query(fs.collection(db, "bets"), fs.orderBy("created", "desc"), fs.limit(5000)),
        s => cbs.bets(s.docs.map(d => { const v = d.data({ serverTimestamps: "estimate" }); return { id: d.id, ...v, created: ts(v.created) || Date.now() }; })), onErr);
      fs.onSnapshot(fs.query(fs.collection(db, "gazette"), fs.orderBy(fs.documentId(), "desc"), fs.limit(30)), s => cbs.gazette(docs(s)), onErr);
      fs.onSnapshot(fs.doc(db, "tables", "main"), s => cbs.table(s.exists() ? s.data() : null), onErr);
    },
    merge: (col, id, p) => fs.setDoc(fs.doc(db, col, id), conv(p), { merge: true }),
    tx: (col, id, fn) => fs.runTransaction(db, async t => {
      const ref = fs.doc(db, col, id); const snap = await t.get(ref);
      const next = fn(snap.exists() ? snap.data() : null);
      if (next !== undefined) t.set(ref, next);
    }),
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
  renderAll(); renderChat(); renderPotd(); renderGazette(); window.Gages?.render(); window.Gages?.renderPoker();
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

/* ---------- Jasette ---------- */
const REACTS = ["🍺", "🔥", "😂", "💀"];
const timeOf = ms => new Date(ms).toLocaleTimeString("fr-CA", { hour: "numeric", minute: "2-digit" });
const dayOf = ms => { const d = new Date(ms), t = new Date(); const y = new Date(t); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Aujourd'hui"; if (d.toDateString() === y.toDateString()) return "Hier";
  return fmt(d, { weekday: "long", day: "numeric", month: "long" }); };
const linkify = s => esc(s).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${/youtu|tiktok|instagram|facebook|fb\.watch|vimeo/i.test(u) ? "▶ Voir la vidéo" : u}</a>`);
let chatSeen = ls.get("js-chat-seen", 0), justSent = false, pickFor = null, pendingImg = null;
const chatVisible = () => !$("#v-jasette").hidden;

function renderChat() {
  const box = $("#chat");
  const nearBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 160;
  let html = "", lastDay = "", prev = null;
  for (const m of S.chat) {
    const day = dayOf(m.created);
    if (day !== lastDay) { html += `<div class="day">${esc(day)}</div>`; lastDay = day; prev = null; }
    const who = byId[m.by] || { name: "?", color: "#888" }, mine = m.by === me;
    const grouped = prev && prev.by === m.by && m.created - prev.created < 5 * 60e3;
    const r = m.r || {}; const counts = {};
    Object.values(r).forEach(e => counts[e] = (counts[e] || 0) + 1);
    const reacts = Object.entries(counts).map(([e, n]) => `<button data-react="${m.id}" data-e="${e}" class="${r[me] === e ? "mine" : ""}">${e} ${n}</button>`).join("");
    html += `<div class="msg${mine ? " me" : ""}${grouped ? " grouped" : ""}">${avatar(who)}<div class="mcol">
      <div class="bubble" data-msg="${m.id}">${!mine && !grouped ? `<span class="from">${esc(who.name)}</span>` : ""}${m.img ? `<img src="${esc(m.img)}" alt="Photo de ${esc(who.name)}" loading="lazy">` : ""}${m.text ? `<span>${linkify(m.text)}</span>` : ""}<span class="time">${timeOf(m.created)}</span></div>
      ${pickFor === m.id ? `<div class="picker-r">${REACTS.map(e => `<button data-pick="${m.id}" data-e="${e}" aria-label="Réagir ${e}">${e}</button>`).join("")}${mine ? `<button data-delmsg="${m.id}" aria-label="Effacer le message" style="font-size:13px">Effacer</button>` : ""}</div>` : ""}
      ${reacts ? `<div class="reacts">${reacts}</div>` : ""}</div></div>`;
    prev = m;
  }
  box.innerHTML = html || `<div class="empty">La jasette est vide. Dis bonjour à la gang, ou partage la photo du jour!</div>`;
  if (chatVisible()) { if (justSent || nearBottom) scrollTo(0, document.documentElement.scrollHeight); markSeen(); }
  justSent = false;
  renderBadge();
}
function markSeen() { const last = S.chat.length ? S.chat[S.chat.length - 1].created : 0; if (last > chatSeen) { chatSeen = last; ls.set("js-chat-seen", last); } renderBadge(); }
function renderBadge() {
  const n = S.chat.filter(m => m.by !== me && m.created > chatSeen).length;
  const b = $("#chatbadge"); b.hidden = !n || chatVisible(); b.textContent = n > 9 ? "9+" : n;
}
$("#chat").onclick = e => {
  const bub = e.target.closest("[data-msg]"), pick = e.target.closest("[data-pick]"), rb = e.target.closest("[data-react]"), del = e.target.closest("[data-delmsg]");
  if (e.target.closest("a")) return;
  if (pick || rb) {
    const id = (pick || rb).dataset.pick || (pick || rb).dataset.react, em = (pick || rb).dataset.e;
    const m = S.chat.find(x => x.id === id); const cur = (m.r || {})[me];
    pickFor = null; run(store.merge("chat", id, { r: { [me]: cur === em ? OP.del() : em } })); renderChat(); return;
  }
  if (del) { pickFor = null; run(store.remove("chat", del.dataset.delmsg), "Message effacé"); return; }
  if (bub) { pickFor = pickFor === bub.dataset.msg ? null : bub.dataset.msg; renderChat(); }
};
function resizeImage(file, max, cb) {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url); cb(c.toDataURL("image/jpeg", 0.72)); };
  img.onerror = () => toast("Cette image n'a pas pu être lue. Essaie une photo JPEG ou PNG.");
  img.src = url;
}
$("#chatphoto").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  resizeImage(f, 1000, src => { pendingImg = src; $("#chatprevimg").src = src; $("#chatprev").hidden = false; $("#chatin").focus(); }); };
$("#chatprevdel").onclick = () => { pendingImg = null; $("#chatprev").hidden = true; };
$("#chatform").onsubmit = e => {
  e.preventDefault(); if (!me) return showPicker();
  const text = $("#chatin").value.trim(); if (!text && !pendingImg) return;
  const msg = { by: me }; if (text) msg.text = text; if (pendingImg) msg.img = pendingImg;
  $("#chatin").value = ""; pendingImg = null; $("#chatprev").hidden = true; justSent = true;
  run(store.add("chat", msg));
};

/* Photo du jour : la dernière photo partagée dans la jasette depuis 24 h */
function renderPotd() {
  const p = S.chat.filter(m => m.img && Date.now() - m.created < 24 * 36e5).pop();
  for (const id of ["#potd-chat", "#potd-jeudi"]) {
    const el = $(id);
    if (!p) { el.hidden = true; continue; }
    const who = byId[p.by]?.name || "Quelqu'un";
    el.innerHTML = `<img src="${esc(p.img)}" alt="Photo du jour de ${esc(who)}"><div class="cap"><span class="eyebrow" style="color:var(--pop)">Photo du jour</span><b>${p.text ? linkify(p.text) : "Ça donne le goût, hein?"}</b><span class="note">par ${esc(who)} · ${timeOf(p.created)}</span></div>`;
    el.hidden = false;
  }
}
$("#potd-jeudi").onclick = e => { if (!e.target.closest("a")) showTab("jasette"); };

/* ---------- Livre des citations ---------- */
MEMBERS.forEach(m => { const o = document.createElement("option"); o.value = m.id; o.textContent = m.name; $("#quoteby").appendChild(o); });
$("#quoteform").onsubmit = e => {
  e.preventDefault(); const t = $("#quotein").value.trim().replace(/^[«"]\s*|\s*[»"]$/g, ""); if (!t) return;
  $("#quotein").value = ""; run(store.add("quotes", { t, who: $("#quoteby").value, by: me, date: WEEK }), "Citation ajoutée au livre");
};
function renderQuotes() {
  $("#quotes").innerHTML = S.quotes.length ? S.quotes.map(q => `<li><blockquote>« ${esc(q.t)} »</blockquote><div class="note"><span>— ${esc(byId[q.who]?.name || "?")}, ${shortDate(q.date || WEEK)}</span>${q.by === me ? `<button class="mini" data-delq="${q.id}">retirer</button>` : ""}</div></li>`).join("")
    : `<li class="empty">Le livre est vide. La prochaine niaiserie mémorable va ici.</li>`;
}
$("#quotes").onclick = e => { const b = e.target.closest("[data-delq]"); if (b) run(store.remove("quotes", b.dataset.delq), "Citation retirée"); };

/* ---------- Météo du jeudi soir (Open-Meteo, sans clé) ---------- */
const WMO = [[0, "☀️", "Ciel dégagé"], [1, "🌤️", "Plutôt beau"], [2, "⛅", "Nuageux par bouts"], [3, "☁️", "Couvert"], [45, "🌫️", "Brouillard"], [51, "🌦️", "Bruine"], [61, "🌧️", "Pluie"], [66, "🌧️", "Pluie verglaçante"], [71, "🌨️", "Neige"], [77, "🌨️", "Grésil"], [80, "🌦️", "Averses"], [85, "🌨️", "Averses de neige"], [95, "⛈️", "Orages"]];
async function loadMeteo() {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=45.4042&longitude=-71.8929&hourly=temperature_2m,weather_code,precipitation_probability&timezone=America%2FToronto&start_date=${WEEK}&end_date=${WEEK}`;
    const j = await (await fetch(u)).json();
    const i = j.hourly.time.findIndex(t => t.endsWith("T19:00"));
    if (i < 0) return;
    const code = j.hourly.weather_code[i], w = WMO.filter(x => x[0] <= code).pop();
    const temp = Math.round(j.hourly.temperature_2m[i]), pop = j.hourly.precipitation_probability?.[i];
    const tip = temp >= 18 && code < 51 ? "Soirée terrasse!" : temp <= -10 ? "On reste en dedans." : code >= 51 ? "Apportez un parapluie." : "";
    $("#meteo").textContent = `${w[1]} ${temp} °C à 19 h · ${w[2]}${pop != null ? ` · ${pop} % de pluie` : ""}${tip ? " · " + tip : ""}`;
    $("#meteo").hidden = false;
  } catch (e) { console.warn("météo", e); }
}
loadMeteo();

/* ---------- La Gazette du vendredi ---------- */
const LAST_THU = new Date(THU); LAST_THU.setDate(LAST_THU.getDate() - 7);
const LAST_KEY = keyOf(LAST_THU);
function gazetteFor(date) {
  const stored = S.gazette.find(g => g.id === date);
  if (stored) return stored;
  const week = S.weeks.find(w => w.id === date);
  if (!week || !week.rsvp) return null;
  const ideas = S.ideas.slice().sort((a, b) => (b.v || []).length - (a.v || []).length);
  const photo = S.chat.filter(m => m.img && keyOf(new Date(m.created)) === date).pop();
  return self.makeGazette({ date, week, logEntry: S.log.find(l => l.date === date), quotes: S.quotes.filter(q => q.date === date).reverse(), photo, topIdea: ideas[0], CFG, D });
}
function gazetteHTML(g) {
  const [y, m, d] = g.date.split("-").map(Number); const fri = new Date(y, m - 1, d + 1);
  return `<div class="mast"><b>LA GAZETTE SHERBOY</b><span>${esc(fmt(fri, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))} · Édition no ${g.edition} · Prix : une pinte</span></div>
    <h3>${esc(g.titre)}</h3>
    ${g.photo ? `<figure style="margin:0"><img src="${esc(g.photo)}" alt="Photo de la soirée"><figcaption>${esc(g.photoTxt || "La photo du jeudi")} — photo : ${esc(g.photoBy || "")}</figcaption></figure>` : ""}
    <div class="chapeau">${esc(g.chapeau)}</div>
    ${g.citation ? `<div class="cit">« ${esc(g.citation.t)} »<small>— ${esc(g.citation.who)}, citation de la semaine</small></div>` : ""}
    <div class="cols">${g.breves.map(b => `<p>${esc(b)}</p>`).join("")}</div>
    <div class="foot"><span>Présents : ${esc(g.presents.join(", ") || "personne")}</span>${g.etoiles ? `<span>Note : ${"★".repeat(g.etoiles)}${"☆".repeat(5 - g.etoiles)}</span>` : ""}</div>`;
}
function renderGazette() {
  const friday9 = new Date(LAST_THU); friday9.setDate(friday9.getDate() + 1); friday9.setHours(9);
  const g = Date.now() >= +friday9 && Date.now() - +friday9 < 6 * 864e5 ? gazetteFor(LAST_KEY) : null;
  $("#gazette").hidden = !g; if (g) $("#gazette").innerHTML = gazetteHTML(g);
  const arch = S.gazette.slice();
  if (g && !arch.some(a => a.id === g.date)) arch.unshift({ id: g.date, ...g });
  $("#gazarch").innerHTML = arch.length ? arch.map(a => `<li class="idea two" data-gaz="${a.id}" style="cursor:pointer"><div style="min-width:0"><div class="kind">${shortDate(a.id)} · no ${a.edition}</div><div class="t">${esc(a.titre)}</div></div><span class="note">Lire</span></li>`).join("")
    : `<li class="empty">La première Gazette sortira le vendredi après votre premier jeudi.</li>`;
}
$("#gazarch").onclick = e => { const li = e.target.closest("[data-gaz]"); if (!li) return;
  const g = gazetteFor(li.dataset.gaz); const v = $("#gazview");
  if (!g || (!v.hidden && v.dataset.id === li.dataset.gaz)) { v.hidden = true; return; }
  v.innerHTML = gazetteHTML(g); v.dataset.id = li.dataset.gaz; v.hidden = false; v.scrollIntoView({ behavior: "smooth", block: "start" }); };

/* Accès partagé pour les jeux (gages.js) */
window.JSAPI = { get S() { return S; }, get me() { return me; }, get store() { return store; }, OP, run, toast, esc, avatar, byId, MEMBERS, WEEK, fmt, shortDate, showPicker };

/* ---------- Rappels et notifications ---------- */
const remDefault = Object.fromEntries(D.reminders.map(r => [r[0], r[3]]));
function renderRem() {
  const p = { ...remDefault, ...((S.prefs[me] || {}).rem || {}) };
  $("#rem").innerHTML = D.reminders.map(([k, h, m]) => `<li><div><div class="when">${h == null ? "Dès que ça lève" : h === "jasette" ? "7 jours sur 7 · aux 15 min" : h === "vendredi" ? "Vendredi · 9 h" : "Jeudi · " + h + " h"}</div><div class="msg">${esc(m)}</div></div><button class="sw" role="switch" aria-checked="${!!p[k]}" aria-label="${esc(m)}" data-rem="${k}"></button></li>`).join("");
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
  if (t === "jasette") { requestAnimationFrame(() => scrollTo(0, document.documentElement.scrollHeight)); markSeen(); }
  else window.scrollTo(0, 0);
  renderBadge();
}
document.querySelectorAll("nav.tabs button").forEach(b => b.onclick = () => { showTab(b.dataset.t); history.replaceState(null, "", "#" + b.dataset.t); });
if (["jasette", "idees", "carnet", "gages", "rappels"].includes(location.hash.slice(1))) showTab(location.hash.slice(1));

function renderAll() {
  if (!me) return;
  renderJeudi(); renderCapt(); renderDefi(); renderGuess();
  renderIdees(); renderWeekly(); renderRounds(); renderLog(); renderPass(); renderPhotos(); renderBadges(); renderRem(); renderQuotes(); renderGazette();
  window.Gages?.render();
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
  store.watch({ week: set("week"), weeks: set("weeks"), ideas: set("ideas"), state: set("state"), log: set("log"), photos: set("photos"), prefs: set("prefs"),
    chat: v => { S.chat = v; if (me) { renderChat(); renderPotd(); } },
    quotes: v => { S.quotes = v; if (me) renderQuotes(); },
    bets: v => { S.bets = v; if (me) window.Gages?.render(); },
    gazette: v => { S.gazette = v; if (me) renderGazette(); },
    table: v => { S.table = v; if (me) window.Gages?.renderPoker(); } });
  if (swReg == null && "serviceWorker" in navigator) swReg = await navigator.serviceWorker.ready.catch(() => null);
  initNotif();
})();
