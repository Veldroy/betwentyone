// src/server/index.ts
import { Devvit } from '@devvit/public-api';
import { mulberry32 } from './lib/rng';
import { withLock, getJSON, setJSON } from './lib/kv';
import { makeShoe, score, dealerShouldHit, DEFAULT_RULES } from '../shared/core/blackjack';
import type { CreateRequest, ActionRequest, TableView, SessionId, TableCode, Card } from '../shared/types/api';

type KV = Devvit.KVNamespace;
interface TableState {
  id: SessionId;
  code?: TableCode;
  rules: typeof DEFAULT_RULES;
  shoe: Card[];          // server-only
  cutIndex: number;
  round: number;
  dealer: Card[];
  players: {
    [playerId: string]: {
      name: string;
      seat: number;
      chips: number;
      hands: { id: string; cards: Card[]; bet: number; settled?: boolean }[];
      insurance?: number;
    }
  };
  order: string[];       // playerId turn order
  turn: { playerId: string; handId: string } | null;
  phase: 'betting'|'dealing'|'acting'|'settling';
}

function sessionKey(id: SessionId) { return `bj:session:${id}`; }
function codeKey(code: TableCode) { return `bj:code:${code}`; }

Devvit.addHTTP((app) => {
  const kv = app.kv as KV;

  app.get('/health', (_req) => Response.json({ ok: true }));

  app.post('/create', async (req) => {
    const body = await req.json() as CreateRequest;
    const reddit = req.reddit!; // user context
    const youId = reddit.userId!;
    const youName = reddit.username!;
    const id = crypto.randomUUID() as SessionId;

    const seed = Date.now() ^ (youId.hashCode?.() ?? Math.floor(Math.random()*1e9));
    const rng = mulberry32(seed);
    const rules = { ...DEFAULT_RULES, decks: body.decks ?? DEFAULT_RULES.decks, s17: body.s17 ?? DEFAULT_RULES.s17 };
    const shoe = makeShoe(rules.decks, rng);

    const state: TableState = {
      id, code: body.mode === 'pvp' ? (body.code ?? makeCode()) : undefined,
      rules, shoe,
      cutIndex: Math.floor(shoe.length * 0.75),
      round: 0, dealer: [],
      players: {
        [youId]: { name: youName, seat: 0, chips: 1000, hands: [] }
      },
      order: [youId],
      turn: null,
      phase: 'betting'
    };

    await setJSON(kv, sessionKey(id), state, 60 * 60 * 6); // 6h
    if (state.code) await kv.set(codeKey(state.code), id, { expirationTtl: 60 * 60 * 6 });

    return jsonSigned(viewFor(state, youId));
  });

  app.post('/join', async (req) => {
    const { code } = await req.json() as { code: TableCode };
    const id = await kv.get(codeKey(code));
    if (!id) return err('not-found');
    const reddit = req.reddit!; const youId = reddit.userId!; const youName = reddit.username!;
    return withLock(kv, sessionKey(id), async () => {
      const state = await getJSON<TableState>(kv, sessionKey(id as SessionId));
      if (!state) return err('not-found');
      if (Object.keys(state.players).length >= 5) return err('table-full');
      if (!state.players[youId]) {
        const seat = nextSeat(state);
        state.players[youId] = { name: youName, seat, chips: 1000, hands: [] };
        state.order.push(youId);
      }
      await setJSON(kv, sessionKey(state.id), state);
      return jsonSigned(viewFor(state, youId));
    });
  });

  app.post('/action', async (req) => {
    const reddit = req.reddit!;
    const youId = reddit.userId!;
    const body = await req.json() as ActionRequest;

    return withLock(kv, sessionKey(body.sessionId), async () => {
      const state = await getJSON<TableState>(kv, sessionKey(body.sessionId));
      if (!state) return err('not-found');

      // Transition helpers
      if (body.action === 'bet') {
        const p = state.players[youId]; if (!p) return err('not-seated');
        if (state.phase !== 'betting') return err('not-betting');
        const amt = Math.max(10, Math.min(p.chips, Math.floor(body.amount ?? 10)));
        p.hands = [{ id: crypto.randomUUID(), cards: [], bet: amt }];
        p.chips -= amt;
        if (everyPlayerHasBet(state)) {
          dealInitial(state);
        }
      } else if (['hit','stand','double','split','surrender','insurance'].includes(body.action)) {
        if (!isYourTurn(state, youId)) return err('not-your-turn');
        applyAction(state, youId, body);
      } else if (body.action === 'next') {
        if (state.phase === 'settling') nextRound(state);
      }

      await setJSON(kv, sessionKey(state.id), state);
      return jsonSigned(viewFor(state, youId));
    });
  });

  app.post('/poll', async (req) => {
    const { sessionId } = await req.json() as { sessionId: SessionId };
    const reddit = req.reddit!; const youId = reddit.userId!;
    const state = await getJSON<TableState>(kv, sessionKey(sessionId));
    if (!state) return err('not-found');
    return jsonSigned(viewFor(state, youId));
  });

  // Required trigger handler: acknowledge installs so playtests succeed.
  app.post('/internal/on-app-install', () => Response.json({ ok: true }));
});

function jsonSigned<T>(data: T) {
  // Minimal signature; for full integrity you can HMAC with a server secret.
  const sig = btoa(JSON.stringify({ n: Date.now(), r: (Math.random()*1e6)|0 }));
  return Response.json({ ok: true, data, sig });
}
function err(msg: string) {
  return Response.json({ ok: false, error: msg }, { status: 400 });
}
function makeCode(): TableCode {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:4}, () => alphabet[(Math.random()*alphabet.length)|0]).join('') as TableCode;
}
function nextSeat(state: TableState) {
  const taken = new Set(Object.values(state.players).map(p => p.seat));
  for (let i=0;i<5;i++) if (!taken.has(i)) return i;
  return 4;
}
function everyPlayerHasBet(s: TableState) {
  return Object.values(s.players).every(p => p.hands.length > 0);
}
function draw(s: TableState): Card {
  if (s.shoe.length <= s.cutIndex) {
    // reshuffle
    const rng = mulberry32(Date.now() ^ Math.random()*1e9);
    s.shoe = makeShoe(s.rules.decks, rng);
  }
  return s.shoe.pop()!;
}
function dealInitial(s: TableState) {
  s.phase = 'dealing';
  s.round++;
  s.dealer = [];
  // everyone gets two, dealer gets up+hole (hole kept server-side)
  for (let i=0;i<2;i++) {
    for (const pid of s.order) s.players[pid].hands[0].cards.push(draw(s));
    s.dealer.push(draw(s));
  }
  s.phase = 'acting';
  s.turn = { playerId: s.order[0], handId: s.players[s.order[0]].hands[0].id };
  // dealer peek
  const dealerBJ = score(s.dealer).isBlackjack;
  if (dealerBJ) finishDealerAndSettle(s);
}
function advanceTurn(s: TableState) {
  if (!s.turn) return;
  const idx = s.order.indexOf(s.turn.playerId);
  // move to next player/hand
  for (let i=idx;i<s.order.length;i++) {
    const pid = s.order[(i+1) % s.order.length];
    const hands = s.players[pid].hands;
    const next = hands.find(h => !h.settled && score(h.cards).total < 22);
    if (next) { s.turn = { playerId: pid, handId: next.id }; return; }
  }
  // dealer acts
  dealerPlay(s);
}
function dealerPlay(s: TableState) {
  while (dealerShouldHit(s.dealer, s.rules)) s.dealer.push(draw(s));
  finishDealerAndSettle(s);
}
function finishDealerAndSettle(s: TableState) {
  const d = score(s.dealer);
  for (const pid of s.order) {
    const p = s.players[pid];
    for (const h of p.hands) {
      const hs = score(h.cards);
      let delta = 0;
      if (hs.isBlackjack && !d.isBlackjack) delta = h.bet * s.rules.blackjackPayout;
      else if (hs.isBust) delta = -h.bet;
      else if (d.isBust) delta = h.bet;
      else if (hs.total > d.total) delta = h.bet;
      else if (hs.total < d.total) delta = -h.bet;
      p.chips += h.bet + Math.max(0, delta);
      h.settled = true;
    }
  }
  s.phase = 'settling';
  s.turn = null;
}
function nextRound(s: TableState) {
  for (const pid of s.order) s.players[pid].hands = [];
  s.dealer = [];
  s.phase = 'betting';
}

function isYourTurn(s: TableState, pid: string) {
  return s.turn?.playerId === pid && s.phase === 'acting';
}
function applyAction(s: TableState, pid: string, { action, handId }: ActionRequest) {
  const p = s.players[pid];
  const h = p.hands.find(x => x.id === handId)!;

  const drawCard = () => h.cards.push(draw(s));

  switch (action) {
    case 'hit':
      drawCard();
      if (score(h.cards).isBust) { h.settled = true; advanceTurn(s); }
      break;
    case 'stand':
      h.settled = true; advanceTurn(s); break;
    case 'double':
      if (p.chips >= h.bet) { p.chips -= h.bet; h.bet *= 2; drawCard(); h.settled = true; advanceTurn(s); }
      break;
    case 'split':
      if (p.hands.length <= 3 && p.chips >= h.bet && h.cards.length === 2 && h.cards[0][0]===h.cards[1][0]) {
        p.chips -= h.bet;
        const second = { id: crypto.randomUUID(), cards: [h.cards.pop()!], bet: h.bet };
        h.cards = [h.cards[0]];
        p.hands.push(second);
      }
      break;
    case 'surrender':
      h.settled = true; p.chips += Math.floor(h.bet/2); advanceTurn(s); break;
  }
}

function viewFor(s: TableState, youId: string): TableView {
  return {
    sessionId: s.id,
    code: s.code,
    shoeSize: s.shoe.length, cutCardPenetration: s.cutIndex / (s.shoe.length + s.cutIndex),
    round: s.round,
    dealer: {
      upcard: s.dealer[0] ?? null,
      holeRevealed: s.phase === 'settling',
      cards: s.phase === 'settling' ? s.dealer : [s.dealer[0]].filter(Boolean) as Card[],
      total: s.phase === 'settling' ? score(s.dealer).total : null
    },
    players: Object.entries(s.players).map(([id,p]) => ({
      id, name: p.name, seat: p.seat, chips: p.chips, isYou: id === youId
    })),
    hands: Object.fromEntries(Object.entries(s.players).map(([id,p]) => [id, p.hands.map(h => {
      const sc = score(h.cards);
      return {
        id: h.id, cards: h.cards, total: sc.total, soft: sc.soft, bet: h.bet,
        canSplit: h.cards.length===2 && h.cards[0][0]===h.cards[1][0],
        canDouble: h.cards.length===2,
        canSurrender: true,
        isBust: sc.isBust, isBlackjack: sc.isBlackjack, isActive: s.turn?.handId===h.id
      };
    })])),
    turn: s.turn ? { ...s.turn } : null,
    phase: s.phase,
    you: s.players[youId] ? { id: youId, name: s.players[youId].name, seat: s.players[youId].seat, chips: s.players[youId].chips, isYou: true } : undefined
  };
}
