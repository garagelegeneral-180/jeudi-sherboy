// Publie La Gazette du vendredi et l'annonce à la gang.
// Roule le vendredi matin grâce à GitHub Actions (.github/workflows/gazette.yml).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const ctx = { self: {} };
vm.createContext(ctx);
for (const f of ["config.js", "data.js", "gazette.js"]) vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), ctx);
const CFG = ctx.self.JS_CONFIG, D = ctx.self.JS_DATA, makeGazette = ctx.self.makeGazette;

const TZ = "America/Toronto";
const localKey = d => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const now = new Date();
const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, weekday: "short", hour: "2-digit", hour12: false }).formatToParts(now).map(p => [p.type, p.value]));
const forced = process.env.DATE || "";
if (!forced && (parts.weekday !== "Fri" || Number(parts.hour) % 24 < 9)) { console.log("Pas vendredi 9 h : rien à publier."); process.exit(0); }
const date = forced || localKey(new Date(now.getTime() - 24 * 3600e3));   // le jeudi d'hier

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore(), fcm = getMessaging();
const ref = db.doc(`gazette/${date}`);
if ((await ref.get()).exists && !forced) { console.log(`La Gazette du ${date} est déjà publiée.`); process.exit(0); }

const week = (await db.doc(`weeks/${date}`).get()).data();
if (!week || !week.rsvp || !Object.keys(week.rsvp).length) { console.log(`Personne n'a répondu pour le ${date} : pas de Gazette.`); process.exit(0); }

const logEntry = (await db.collection("log").where("date", "==", date).limit(1).get()).docs[0]?.data();
const quotes = (await db.collection("quotes").where("date", "==", date).get()).docs.map(d => d.data()).sort((a, b) => a.created?.toMillis?.() - b.created?.toMillis?.());
const chat = (await db.collection("chat").orderBy("created", "desc").limit(300).get()).docs.map(d => d.data());
const photo = chat.filter(m => m.img && m.created && localKey(m.created.toDate()) === date)[0] || null;
const ideas = (await db.collection("ideas").get()).docs.map(d => d.data()).sort((a, b) => (b.v || []).length - (a.v || []).length);

const g = makeGazette({ date, week, logEntry, quotes, photo, topIdea: ideas[0], CFG, D });
await ref.set(JSON.parse(JSON.stringify(g)));
console.log(`Gazette publiée : ${g.titre}`);

// Annonce à la gang
const prefs = Object.fromEntries((await db.collection("prefs").get()).docs.map(d => [d.id, d.data().rem || {}]));
const def = Object.fromEntries(D.reminders.map(r => [r[0], r[3]]));
const wants = m => ("gazette" in (prefs[m] || {}) ? prefs[m].gazette : def.gazette ?? true);
const tokens = (await db.collection("tokens").get()).docs.map(d => ({ token: d.id, member: d.data().member })).filter(t => wants(t.member));
if (tokens.length) {
  const res = await fcm.sendEachForMulticast({
    tokens: tokens.map(t => t.token),
    notification: { title: "🗞️ La Gazette Sherboy est sortie!", body: g.titre.charAt(0) + g.titre.slice(1).toLowerCase() },
    webpush: { notification: { icon: CFG.siteUrl + "icons/icon-192.png", tag: "gazette" }, fcmOptions: { link: CFG.siteUrl } }
  });
  console.log(`${res.successCount} notification(s) envoyée(s).`);
}
