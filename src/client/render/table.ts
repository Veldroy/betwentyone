// src/client/render/table.ts
import * as THREE from 'three';
import type { TableView, Card } from '../../shared/types/api';

let group: THREE.Group;

export function createTable(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer) {
  camera.position.set(0, 8, 12); (camera as THREE.PerspectiveCamera).lookAt(0, 0, 0);
  const light = new THREE.DirectionalLight(0xffffff, 1); light.position.set(5,10,7); scene.add(light);
  group = new THREE.Group(); scene.add(group);
  return { dispose() { scene.remove(group); } };
}

export function drawTableState(scene: THREE.Scene, view: TableView) {
  // For brevity: clear and rebuild every frame. Optimize with object pooling in production.
  group.clear();

  // Dealer
  const dealerText = textSprite(`Dealer ${view.dealer.total ?? ''}`);
  dealerText.position.set(0, 3.2, 0); group.add(dealerText);

  // Players
  for (const p of view.players) {
    const x = -6 + p.seat * 3;
    const name = textSprite(`${p.name} • ${p.chips}`);
    name.position.set(x, -3.2, 0); group.add(name);

    const hands = view.hands[p.id] ?? [];
    hands.forEach((h, i) => {
      const hx = x + i * 1.2;
      const hlabel = textSprite(`${h.total}${h.soft ? ' (S)' : ''}${h.isBlackjack ? ' BJ' : ''}`);
      hlabel.position.set(hx, -2.4, 0); group.add(hlabel);
      h.cards.forEach((c, j) => {
        const spr = cardSprite(c);
        spr.position.set(hx + j * 0.5, -2.0, 0);
        group.add(spr);
      });
    });
  }

  // Dealer cards
  (view.dealer.cards || []).forEach((c, i) => {
    const spr = cardSprite(c as Card);
    spr.position.set(-1 + i * 0.5, 2.6, 0);
    group.add(spr);
  });
}

function cardSprite(card: Card) {
  // Placeholder: use a colored plane with text. Replace w/ your atlas.
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 356;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,256,356);
  ctx.strokeStyle = '#000'; ctx.strokeRect(0,0,256,356);
  ctx.fillStyle = '#000'; ctx.font = '48px sans-serif';
  ctx.fillText(card, 20, 60);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex });
  const sp = new THREE.Sprite(mat); sp.scale.set(1, 1.4, 1);
  return sp;
}

function textSprite(text: string) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0,0,512,128);
  ctx.fillStyle = '#fff'; ctx.font = '40px sans-serif'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
  ctx.strokeText(text, 10, 80); ctx.fillText(text, 10, 80);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sp = new THREE.Sprite(mat); sp.scale.set(5, 1.2, 1);
  return sp;
}
