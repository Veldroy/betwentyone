// src/server/core/gameStore.ts
import {
  BlackjackGameState,
  createSoloGame,
  createTableGame,
  playerAction,
  toPublicView,
  PlayerAction,
} from '../../shared/blackjack';

const games = new Map<string, BlackjackGameState>();

export function startSoloGame(playerId: string, displayName: string) {
  const game = createSoloGame(playerId, displayName);
  games.set(game.id, game);
  return toPublicView(game);
}

export function createTable(ownerId: string, ownerName: string) {
  const game = createTableGame(ownerId, ownerName);
  games.set(game.id, game);
  return toPublicView(game);
}

export function joinTable(gameId: string, playerId: string, displayName: string) {
  const game = games.get(gameId);
  if (!game) {
    throw new Error('Table not found');
  }
  if (game.mode !== 'table') {
    throw new Error('Not a table game');
  }

  if (!game.players.find(p => p.id === playerId)) {
    game.players.push({
      id: playerId,
      displayName,
      chips: 1000,
      bet: 50,
      hand: { cards: [], isStanding: false, isBusted: false, hasBlackjack: false },
      hasFinished: false,
    });
  }

  return toPublicView(game);
}

export function getGame(gameId: string) {
  const game = games.get(gameId);
  if (!game) {
    throw new Error('Game not found');
  }
  return toPublicView(game);
}

export function performAction(gameId: string, playerId: string, action: PlayerAction) {
  const game = games.get(gameId);
  if (!game) {
    throw new Error('Game not found');
  }
  playerAction(game, playerId, action);
  return toPublicView(game);
}
