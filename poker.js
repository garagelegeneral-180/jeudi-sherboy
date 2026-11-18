// Moteur de poker Texas Hold'em pour Jeudi Sherboy.
// Fonctions pures : elles reçoivent l'état de la table et renvoient le nouvel état.
// Les montants sont en jetons fictifs : on joue pour le plaisir, sans argent.
(function () {
  const RANKS = "23456789TJQKA", SUITS = "shdc";
  const SUIT_ICON = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const RANK_NAME = { T: "10", J: "V", Q: "D", K: "R", A: "A" };
  const clone = o => JSON.parse(JSON.stringify(o));

  function shuffledDeck() {
    const d = []; for (const r of RANKS) for (const s of SUITS) d.push(r + s);
    const rnd = n => { const a = new Uint32Array(1); (self.crypto || globalThis.crypto).getRandomValues(a); return a[0] % n; };
    for (let i = d.length - 1; i > 0; i--) { const j = rnd(i + 1); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }

  /* ---------- Évaluation des mains ---------- */
  const CAT = ["Carte haute", "Paire", "Deux paires", "Brelan", "Quinte", "Couleur", "Main pleine", "Carré", "Quinte couleur"];
  function eval5(cards) {
    const v = cards.map(c => RANKS.indexOf(c[0])).sort((a, b) => b - a);
    const suits = cards.map(c => c[1]);
    const flush = suits.every(s => s === suits[0]);
    let uniq = [...new Set(v)];
    let straightHigh = -1;
    if (uniq.length === 5) {
      if (v[0] - v[4] === 4) straightHigh = v[0];
      else if (v[0] === 12 && v[1] === 3 && v[4] === 0) straightHigh = 3;   // roue A-2-3-4-5
    }
    const counts = {}; v.forEach(x => counts[x] = (counts[x] || 0) + 1);
    const groups = Object.entries(counts).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    const byGroups = groups.map(g => g[1]);
    if (flush && straightHigh >= 0) return [8, straightHigh];
    if (groups[0][0] === 4) return [7, ...byGroups];
    if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...byGroups];
    if (flush) return [5, ...v];
    if (straightHigh >= 0) return [4, straightHigh];
    if (groups[0][0] === 3) return [3, ...byGroups];
    if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...byGroups];
    if (groups[0][0] === 2) return [1, ...byGroups];
    return [0, ...v];
  }
  const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? -1) - (b[i] ?? -1); if (d) return d; } return 0; };
  // Meilleure main de 5 cartes parmi 5, 6 ou 7 cartes.
  function best(cards) {
    if (cards.length < 5) return null;
    let top = null;
    const pickFive = (start, chosen) => {
      if (chosen.length === 5) { const sc = eval5(chosen); if (!top || cmp(sc, top) > 0) top = sc; return; }
      for (let i = start; i <= cards.length - (5 - chosen.length); i++) pickFive(i + 1, chosen.concat([cards[i]]));
    };
    pickFive(0, []);
    return top;
  }
  const handName = score => CAT[score[0]];

  /* ---------- Table ---------- */
  function newTable(buyin) {
    return { buyin, sb: Math.max(5, Math.round(buyin * 0.01 / 5) * 5), bb: Math.max(10, Math.round(buyin * 0.02 / 5) * 5),
      seats: [], buyins: {}, cashouts: {}, dealer: -1, hand: null, handNo: 0, open: true };
  }
  function join(t, id) {
    t = clone(t);
    if (t.seats.some(s => s.id === id) || t.seats.length >= 9) return t;
    t.seats.push({ id, stack: t.buyin });
    t.buyins[id] = (t.buyins[id] || 0) + t.buyin;
    return t;
  }
  function rebuy(t, id) {
    t = clone(t); const s = t.seats.find(x => x.id === id);
    if (!s || inHandActive(t, id) || s.stack > 0) return t;
    s.stack += t.buyin; t.buyins[id] = (t.buyins[id] || 0) + t.buyin; return t;
  }
  function leave(t, id) {
    t = clone(t);
    if (inHandActive(t, id)) return t;
    const i = t.seats.findIndex(x => x.id === id); if (i < 0) return t;
    t.cashouts[id] = (t.cashouts[id] || 0) + t.seats[i].stack;
    t.seats.splice(i, 1);
    if (t.dealer >= i && t.dealer > -1) t.dealer--;
    return t;
  }
  const inHandActive = (t, id) => !!(t.hand && t.hand.street !== "done" && t.hand.players.includes(id) && !t.hand.folded[id]);

  function nextSeatIndex(t, from, ok) {
    for (let k = 1; k <= t.seats.length; k++) { const i = (from + k) % t.seats.length; if (ok(t.seats[i], i)) return i; }
    return -1;
  }

  function startHand(t) {
    t = clone(t);
    if (t.hand && t.hand.street !== "done") return t;
    const live = t.seats.filter(s => s.stack > 0);
    if (live.length < 2) return t;
    t.dealer = nextSeatIndex(t, t.dealer < 0 ? -1 : t.dealer, s => s.stack > 0);
    const deck = shuffledDeck();
    const order = []; let i = t.dealer;
    do { if (t.seats[i].stack > 0) order.push(t.seats[i].id); i = (i + 1) % t.seats.length; } while (i !== t.dealer);
    // order commence par le donneur
    const players = order;
    const h = { no: ++t.handNo, players, dealerId: players[0], deck, board: [], hole: {}, street: "preflop",
      folded: {}, allin: {}, bet: {}, contrib: {}, cur: 0, minRaise: t.bb, acted: {}, toAct: null, log: [], result: null, since: Date.now() };
    players.forEach(id => { h.hole[id] = [h.deck.pop(), h.deck.pop()]; h.bet[id] = 0; h.contrib[id] = 0; });
    const headsUp = players.length === 2;
    const sbId = headsUp ? players[0] : players[1];
    const bbId = headsUp ? players[1] : players[2 % players.length];
    t.hand = h;
    pay(t, sbId, t.sb); pay(t, bbId, t.bb);
    h.cur = Math.max(h.bet[sbId], h.bet[bbId]);
    h.log.push(`Main no ${h.no} : petite blind ${money(t.sb)}, grosse blind ${money(t.bb)}.`);
    h.bbId = bbId;
    h.toAct = nextActor(t, bbId, true);
    if (!h.toAct) runOut(t);
    return t;
  }
  function pay(t, id, amount) {
    const s = t.seats.find(x => x.id === id), h = t.hand;
    const a = Math.min(amount, s.stack);
    s.stack -= a; h.bet[id] += a; h.contrib[id] += a;
    if (s.stack === 0) h.allin[id] = true;
    return a;
  }
  const canAct = (h, id) => !h.folded[id] && !h.allin[id];
  function nextActor(t, afterId, includeUnacted) {
    const h = t.hand, n = h.players.length, start = h.players.indexOf(afterId);
    for (let k = 1; k <= n; k++) {
      const id = h.players[(start + k) % n];
      if (!canAct(h, id)) continue;
      if (!h.acted[id] || h.bet[id] < h.cur) return id;
    }
    return null;
  }
  const money = c => Math.round(c).toLocaleString("fr-CA") + " jetons";

  function act(t, id, action, amount) {
    t = clone(t); const h = t.hand;
    if (!h || h.street === "done" || h.toAct !== id) return t;
    const s = t.seats.find(x => x.id === id);
    const toCall = h.cur - h.bet[id];
    if (action === "fold") { h.folded[id] = true; h.log.push(`${id}|se couche`); }
    else if (action === "check") { if (toCall > 0) return t; h.log.push(`${id}|passe`); }
    else if (action === "call") { const p = pay(t, id, toCall); h.log.push(`${id}|suit ${money(p)}`); }
    else if (action === "raise" || action === "allin") {
      let target = action === "allin" ? h.bet[id] + s.stack : Math.min(amount, h.bet[id] + s.stack);
      const minTarget = h.cur + h.minRaise;
      if (target < minTarget && target < h.bet[id] + s.stack) return t;   // relance trop petite
      if (target <= h.cur) { const p = pay(t, id, target - h.bet[id]); h.log.push(`${id}|suit ${money(p)} (tapis)`); }
      else {
        const raiseBy = target - h.cur;
        pay(t, id, target - h.bet[id]);
        if (raiseBy >= h.minRaise) { h.minRaise = raiseBy; h.acted = {}; }
        h.cur = target;
        h.log.push(`${id}|${s.stack === 0 ? "fait tapis à" : "relance à"} ${money(target)}`);
      }
    } else return t;
    h.acted[id] = true;
    h.since = Date.now();
    return advance(t, id);
  }

  function advance(t, lastId) {
    const h = t.hand;
    const alive = h.players.filter(p => !h.folded[p]);
    if (alive.length === 1) return finish(t, [{ id: alive[0], amount: potTotal(h), hand: null }], false);
    const nxt = nextActor(t, lastId, false);
    if (nxt) { h.toAct = nxt; return t; }
    // fin de la ronde de mises
    return nextStreet(t);
  }
  const potTotal = h => Object.values(h.contrib).reduce((a, b) => a + b, 0);

  function nextStreet(t) {
    const h = t.hand;
    h.players.forEach(p => h.bet[p] = 0); h.cur = 0; h.minRaise = t.bb; h.acted = {};
    if (h.street === "preflop") { h.board.push(h.deck.pop(), h.deck.pop(), h.deck.pop()); h.street = "flop"; }
    else if (h.street === "flop") { h.board.push(h.deck.pop()); h.street = "turn"; }
    else if (h.street === "turn") { h.board.push(h.deck.pop()); h.street = "river"; }
    else return showdown(t);
    const actors = h.players.filter(p => canAct(h, p));
    if (actors.length < 2) return nextStreet(t);   // tout le monde à tapis : on sort les cartes
    h.toAct = nextActor(t, h.players[0], true);    // premier à parler après le donneur
    if (!h.toAct) return nextStreet(t);
    return t;
  }
  function runOut(t) { while (t.hand.street !== "done") nextStreet(t); return t; }

  function showdown(t) {
    const h = t.hand;
    const alive = h.players.filter(p => !h.folded[p]);
    const scores = {}; alive.forEach(p => scores[p] = best(h.hole[p].concat(h.board)));
    // pots secondaires selon ce que chacun a mis
    const levels = [...new Set(Object.values(h.contrib).filter(c => c > 0))].sort((a, b) => a - b);
    let prev = 0; const won = {};
    for (const lvl of levels) {
      let pot = 0; h.players.forEach(p => pot += Math.max(0, Math.min(h.contrib[p], lvl) - prev));
      const eligible = alive.filter(p => h.contrib[p] >= lvl);
      prev = lvl;
      if (!eligible.length || !pot) continue;
      let top = null, winners = [];
      eligible.forEach(p => { const c = top ? cmp(scores[p], top) : 1; if (c > 0) { top = scores[p]; winners = [p]; } else if (c === 0) winners.push(p); });
      const share = Math.floor(pot / winners.length / 5) * 5; let rest = pot - share * winners.length;
      winners.forEach((w, i) => { won[w] = (won[w] || 0) + share + (i === 0 ? rest : 0); });
    }
    const result = Object.entries(won).map(([id, amount]) => ({ id, amount, hand: handName(scores[id]) }));
    return finish(t, result, true, scores);
  }

  function finish(t, result, shown, scores) {
    const h = t.hand;
    result.forEach(r => { t.seats.find(s => s.id === r.id).stack += r.amount; });
    h.result = result; h.shown = shown; h.street = "done"; h.toAct = null; h.endedAt = Date.now();
    if (scores) h.hands = Object.fromEntries(Object.entries(scores).map(([id, sc]) => [id, handName(sc)]));
    h.deck = [];
    return t;
  }

  // Un joueur parti trop longtemps : n'importe qui peut le coucher après 60 secondes.
  function timeoutFold(t) {
    const h = t.hand; if (!h || !h.toAct || Date.now() - h.since < 60000) return t;
    return act(t, h.toAct, h.cur > h.bet[h.toAct] ? "fold" : "check");
  }

  function cardHTML(c, hidden) {
    if (hidden || !c) return `<span class="pcard back"></span>`;
    const red = c[1] === "h" || c[1] === "d";
    return `<span class="pcard${red ? " red" : ""}"><b>${RANK_NAME[c[0]] || c[0]}</b><i>${SUIT_ICON[c[1]]}</i></span>`;
  }

  self.Poker = { newTable, join, rebuy, leave, startHand, act, timeoutFold, best, eval5, cmp, handName, cardHTML, money, inHandActive };
})();
