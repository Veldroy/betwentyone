// src/client/render/table.ts
import * as THREE from 'three';
import type { Card, Suit, TableView } from '../../shared/types/api';

let root: THREE.Group;
let cardsGroup: THREE.Group;
let labelsGroup: THREE.Group;
let lastFrame = performance.now();

const cardSprites = new Map<string, THREE.Sprite>();
const cardTextureCache = new Map<Card, THREE.Texture>();
const textureInFlight = new Map<Card, Promise<void>>();
const loader = new THREE.TextureLoader();
const cardBackTexture = loader.load('/card-back.svg', (t) => {
  t.colorSpace = THREE.SRGBColorSpace;
});

const placeholderTexture = createPlaceholderTexture();
const rankMap: Record<string, string> = {
  A: 'A',
  T: '10',
  J: 'J',
  Q: 'Q',
  K: 'K',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
};

const suitSymbol: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

const frontImagePromise = loadImage('/card-front.svg');

export function createTable(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer) {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setClearColor(0x0b4a2f);

  camera.position.set(0, 8, 12);
  (camera as THREE.PerspectiveCamera).lookAt(0, 0, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  const light = new THREE.DirectionalLight(0xffffff, 1.1);
  light.position.set(5, 12, 7);
  scene.add(ambient, light);

  const felt = new THREE.Mesh(
    new THREE.CircleGeometry(9.5, 64),
    new THREE.MeshPhongMaterial({ color: 0x0c5e3c, shininess: 8 })
  );
  felt.rotateX(-Math.PI / 2);
  scene.add(felt);

  root = new THREE.Group();
  cardsGroup = new THREE.Group();
  labelsGroup = new THREE.Group();
  root.add(cardsGroup, labelsGroup);
  scene.add(root);

  return {
    dispose() {
      scene.remove(root);
      felt.geometry.dispose();
    },
  };
}

export function drawTableState(scene: THREE.Scene, view: TableView) {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  labelsGroup.clear();
  const activeKeys = new Set<string>();

  const dealerText = textSprite(`Dealer ${view.dealer.total ?? ''}`);
  dealerText.position.set(0, 3.6, 0.01);
  labelsGroup.add(dealerText);

  // Dealer cards (show a back for the hidden hole card until revealed)
  const dealerCards = view.dealer.cards || [];
  dealerCards.forEach((c, i) => {
    const key = `dealer-${i}`;
    const sprite = ensureCardSprite(key, c as Card, false);
    setCardTarget(sprite, new THREE.Vector3(-0.8 + i * 0.7, 2.7, i * 0.01));
    activeKeys.add(key);
  });
  if (!view.dealer.holeRevealed && dealerCards.length === 1) {
    const key = 'dealer-hole';
    const sprite = ensureCardSprite(key, dealerCards[0] as Card, true);
    setCardTarget(sprite, new THREE.Vector3(-0.1, 2.7, 0.02));
    activeKeys.add(key);
  }

  // Players and hands
  for (const p of view.players) {
    const x = -6 + p.seat * 3.2;
    const name = textSprite(`${p.name} • ${p.chips}` + (p.isYou ? ' (You)' : ''));
    name.position.set(x, -3.3, 0.01);
    labelsGroup.add(name);

    const hands = view.hands[p.id] ?? [];
    hands.forEach((h, i) => {
      const hx = x + i * 1.25;
      const hlabel = textSprite(
        `${h.total}${h.soft ? ' (S)' : ''}${h.isBlackjack ? ' BJ' : ''}${h.isBust ? ' Bust' : ''}`
      );
      hlabel.position.set(hx, -2.5, 0.01);
      labelsGroup.add(hlabel);
      h.cards.forEach((c, j) => {
        const key = `hand-${p.id}-${h.id}-${j}`;
        const sprite = ensureCardSprite(key, c, false);
        const offset = new THREE.Vector3(hx + j * 0.55, -2.1, (i * 5 + j) * 0.01);
        setCardTarget(sprite, offset, h.isActive ? 0.15 : 0.06 * (j % 2));
        activeKeys.add(key);
      });
    });
  }

  animateCards(dt);

  // Remove cards that are no longer present
  for (const [key, sprite] of cardSprites.entries()) {
    if (!activeKeys.has(key)) {
      cardsGroup.remove(sprite);
      cardSprites.delete(key);
    }
  }

  // Draw table info
  const roundLabel = textSprite(`Round ${view.round} • Shoe left ${(view.cutCardPenetration * 100).toFixed(0)}%`);
  roundLabel.position.set(0, -4.1, 0.01);
  labelsGroup.add(roundLabel);
}

function ensureCardSprite(key: string, card: Card, faceDown: boolean) {
  let sprite = cardSprites.get(key);
  const map = faceDown ? cardBackTexture : getCardTexture(card);

  if (!sprite) {
    const material = new THREE.SpriteMaterial({ map, transparent: true });
    sprite = new THREE.Sprite(material);
    sprite.scale.set(1.05, 1.45, 1);
    sprite.position.set(0, 5, 0.5);
    sprite.userData = { target: sprite.position.clone(), rotationTarget: 0 };
    cardsGroup.add(sprite);
    cardSprites.set(key, sprite);
  } else {
    const material = sprite.material as THREE.SpriteMaterial;
    material.map = map;
    material.needsUpdate = true;
  }

  sprite.userData.faceDown = faceDown;
  sprite.userData.card = card;
  return sprite;
}

function setCardTarget(sprite: THREE.Sprite, target: THREE.Vector3, rotationTarget = 0) {
  sprite.userData.target = target;
  sprite.userData.rotationTarget = rotationTarget;
}

function animateCards(dt: number) {
  const lerp = 1 - Math.pow(0.08, dt * 60);
  for (const sprite of cardSprites.values()) {
    const target: THREE.Vector3 = sprite.userData.target;
    if (target) sprite.position.lerp(target, lerp);
    const rotTarget: number = sprite.userData.rotationTarget ?? 0;
    sprite.rotation.z += (rotTarget - sprite.rotation.z) * lerp;
  }
}

function getCardTexture(card: Card) {
  const cached = cardTextureCache.get(card);
  if (cached) return cached;

  if (!textureInFlight.has(card)) {
    textureInFlight.set(card, buildCardTexture(card).then((tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      cardTextureCache.set(card, tex);
    }));
  }

  return placeholderTexture;
}

async function buildCardTexture(card: Card) {
  const base = await frontImagePromise;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(base, 0, 0, canvas.width, canvas.height);

  const rank = rankMap[card[0]];
  const suit = card[1] as Suit;
  const color = suit === 'H' || suit === 'D' ? '#c81d35' : '#111827';
  const suitChar = suitSymbol[suit];

  ctx.fillStyle = color;
  ctx.font = 'bold 92px "Segoe UI Symbol", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(rank, 46, 42);
  ctx.fillText(rank, canvas.width - 120, 42);

  ctx.font = '72px "Segoe UI Symbol", "Noto Color Emoji", sans-serif';
  ctx.fillText(suitChar, 44, 130);
  ctx.fillText(suitChar, canvas.width - 120, 130);

  ctx.font = '220px "Segoe UI Symbol", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(suitChar, canvas.width / 2, canvas.height / 2 + 10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

function createPlaceholderTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 32, 32);
  gradient.addColorStop(0, '#e6e2d7');
  gradient.addColorStop(1, '#f5f0e2');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  ctx.strokeStyle = '#c7c2b5';
  ctx.strokeRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function textSprite(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#fdfcf9';
  ctx.font = '40px Inter, "Segoe UI", sans-serif';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 6;
  ctx.strokeText(text, 12, 80);
  ctx.fillText(text, 12, 80);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(5, 1.2, 1);
  return sp;
}
