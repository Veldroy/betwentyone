// src/shared/core/ai.ts
import { score, canSplit } from './blackjack';
import type { Card, Rules } from './blackjack';

export interface AIConfig { aggression: number;  // 0..1, >0 tiebreakers shift to risk
}

export function aiAction(
  hand: Card[],
  dealerUp: Card,
  rules: Rules,
  bankroll: number,
  config: AIConfig = { aggression: 0.4 }
): 'hit'|'stand'|'double'|'split'|'surrender' {
  // Basic strategy (condensed) with light aggression bias.
  const up = dealerUp[0];
  const { total, soft } = score(hand);

  // Surrender
  if (!soft && (total === 16 && '9TJAQK'.includes(up) || total === 15 && up === 'T')) return 'surrender';

  // Splits
  if (canSplit(hand)) {
    const r = hand[0][0];
    if (r === 'A' || r === '8') return 'split';
    if (r === '9' && !'7TJAQK'.includes(up)) return 'split';
    if (r === '7' && '234567'.includes(up)) return 'split';
    if (r === '6' && '23456'.includes(up)) return 'split';
    if (r === '2' || r === '3') if ('234567'.includes(up)) return 'split';
  }

  // Doubles
  if (!soft) {
    if (total === 11) return 'double';
    if (total === 10 && !'TJAQK'.includes(up)) return 'double';
    if (total === 9 && '3456'.includes(up)) return 'double';
  } else {
    if (total === 18 && '3456'.includes(up)) return 'double';
    if (total === 17 && '3456'.includes(up)) return 'double';
    if (total === 16 && '3456'.includes(up)) return 'double';
    if (total === 15 && '3456'.includes(up)) return 'double';
    if (total === 14 && '3456'.includes(up)) return 'double';
    if (total === 13 && '3456'.includes(up)) return 'double';
  }

  // Hit/Stand
  if (soft) {
    if (total <= 17) return 'hit';
    if (total === 18) return 'hit'.repeat(config.aggression > 0.5 ? 1 : 0) ? 'hit' : 'stand';
    return 'stand';
  } else {
    if (total <= 11) return 'hit';
    if (total === 12) return 'hit'.repeat('234'.includes(up) ? 1 : 0) ? 'hit' : 'stand';
    if (total >= 13 && total <= 16) return 'hit'.repeat('7TJAQK'.includes(up) ? 1 : 0) ? 'hit' : 'stand';
    return 'stand';
  }
}
