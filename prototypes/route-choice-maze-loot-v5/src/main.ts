import { Game } from './game';
import { Meta, BACKPACK_UPGRADES, HP_TRAINING_STEP, SANITY_TRAINING_STEP, WEAPON_CALIBRATION_STEP, backpackUpgradeUnlocked, trainingChapterCap } from './meta';
import { AudioFX } from './audio';
import { TREASURES, SPECIAL_COLLECTIONS, RELICS, RARITY_INFO } from './items';
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
let selectedMapMode: 'progression' | 'fog' | 'full' = 'progression';
let activeGame: Game | null = null;

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

const devMapOverlay = document.getElementById('dev-map-overlay')!;
const devMapButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-dev-map-mode]'));

function syncDeveloperMapMenu(): void {
  for (const button of devMapButtons) {
    button.classList.toggle('active', button.dataset.devMapMode === selectedMapMode);
  }
  const status = document.getElementById('dev-map-status')!;
  status.textContent = selectedMapMode === 'full'
    ? '当前：旧版全解锁地图与房间类型'
    : selectedMapMode === 'fog'
      ? '当前：忽略存档，强制使用战争迷雾'
      : '当前：首次迷雾 / 通关后隐藏未探索房型';
}

function setDeveloperMapMenuOpen(open: boolean): void {
  devMapOverlay.style.display = open ? 'flex' : 'none';
  activeGame?.setDeveloperModalOpen(open);
}

for (const button of devMapButtons) {
  button.addEventListener('click', () => {
    selectedMapMode = button.dataset.devMapMode === 'full'
      ? 'full'
      : button.dataset.devMapMode === 'fog' ? 'fog' : 'progression';
    activeGame?.setMapVisibilityMode(selectedMapMode);
    syncDeveloperMapMenu();
  });
}
document.getElementById('dev-map-close')!.addEventListener('click', () => setDeveloperMapMenuOpen(false));
window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote' && !e.repeat) {
    e.preventDefault();
    e.stopImmediatePropagation();
    setDeveloperMapMenuOpen(devMapOverlay.style.display !== 'flex');
    return;
  }
  if (e.key === 'Escape' && devMapOverlay.style.display === 'flex') {
    e.preventDefault();
    e.stopImmediatePropagation();
    setDeveloperMapMenuOpen(false);
  }
}, true);
syncDeveloperMapMenu();

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
  const collectionCatalog = [
    ...TREASURES.filter((item) => item.rarity === 'legend' || item.rarity === 'mythic').map((item) => item.name),
    ...SPECIAL_COLLECTIONS.map((item) => item.name),
    ...RELICS.map((item) => item.name),
  ];
  const collectionFound = collectionCatalog.filter((name) => meta.data.collection.includes(name)).length;
  document.getElementById('bank-text')!.textContent =
    `💰 金库金币 ${meta.data.bank} ｜ ◈ 遗迹印记 ${meta.data.relicMarks} ｜ 最深 ${meta.data.bestDepth} ｜ 撤离 ${meta.data.extracts}/${meta.data.runs} ｜ 收藏 ${collectionFound}/${collectionCatalog.length}`;
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
    label: () => `📦 弹夹扩容 Lv${meta.data.magLv}/2（手枪+4发）`,
    cost: () => 100 * (meta.data.magLv + 1),
    canBuy: () => meta.data.magLv < 2,
    buy: () => { meta.data.magLv += 1; },
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

// ===== 养成（章节封顶 + 双资源背包扩展） =====
interface TrainingEntry {
  label: () => string;
  level: () => number;
  maxLevel: number;
  cost: () => number;
  buy: () => void;
}

const RELOAD_COSTS = [800, 1600, 3200, 6400, 12000];
const SHIELD_COSTS = [1200, 2200, 4000, 7200, 13000];

const TRAINING: TrainingEntry[] = [
  {
    label: () => `❤️ 生命训练 Lv${meta.data.hpLv}/10（每级最大生命 +${HP_TRAINING_STEP}）`,
    level: () => meta.data.hpLv,
    maxLevel: 10,
    cost: () => Math.round(250 * Math.pow(1.5, meta.data.hpLv)),
    buy: () => { meta.data.hpLv += 1; },
  },
  {
    label: () => `🧠 神志训练 Lv${meta.data.sanityLv}/10（每级最大理智 +${SANITY_TRAINING_STEP}）`,
    level: () => meta.data.sanityLv,
    maxLevel: 10,
    cost: () => Math.round(220 * Math.pow(1.5, meta.data.sanityLv)),
    buy: () => { meta.data.sanityLv += 1; },
  },
  {
    label: () => `🎯 武器校准 Lv${meta.data.weaponCalibrationLv}/8（每级武器伤害 +${Math.round(WEAPON_CALIBRATION_STEP * 100)}%）`,
    level: () => meta.data.weaponCalibrationLv,
    maxLevel: 8,
    cost: () => Math.round(400 * Math.pow(1.55, meta.data.weaponCalibrationLv)),
    buy: () => { meta.data.weaponCalibrationLv += 1; },
  },
  {
    label: () => `🔁 换弹训练 Lv${meta.data.reloadLv}/5（每级非手枪换弹 -4%）`,
    level: () => meta.data.reloadLv,
    maxLevel: 5,
    cost: () => RELOAD_COSTS[meta.data.reloadLv] || RELOAD_COSTS[RELOAD_COSTS.length - 1],
    buy: () => { meta.data.reloadLv += 1; },
  },
  {
    label: () => `🛡️ 护盾扩容 Lv${meta.data.shieldCapLv}/5（每级 +1 护盾槽）`,
    level: () => meta.data.shieldCapLv,
    maxLevel: 5,
    cost: () => SHIELD_COSTS[meta.data.shieldCapLv] || SHIELD_COSTS[SHIELD_COSTS.length - 1],
    buy: () => { meta.data.shieldCapLv += 1; },
  },
];

function renderProgression(): void {
  const panel = document.getElementById('progression-panel')!;
  panel.innerHTML = '';

  const backpackRow = document.createElement('div');
  backpackRow.className = 'shop-row';
  const currentBackpack = BACKPACK_UPGRADES[meta.data.backpackLv] || BACKPACK_UPGRADES[0];
  const nextBackpack = BACKPACK_UPGRADES[meta.data.backpackLv + 1];
  backpackRow.innerHTML = `<strong>🎒 背包扩展 Lv${currentBackpack.level}/4（${currentBackpack.cols}×${currentBackpack.rows}，${currentBackpack.cols * currentBackpack.rows}格）</strong>`;
  const backpackBtn = document.createElement('button');
  if (!nextBackpack) {
    backpackBtn.textContent = '✓ 已满';
    backpackBtn.disabled = true;
  } else if (!backpackUpgradeUnlocked(meta.data, nextBackpack.level)) {
    backpackBtn.textContent = `🔒 ${nextBackpack.unlockLabel}`;
    backpackBtn.disabled = true;
  } else {
    backpackBtn.textContent = `💰 ${nextBackpack.coinCost}  ◈ ${nextBackpack.markCost}`;
    backpackBtn.disabled = meta.data.bank < nextBackpack.coinCost || meta.data.relicMarks < nextBackpack.markCost;
    backpackBtn.addEventListener('click', () => {
      if (meta.spendResources(nextBackpack.coinCost, nextBackpack.markCost)) {
        meta.data.backpackLv = nextBackpack.level;
        meta.save();
        refreshBank();
        renderProgression();
      }
    });
  }
  backpackRow.appendChild(backpackBtn);
  panel.appendChild(backpackRow);

  const chapterCap = trainingChapterCap(meta.data.chaptersCleared);
  for (const entry of TRAINING) {
    const row = document.createElement('div');
    row.className = 'shop-row';
    const level = entry.level();
    const availableCap = Math.min(entry.maxLevel, chapterCap);
    row.innerHTML = `<strong>${entry.label()}</strong>`;
    const btn = document.createElement('button');
    if (level >= entry.maxLevel) {
      btn.textContent = '✓ 已满';
      btn.disabled = true;
    } else if (level >= availableCap) {
      btn.textContent = meta.data.chaptersCleared < 1 ? '🔒 击败第一章 BOSS' : '🔒 击败第二章 BOSS';
      btn.disabled = true;
    } else {
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
    }
    row.appendChild(btn);
    panel.appendChild(row);
  }
}

// ===== 收藏图鉴：普通高品质收藏 / 章节遗物 =====
let galleryPage: 'ordinary' | 'relics' = 'ordinary';

function renderGallery(): void {
  const g = document.getElementById('gallery')!;
  g.innerHTML = '';

  const ordinary = [
    ...TREASURES.filter((item) => item.rarity === 'legend' || item.rarity === 'mythic'),
    ...SPECIAL_COLLECTIONS,
  ];
  const relics = RELICS.map((item, index) => ({
    ...item,
    rarity: 'legend' as const,
    description: `第 ${index + 1} 章 BOSS 遗物`,
    sourceHint: `首次击败第 ${index + 1} 章 BOSS 后带出`,
  }));
  const ordinaryFound = ordinary.filter((item) => meta.data.collection.includes(item.name)).length;
  const relicFound = relics.filter((item) => meta.data.collection.includes(item.name)).length;

  const tabs = document.createElement('div');
  tabs.className = 'gallery-tabs';
  const addTab = (page: 'ordinary' | 'relics', label: string) => {
    const button = document.createElement('button');
    button.className = `gallery-tab${galleryPage === page ? ' active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => { galleryPage = page; renderGallery(); });
    tabs.appendChild(button);
  };
  addTab('ordinary', `普通收藏 ${ordinaryFound}/20`);
  addTab('relics', `章节遗物 ${relicFound}/${relics.length}`);
  g.appendChild(tabs);

  const grid = document.createElement('div');
  grid.className = 'gallery-grid';
  const items = galleryPage === 'ordinary' ? ordinary : relics;
  for (const item of items) {
    const found = meta.data.collection.includes(item.name);
    const el = document.createElement('div');
    el.className = 'g-item' + (found ? '' : ' locked');
    el.style.borderColor = RARITY_INFO[item.rarity].color;
    el.textContent = found ? item.icon : '❓';
    const source = 'sourceHint' in item ? item.sourceHint : '';
    el.title = found
      ? `${item.name}${source ? ` · ${source}` : ''}`
      : `？？？${source ? ` · ${source}` : ''}`;
    grid.appendChild(el);
  }
  g.appendChild(grid);
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
  const game = new Game(canvas, meta, audio, startDepth, selectedMapMode);
  activeGame = game;
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
