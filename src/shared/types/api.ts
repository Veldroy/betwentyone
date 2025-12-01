// src/shared/types/api.ts
export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K';
export type Card = `${Rank}${Suit}`;
export type HandId = string;
export type SessionId = string;
export type TableCode = string; // e.g., 'AB7Q'

export interface PlayerView {
  id: string;            // reddit user id
  name: string;          // reddit username
  seat: number;
  chips: number;
  isYou: boolean;
}

export interface HandView {
  id: HandId;
  cards: Card[];
  total: number;         // best valid total
  soft: boolean;
  bet: number;
  canSplit: boolean;
  canDouble: boolean;
  canSurrender: boolean;
  isBust: boolean;
  isBlackjack: boolean;
  isActive: boolean;
}

export interface DealerView {
  upcard: Card | null;
  holeRevealed: boolean;
  cards: Card[];
  total: number | null;
}

export interface TableView {
  sessionId: SessionId;
  code?: TableCode;
  shoeSize: number;
  cutCardPenetration: number; // 0..1
  round: number;
  dealer: DealerView;
  players: PlayerView[];
  hands: Record<string, HandView[]>; // by player id
  turn: { playerId: string; handId: HandId } | null;
  phase: 'betting' | 'dealing' | 'acting' | 'settling';
  you?: PlayerView;
}

export interface CreateRequest {
  mode: 'solo' | 'pvp';
  seats?: number;              // default 5
  decks?: number;              // default 6
  s17?: boolean;               // dealer stands on soft 17
  minBet?: number;             // default 10
  code?: TableCode;            // optional for private table
}

export interface ActionRequest {
  sessionId: SessionId;
  action: 'bet' | 'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'insurance' | 'next';
  handId?: HandId;
  amount?: number;
}

export interface ApiResponse<T> {
  ok: true; data: T; sig: string;
}
export interface ApiError {
  ok: false; error: string;
}
