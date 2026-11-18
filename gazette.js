// La Gazette du vendredi : écrit la une du journal à partir de ce qui s'est passé le jeudi.
// Ce fichier sert à l'app (affichage) et au script GitHub qui publie l'édition chaque vendredi.
self.makeGazette = function (input) {
  const { date, week = {}, logEntry, quotes = [], photo, topIdea, CFG, D } = input;
  const M = CFG.members, Q = CFG.quorum || 4;
  const name = id => (M.find(m => m.id === id) || {}).name || "Un inconnu";
  const list = arr => arr.length <= 1 ? (arr[0] || "") : arr.slice(0, -1).join(", ") + " et " + arr[arr.length - 1];
  // Petit hasard stable : la même date donne toujours les mêmes tournures.
  let h = 0; for (const ch of date) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = arr => arr[(h = (h * 1103515245 + 12345) >>> 0) % arr.length];

  const rsvp = week.rsvp || {}, ex = week.extras || {};
  const presents = M.filter(m => rsvp[m.id] === "oui").map(m => m.id);
  const absents = M.filter(m => rsvp[m.id] === "non").map(m => m.id);
  const withX = k => M.filter(m => (ex[m.id] || []).includes(k)).map(m => name(m.id));
  const n = presents.length;
  const lieu = logEntry?.p || topIdea?.t || null;
  const LIEU = lieu ? lieu.toUpperCase() : "UN LIEU TENU SECRET";
  const [y, mo, d] = date.split("-").map(Number);
  const wi = Math.floor(Date.UTC(y, mo - 1, d) / 864e5 / 7);
  const capt = M[((wi % M.length) + M.length) % M.length];

  // Gros titre
  let titre;
  if (n === 0) titre = pick(["JEUDI FANTÔME : PERSONNE AU RENDEZ-VOUS", "SILENCE RADIO : LA GANG RESTE COUCHÉE", "AUCUN SHERBOY APERÇU EN VILLE CE JEUDI"]);
  else if (n < Q) titre = pick([`JEUDI INTIME : SEULEMENT ${n} BRAVE${n > 1 ? "S" : ""} À ${LIEU}`, `LA RÉSISTANCE S'ORGANISE : ${n} FIDÈLE${n > 1 ? "S" : ""} TIENNENT LE FORT`, `PETIT COMITÉ, GRANDES HISTOIRES À ${LIEU}`]);
  else if (n >= M.length) titre = pick([`HISTORIQUE : LES ${n} SHERBOYS RÉUNIS À ${LIEU}`, `ALIGNEMENT DES PLANÈTES : TOUTE LA GANG ÉTAIT LÀ`, `${LIEU} N'A RIEN VU VENIR : GANG AU COMPLET`]);
  else titre = pick([`${n} SHERBOYS ENVAHISSENT ${LIEU}`, `SOIRÉE CONFIRMÉE : ${n} SHERBOYS À ${LIEU}`, `${LIEU} SURVIT DE JUSTESSE À LA VISITE DE ${n} SHERBOYS`]);

  // Chapeau
  const bits = [];
  if (withX("noir").length) bits.push(`Les témoins rapportent que « ça allait être tout noir », selon ${list(withX("noir"))}.`);
  if (withX("mush").length) bits.push(`${list(withX("mush"))} avai${withX("mush").length > 1 ? "en" : ""}t promis de « mush la place ». Promesse tenue, selon nos sources.`);
  if (withX("tonight").length) bits.push(`« Tonight is the night », avait annoncé ${list(withX("tonight"))}.`);
  if (withX("garage").length) bits.push(`Repli stratégique au garage réclamé par ${list(withX("garage"))}.`);
  if (withX("maison").length) bits.push(`${list(withX("maison"))} a lancé l'appel : tout le monde à maison.`);
  const defis = (D.defis || []).concat(D.hardcore || []);
  const defiTxt = week.defi != null ? defis[week.defi] : null;
  const hard = week.defi != null && week.defi >= (D.defis || []).length;
  const ok = (week.defiOk || []).map(name);
  if (defiTxt && ok.length) bits.push(`${hard ? "Défi hardcore relevé" : "Défi relevé"} par ${list(ok)} : « ${defiTxt} ».`);
  else if (defiTxt) bits.push(`Le défi « ${defiTxt} » n'a trouvé aucun preneur. La honte plane.`);
  if (!bits.length) bits.push(n ? pick(["Une soirée dont on reparlera longtemps, ou pas du tout.", "Les détails restent flous, comme il se doit.", "Ce qui se passe au jeudi reste au jeudi."]) : "La rédaction espère un meilleur jeudi la semaine prochaine.");
  const chapeau = bits.slice(0, 2).join(" ");

  // Brèves
  const breves = [];
  breves.push(`Capitaine de la soirée : ${capt.name}.`);
  if (withX("lift").length) breves.push(`Merci à ${list(withX("lift"))} pour le lift. La gang est rentrée entière.`);
  if (withX("retard").length) breves.push(`${list(withX("retard"))} est arrivé en retard. Personne n'est surpris.`);
  if (withX("biere").length) breves.push(`La bière a été fournie par ${list(withX("biere"))}. Gloire éternelle.`);
  if (withX("dos").length) breves.push(`Bulletin de santé : ${list(withX("dos"))} se plain${withX("dos").length > 1 ? "ent" : "t"} encore du dos.`);
  if (withX("plusun").length) breves.push(`${list(withX("plusun"))} a amené un invité mystère.`);
  const g = week.guess || {};
  let devin = null, diff = 99;
  for (const [id, v] of Object.entries(g)) { const dd = Math.abs(v - n); if (dd < diff) { diff = dd; devin = id; } }
  if (devin) breves.push(diff === 0 ? `${name(devin)} avait prédit ${n} présents. Le Devin frappe encore.` : `Le Devin de la semaine : ${name(devin)}, à ${diff} près.`);
  if (absents.length) breves.push(`Absents remarqués : ${list(absents.map(name))}. On vous a gardé une place.`);

  const citation = quotes.length ? quotes[quotes.length - 1] : null;
  return {
    date, titre, chapeau, breves,
    photo: photo?.img || null, photoBy: photo ? name(photo.by) : null, photoTxt: photo?.text || null,
    citation: citation ? { t: citation.t, who: name(citation.who) } : null,
    presents: presents.map(name), lieu, etoiles: logEntry?.s || null,
    edition: wi - 2967   // la première édition (no 1) est celle du jeudi 19 novembre 2026
  };
};
