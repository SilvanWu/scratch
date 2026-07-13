import { Game } from './game';
import { Meta, HP_TRAINING_STEP, SANITY_TRAINING_STEP, RELOAD_TRAINING_MULT } from './meta';
import { AudioFX } from './audio';
import { TREASURES, RELICS } from './items';
import { THEMES } from './rooms';

// 两侧填充：程序生成砂岩象形纹理贴片（竖屏居中时左右可见）
function paintSideTexture(): void {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = '#211a10';
  g.fillRect(0, 0, 160, 320);
  // 石砖
  g.strokeStyle = 'rgba(120,100,60,0.28)';
  g.lineWidth = 2;
  for (let y = 0; y < 320; y += 64) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(160, y); g.stroke();
    const off = (y / 64) % 2 === 0 ? 0 : 80;
    for (let x = off; x <= 160; x += 160) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke();
    }
  }
  // 风化噪点
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.08})`;
    g.fillRect(Math.random() * 160, Math.random() * 320, 2, 2);
  }
  // 象形浮雕（低亮度，列状排布）
  g.strokeStyle = 'rgba(190,150,80,0.30)';
  g.fillStyle = 'rgba(190,150,80,0.22)';
  g.lineWidth = 2;
  const glyph = (x: number, y: number, kind: number): void => {
    if (kind === 0) { // 眼
      g.beginPath(); g.ellipse(x, y, 12, 6, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill();
    } else if (kind === 1) { // 安卡
      g.beginPath(); g.arc(x, y - 5, 5, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 12); g.moveTo(x - 8, y + 3); g.lineTo(x + 8, y + 3); g.stroke();
    } else if (kind === 2) { // 水波
      g.beginPath();
      for (let i = 0; i <= 6; i++) g.lineTo(x - 12 + i * 4, y + (i % 2 === 0 ? -4 : 4));
      g.stroke();
    } else if (kind === 3) { // 金字塔
      g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x - 10, y + 7); g.lineTo(x + 10, y + 7); g.closePath(); g.stroke();
    } else { // 圣甲虫
      g.beginPath(); g.ellipse(x, y, 7, 9, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x, y + 9); g.stroke();
    }
  };
  for (let row = 0; row < 5; row++) {
    glyph(40, 32 + row * 64, (row + 0) % 5);
    glyph(120, 64 + row * 64, (row + 2) % 5);
  }
  document.body.style.backgroundImage = `url(${c.toDataURL()})`;
  document.body.style.backgroundRepeat = 'repeat';
}
paintSideTexture();

const meta = new Meta();
const audio = new AudioFX();
let selectedStart = 0;

function ensureAudioStarted(): void {
  audio.startAmbient();
  audio.init();
}

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement | null;
  const button = target?.closest('button') as HTMLButtonElement | null;
  if (!button || button.disabled) return;
  ensureAudioStarted();
  audio.click();
}, true);

window.addEventListener('pointerdown', () => ensureAudioStarted(), true);
window.addEventListener('keydown', () => ensureAudioStarted(), true);

function volumeText(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function syncVolumeControls(): void {
  const pairs = [
    { slider: 'home-music-slider', label: 'home-music-val', value: audio.getMusicVolume() },
    { slider: 'pause-music-slider', label: 'pause-music-val', value: audio.getMusicVolume() },
    { slider: 'home-sfx-slider', label: 'home-sfx-val', value: audio.getSfxVolume() },
    { slider: 'pause-sfx-slider', label: 'pause-sfx-val', value: audio.getSfxVolume() },
  ];
  for (const p of pairs) {
    const slider = document.getElementById(p.slider) as HTMLInputElement | null;
    const label = document.getElementById(p.label);
    if (slider) slider.value = p.value.toFixed(2);
    if (label) label.textContent = volumeText(p.value);
  }
}

function bindVolumeSlider(id: string, kind: 'music' | 'sfx'): void {
  const slider = document.getElementById(id) as HTMLInputElement | null;
  if (!slider) return;
  slider.addEventListener('input', () => {
    const value = parseFloat(slider.value);
    if (kind === 'music') audio.setMusicVolume(value);
    else audio.setSfxVolume(value);
    syncVolumeControls();
  });
}

bindVolumeSlider('home-music-slider', 'music');
bindVolumeSlider('pause-music-slider', 'music');
bindVolumeSlider('home-sfx-slider', 'sfx');
bindVolumeSlider('pause-sfx-slider', 'sfx');

const homeSettingsBtn = document.getElementById('home-settings-btn')!;
const homeSettingsPanel = document.getElementById('home-settings-panel')!;
homeSettingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  homeSettingsPanel.classList.toggle('open');
});
homeSettingsPanel.addEventListener('click', (e) => e.stopPropagation());
syncVolumeControls();
audio.startAmbient();

function refreshBank(): void {
  document.getElementById('bank-text')!.textContent =
    `💰 金库 ${meta.data.bank} ｜ 最深 ${meta.data.bestDepth} ｜ 撤离 ${meta.data.extracts}/${meta.data.runs} ｜ 图鉴 ${meta.data.collection.length}/${TREASURES.length + RELICS.length}`;
}

// ===== 章节选择（击败BOSS解锁下一章） =====
function renderChapters(): void {
  const row = document.getElementById('chapter-row')!;
  row.innerHTML = '';
  for (let i = 0; i < THEMES.length; i++) {
    const unlocked = i <= meta.data.chaptersCleared;
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (selectedStart === i * 30 ? ' active' : '');
    btn.textContent = (unlocked ? '' : '🔒 ') + THEMES[i].name;
    if (unlocked) {
      btn.addEventListener('click', () => {
        selectedStart = i * 30;
        renderChapters();
      });
    } else {
      btn.style.opacity = '0.5';
      btn.title = '击败上一章BOSS解锁';
    }
    row.appendChild(btn);
  }
}

// ===== 军械库（策划案"养成/商业化"：金库消费改装） =====
interface ShopEntry {
  label: () => string;
  cost: () => number;
  canBuy: () => boolean;
  buy: () => void;
}

const SHOP: ShopEntry[] = [
  {
    label: () => meta.data.shotgunOwned ? '💥 霰弹枪（已解锁，Q切换）' : '💥 解锁霰弹枪：6弹丸近战清屏',
    cost: () => 300,
    canBuy: () => !meta.data.shotgunOwned,
    buy: () => { meta.data.shotgunOwned = true; },
  },
  {
    label: () => `🔫 武器伤害改装 Lv${meta.data.pistolDmgLv}/3（每级+2伤害）`,
    cost: () => 120 * (meta.data.pistolDmgLv + 1),
    canBuy: () => meta.data.pistolDmgLv < 3,
    buy: () => { meta.data.pistolDmgLv += 1; },
  },
  {
    label: () => `📦 弹夹扩容 Lv${meta.data.magLv}/2（手枪+4发）`,
    cost: () => 100 * (meta.data.magLv + 1),
    canBuy: () => meta.data.magLv < 2,
    buy: () => { meta.data.magLv += 1; },
  },
  {
    label: () => `🛡️ 护盾槽扩容 Lv${meta.data.shieldCapLv}/3（每级+1护盾上限）`,
    cost: () => 140 * (meta.data.shieldCapLv + 1),
    canBuy: () => meta.data.shieldCapLv < 3,
    buy: () => { meta.data.shieldCapLv += 1; },
  },
  {
    label: () => meta.data.assistantOwned ? '🦉 助手·夜枭（已雇佣）' : '🦉 雇佣助手·夜枭：搜索+35%/回神智/群体电击',
    cost: () => 250,
    canBuy: () => !meta.data.assistantOwned,
    buy: () => { meta.data.assistantOwned = true; },
  },
];

function renderArmory(): void {
  const panel = document.getElementById('armory-panel')!;
  panel.innerHTML = '';
  for (const entry of SHOP) {
    const row = document.createElement('div');
    row.className = 'shop-row';
    const buyable = entry.canBuy();
    row.innerHTML = `<strong>${entry.label()}</strong>`;
    const btn = document.createElement('button');
    if (buyable) {
      btn.textContent = `💰 ${entry.cost()}`;
      btn.disabled = meta.data.bank < entry.cost();
      btn.addEventListener('click', () => {
        if (meta.spend(entry.cost())) {
          entry.buy();
          meta.save();
          refreshBank();
          renderArmory();
        }
      });
    } else {
      btn.textContent = '✓';
      btn.disabled = true;
    }
    row.appendChild(btn);
    panel.appendChild(row);
  }
}

// ===== 养成（局外金币永久强化） =====
const TRAINING: ShopEntry[] = [
  {
    label: () => `❤️ 生命训练 Lv${meta.data.hpLv}/5（每级生命上限 +${HP_TRAINING_STEP}）`,
    cost: () => 90 * (meta.data.hpLv + 1),
    canBuy: () => meta.data.hpLv < 5,
    buy: () => { meta.data.hpLv += 1; },
  },
  {
    label: () => `🧠 神志训练 Lv${meta.data.sanityLv}/5（每级神志上限 +${SANITY_TRAINING_STEP}）`,
    cost: () => 80 * (meta.data.sanityLv + 1),
    canBuy: () => meta.data.sanityLv < 5,
    buy: () => { meta.data.sanityLv += 1; },
  },
  {
    label: () => {
      const pct = Math.round((1 - RELOAD_TRAINING_MULT) * 100);
      return `🔁 战术换弹 Lv${meta.data.reloadLv}/1（非手枪换弹时间 -${pct}%）`;
    },
    cost: () => 260,
    canBuy: () => meta.data.reloadLv < 1,
    buy: () => { meta.data.reloadLv = 1; },
  },
];

function renderProgression(): void {
  const panel = document.getElementById('progression-panel')!;
  panel.innerHTML = '';
  for (const entry of TRAINING) {
    const row = document.createElement('div');
    row.className = 'shop-row';
    const buyable = entry.canBuy();
    row.innerHTML = `<strong>${entry.label()}</strong>`;
    const btn = document.createElement('button');
    if (buyable) {
      btn.textContent = `💰 ${entry.cost()}`;
      btn.disabled = meta.data.bank < entry.cost();
      btn.addEventListener('click', () => {
        if (meta.spend(entry.cost())) {
          entry.buy();
          meta.save();
          refreshBank();
          renderProgression();
        }
      });
    } else {
      btn.textContent = '✓';
      btn.disabled = true;
    }
    row.appendChild(btn);
    panel.appendChild(row);
  }
}

// ===== 收藏图鉴 =====
function renderGallery(): void {
  const g = document.getElementById('gallery')!;
  g.innerHTML = '';
  const all = [
    ...TREASURES.map((t) => ({ name: t.name, icon: t.icon })),
    ...RELICS.map((r) => ({ name: r.name, icon: r.icon })),
  ];
  for (const item of all) {
    const found = meta.data.collection.includes(item.name);
    const el = document.createElement('div');
    el.className = 'g-item' + (found ? '' : ' locked');
    el.textContent = found ? item.icon : '❓';
    el.title = found ? item.name : '？？？';
    g.appendChild(el);
  }
}

// Tab切换
let tab = '';
function setTab(t: string): void {
  tab = tab === t ? '' : t;
  if (tab === 'armory') renderArmory();
  if (tab === 'progression') renderProgression();
  if (tab === 'gallery') renderGallery();
  document.getElementById('armory-panel')!.style.display = tab === 'armory' ? 'flex' : 'none';
  document.getElementById('progression-panel')!.style.display = tab === 'progression' ? 'flex' : 'none';
  document.getElementById('gallery')!.style.display = tab === 'gallery' ? 'flex' : 'none';
  document.getElementById('tab-armory')!.className = 'tab-btn' + (tab === 'armory' ? ' active' : '');
  document.getElementById('tab-progression')!.className = 'tab-btn' + (tab === 'progression' ? ' active' : '');
  document.getElementById('tab-gallery')!.className = 'tab-btn' + (tab === 'gallery' ? ' active' : '');
}
document.getElementById('tab-armory')!.addEventListener('click', () => setTab('armory'));
document.getElementById('tab-progression')!.addEventListener('click', () => setTab('progression'));
document.getElementById('tab-gallery')!.addEventListener('click', () => setTab('gallery'));

function startGame(startDepth: number): Game {
  ensureAudioStarted();
  document.getElementById('stage')!.classList.add('game-started');
  document.getElementById('start-overlay')!.style.display = 'none';
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const game = new Game(canvas, meta, audio, startDepth);
  (window as any).__tombGame = game;
  game.start();
  return game;
}

document.getElementById('start-btn')!.addEventListener('click', () => startGame(selectedStart));

const cpBtn = document.getElementById('checkpoint-btn')!;
if (meta.data.checkpoint > 0) {
  cpBtn.style.display = 'inline-block';
  cpBtn.textContent = `🏕️ 从安全屋出发（深度 ${meta.data.checkpoint}）`;
  cpBtn.addEventListener('click', () => startGame(meta.data.checkpoint));
}

refreshBank();
renderChapters();
renderArmory();
renderProgression();
renderGallery();

if (new URLSearchParams(location.search).has('choicePreview')) {
  const game = startGame(selectedStart);
  window.setTimeout(() => game.previewRouteChoicePanel(), 120);
}
