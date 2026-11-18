// Avertit la gang des nouveaux messages dans la jasette.
// Roule aux 15 minutes grâce à GitHub Actions (.github/workflows/jasette.yml).
// Chacun reçoit une seule notification qui résume les messages des autres depuis le dernier passage.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const ctx = { self: {} };
vm.createContext(ctx);
for (const f of ["config.js", "data.js"]) vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), ctx);
const CFG = ctx.self.JS_CONFIG, D = ctx.self.JS_DATA;
const byId = Object.fromEntries(CFG.members.map(m => [m.id, m]));

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore(), fcm = getMessaging();

const markRef = db.doc("state/jasette");
const mark = (await markRef.get()).data();
if (!mark || !mark.last) {
  // Premier passage : on part d'aujourd'hui, sans renvoyer tout l'historique.
  await markRef.set({ last: Timestamp.now() });
  console.log("Premier passage : point de départ enregistré.");
  process.exit(0);
}

const snap = await db.collection("chat").where("created", ">", mark.last).orderBy("created").get();
if (snap.empty) { console.log("Aucun nouveau message."); process.exit(0); }
const msgs = snap.docs.map(d => d.data());
const newest = msgs[msgs.length - 1].created;

const prefsSnap = await db.collection("prefs").get();
const prefs = Object.fromEntries(prefsSnap.docs.map(d => [d.id, d.data().rem || {}]));
const def = Object.fromEntries(D.reminders.map(r => [r[0], r[3]]));
const wants = m => ("chat" in (prefs[m] || {}) ? prefs[m].chat : def.chat ?? true);
const tokens = (await db.collection("tokens").get()).docs.map(d => ({ token: d.id, member: d.data().member }));

const short = t => (t.length > 90 ? t.slice(0, 87) + "…" : t);
function summary(list) {
  if (list.length === 1) {
    const m = list[0], n = byId[m.by]?.name || "Quelqu'un";
    if (m.img && !m.text) return `${n} a partagé une photo`;
    return `${n} : ${short(m.text || "")}${m.img ? " (avec une photo)" : ""}`;
  }
  const names = [...new Set(list.map(m => byId[m.by]?.name || "Quelqu'un"))];
  const last = list[list.length - 1];
  return `${list.length} nouveaux messages de ${names.join(", ")}. Dernier : ${short(last.text || "une photo")}`;
}

const messages = [];
for (const t of tokens) {
  if (!byId[t.member] || !wants(t.member)) continue;
  const mine = msgs.filter(m => m.by !== t.member);   // on ne t'avertit pas de tes propres messages
  if (!mine.length) continue;
  messages.push({ token: t.token, member: t.member, body: summary(mine) });
}

const dead = [];
for (let i = 0; i < messages.length; i += 500) {
  const batch = messages.slice(i, i + 500);
  const res = await fcm.sendEach(batch.map(m => ({
    token: m.token,
    notification: { title: "Jasette Sherboy", body: m.body },
    webpush: { notification: { icon: CFG.siteUrl + "icons/icon-192.png", tag: "jasette" }, fcmOptions: { link: CFG.siteUrl + "#jasette" } }
  })));
  res.responses.forEach((r, j) => {
    if (!r.success) {
      console.warn(`Échec pour ${batch[j].member} : ${r.error?.code}`);
      if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(r.error?.code)) dead.push(batch[j].token);
    }
  });
  console.log(`${res.successCount} notification(s) envoyée(s), ${res.failureCount} échec(s).`);
}
for (const t of dead) await db.doc(`tokens/${t}`).delete();
await markRef.set({ last: newest });
console.log(`${msgs.length} nouveau(x) message(s) traité(s).`);
