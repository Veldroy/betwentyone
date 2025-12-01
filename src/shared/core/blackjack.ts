// src/shared/core/blackjack.ts
import type { Card, Rank, Suit } from '../../shared/types/api';

export type Shoe = Card[];
export interface Rules {
  decks: number;
  s17: boolean;
  doubleAfterSplit: boolean;
  resplitLimit: number;     // e.g., 3
  blackjackPayout: number;  // 1.5 for 3:2
  allowSurrender: boolean;
  dealerPeeks: boolean;
}
export const DEFAULT_RULES: Rules = {
  decks: 6,
  s17: true,
  doubleAfterSplit: true,
  resplitLimit: 3,
  blackjackPayout: 1.5,
  allowSurrender: true,
  dealerPeeks: true,
};

export const ranks: Rank[] = ['A','2','3','4','5','6','7','8','9','T','J','Q','K'];
export const suits: Suit[] = ['S','H','D','C'];

export function makeShoe(decks: number, rng: () => number): Shoe {
  const shoe: Shoe = [];
  for (let d = 0; d < decks; d++) {
    for (const r of ranks) for (const s of suits) shoe.push(`${r}${s}` as Card);
  }
  // Fisher–Yates
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

export function value(card: Card): number {
  const r = card[0] as Rank;
  if (r === 'A') return 11;
  if (['T','J','Q','K'].includes(r)) return 10;
  return parseInt(r, 10);
}

export function score(cards: Card[]): { total: number; soft: boolean; isBlackjack: boolean; isBust: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c[0] === 'A') aces++;
    total += value(c);
  }
  let soft = false;
  while (total > 21 && aces > 0) {
    total -= 10; // count an Ace as 1
    aces--;
  }
  soft = cards.some(c => c[0] === 'A') && total <= 21 && aces > 0;
  const isBlackjack = cards.length === 2 && total === 21;
  const isBust = total > 21;
  return { total, soft, isBlackjack, isBust };
}

export function canSplit(cards: Card[]): boolean {
  return cards.length === 2 && cards[0][0] === cards[1][0];
}

export function dealerShouldHit(cards: Card[], rules: Rules): boolean {
  const s = score(cards);
  if (s.total < 17) return true;
  if (!rules.s17) return false;
  return s.total === 17 && s.soft; // hit soft 17 if H17
}
