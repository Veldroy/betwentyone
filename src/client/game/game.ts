// src/client/game.ts
import * as THREE from 'three';
import { API } from './net';
import type { ActionRequest, TableView } from '../shared/types/api';
import { createTable, drawTableState } from './render/table';
import { installUI } from './ui';

let view: TableView | null = null;
let pollTimer: number | null = null;

async function start() {
  const canvas = document.getElementById('three') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 100);
  const { dispose } = createTable(scene, camera, renderer);

  installUI({
    onSolo: async () => setView(await API.create({ mode: 'solo' })),
    onQuick: async () => setView(await API.create({ mode: 'pvp' })),
    onJoin: async (code) => setView(await API.join(code)),
    onAction: async (action) => {
      if (!view) return;
      const payload: ActionRequest = { sessionId: view.sessionId, action, handId: view.turn?.handId };
      setView(await API.action(payload));
    }
  });

  function loop() {
    requestAnimationFrame(loop);
    if (view) drawTableState(scene, view);
    renderer.render(scene, camera);
  }
  loop();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function setView(v: TableView) {
    view = v;
    // begin polling server for updates
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(async () => {
      try { view = await API.poll(view!.sessionId); }
      catch {}
    }, 900);
  }
}
start();
