// Envoie les rappels du jeudi aux téléphones de la gang.
// Roule chaque heure le jeudi grâce à GitHub Actions (.github/workflows/rappels.yml).
// Il a besoin du secret FIREBASE_SERVICE_ACCOUNT (la clé du compte de service Firebase, en JSON).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

// Lit config.js et data.js, les mêmes fichiers que l'app.
const ctx = { self: {} };
vm.createContext(ctx);
for (const f of ["config.js", "data.js"]) vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), ctx);
const CFG = ctx.self.JS_CONFIG, D = ctx.self.JS_DATA;
const byId = Object.fromEntries(CFG.members.map(m => [m.id, m]));
const QUORUM = CFG.quorum || 4;

// Heure de Sherbrooke, peu importe l'heure du serveur.
const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" })
  .formatToParts(new Date()).map(p => [p.type, p.value]));
const hour = Number(parts.hour) % 24, WEEK = `${parts.year}-${parts.month}-${parts.day}`;
const forced = process.env.RAPPEL || ""; // pour un test manuel : rsvp, leve, vote, lift, ou ou test

if (parts.weekday !== "Thu" && !forced) { console.log(`Pas jeudi (${parts.weekday} ${WEEK} ${hour} h) : rien à envoyer.`); process.exit(0); }

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore(), fcm = getMessaging();

const weekRef = db.doc(`weeks/${WEEK}`);
const week = (await weekRef.get()).data() || {};
const rsvp = week.rsvp || {}, extras = week.extras || {}, sent = week.sent || {};
const oui = CFG.members.filter(m => rsvp[m.id] === "oui");
const ideasSnap = await db.collection("ideas").get();
const stateDoc = (await db.doc("state/main").get()).data() || {};
const monthKey = `${parts.year}-${Number(parts.month)}`;
const vetoed = new Set(Object.values(stateDoc.vetos || {}).filter(v => v && v.m === monthKey).map(v => v.i));
const ideas = ideasSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => !vetoed.has(i.id)).sort((a, b) => (b.v || []).length - (a.v || []).length);
const top = ideas[0];
const defiIdx = week.defi ?? null;
const defi = defiIdx == null ? null : D.defis.concat(D.hardcore)[defiIdx];

// Quel rappel envoyer maintenant? (GitHub peut être en retard : on accepte jusqu'à une heure de retard.)
const due = [];
const timed = { rsvp: 9, vote: 16, lift: 18, ou: 19 };
if (forced) due.push(forced);
else {
  for (const [k, h] of Object.entries(timed)) if (hour >= h && hour < h + 2 && !sent[k]) due.push(k);
  if (oui.length >= QUORUM && !sent.leve && hour >= 9) due.push("leve");
}
if (!due.length) { console.log(`Jeudi ${hour} h : rien de dû.`); process.exit(0); }

const prefsSnap = await db.collection("prefs").get();
const prefs = Object.fromEntries(prefsSnap.docs.map(d => [d.id, d.data().rem || {}]));
const remDefault = Object.fromEntries(D.reminders.map(r => [r[0], r[3]]));
const wants = (member, k) => (k in (prefs[member] || {}) ? prefs[member][k] : remDefault[k] ?? true);
const tokensSnap = await db.collection("tokens").get();
const tokens = tokensSnap.docs.map(d => ({ token: d.id, member: d.data().member }));

function message(k) {
  const lifts = CFG.members.filter(m => (extras[m.id] || []).includes("lift")).map(m => m.name);
  switch (k) {
    case "rsvp": {
      const n = Object.keys(rsvp).length;
      return { title: "T'es-tu là ce soir?", body: n ? `${n} gars ont déjà répondu. Confirme ta présence.` : "Sois le premier à confirmer ta présence pour ce soir.",
        to: m => !rsvp[m] }; // seulement ceux qui n'ont pas répondu
    }
    case "leve": return { title: "ÇA LÈVE!", body: `${oui.length} Sherboys confirmés pour ce soir : ${oui.map(m => m.name).join(", ")}.` };
    case "vote": return { title: "Vote pour l'endroit", body: top ? `${top.t} mène avec ${(top.v || []).length} vote${(top.v || []).length > 1 ? "s" : ""}. Dernière chance de voter.` : "Aucune idée encore. Propose une place pour ce soir." };
    case "lift": return lifts.length ? { title: "Qui a besoin d'un lift?", body: `${lifts.join(", ")} ${lifts.length > 1 ? "ont" : "a"} de la place. Réserve la tienne.` } : null;
    case "ou": return { title: "On va où ce soir?", body: (top ? `Ce soir : ${top.t}.` : "Le capitaine choisit l'endroit.") + (defi ? ` Défi : ${defi}.` : "") };
    case "test": return { title: "Test Jeudi Sherboy", body: "Si tu vois ça, les notifications marchent. Santé!" };
    default: return null;
  }
}

const dead = [];
for (const k of due) {
  const msg = message(k);
  if (!msg) { console.log(`${k} : rien à dire, sauté.`); continue; }
  const targets = tokens.filter(t => byId[t.member] && (k === "test" || wants(t.member, k)) && (!msg.to || msg.to(t.member)));
  if (!targets.length) { console.log(`${k} : personne à avertir.`); }
  for (let i = 0; i < targets.length; i += 500) {
    const batch = targets.slice(i, i + 500);
    const res = await fcm.sendEachForMulticast({
      tokens: batch.map(t => t.token),
      notification: { title: msg.title, body: msg.body },
      webpush: { notification: { icon: CFG.siteUrl + "icons/icon-192.png", badge: CFG.siteUrl + "icons/favicon-32.png", tag: "jeudi-" + k }, fcmOptions: { link: CFG.siteUrl } }
    });
    res.responses.forEach((r, j) => {
      if (!r.success) {
        console.warn(`Échec pour ${batch[j].member} : ${r.error?.code}`);
        if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(r.error?.code)) dead.push(batch[j].token);
      }
    });
    console.log(`${k} : ${res.successCount} envoyé(s), ${res.failureCount} échec(s).`);
  }
  if (!forced) await weekRef.set({ sent: { [k]: true } }, { merge: true });
}
for (const t of dead) await db.doc(`tokens/${t}`).delete();
