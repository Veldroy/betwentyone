// src/server/core/post.ts
import { Router } from 'express';
import {
  startSoloGame,
  createTable,
  joinTable,
  getGame,
  performAction,
} from './gameStore';

export function createGameRouter() {
  const router = Router();

  // Start solo game vs AI
  router.post('/api/solo/start', (req, res) => {
    const { playerId, displayName } = req.body;
    const view = startSoloGame(playerId, displayName ?? playerId);
    res.json(view);
  });

  // Create competitive table
  router.post('/api/table/create', (req, res) => {
    const { playerId, displayName } = req.body;
    const view = createTable(playerId, displayName ?? playerId);
    res.json(view);
  });

  // Join an existing table
  router.post('/api/table/join', (req, res) => {
    const { gameId, playerId, displayName } = req.body;
    try {
      const view = joinTable(gameId, playerId, displayName ?? playerId);
      res.json(view);
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? 'join failed' });
    }
  });

  // Get current game state (polling from client)
  router.get('/api/game/:id', (req, res) => {
    try {
      const view = getGame(req.params.id);
      res.json(view);
    } catch (err: any) {
      res.status(404).json({ error: err.message ?? 'not found' });
    }
  });

  // Player action: hit / stand / double
  router.post('/api/game/:id/action', (req, res) => {
    const { playerId, action } = req.body;
    try {
      const view = performAction(req.params.id, playerId, action);
      res.json(view);
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? 'invalid action' });
    }
  });

  return router;
}
