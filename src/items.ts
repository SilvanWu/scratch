// 物品/背包系统 —— 网格背包（塔克夫式：物品占多格，统一物品模型）
export type Rarity = 'common' | 'rare' | 'epic' | 'legend';

export const RARITY_INFO: Record<Rarity, { name: string; color: string }> = {
  common: { name: '普通', color: '#cfcfcf' },
  rare:   { name: '稀有', color: '#5aa0ff' },
  epic:   { name: '史诗', color: '#b46aff' },
  legend: { name: '传说', color: '#ffd24d' },
};

export interface TreasureItem {
  name: string;
  icon: string;
  rarity: Rarity;
  value: number;
}

// 武器定义（可携带两把，装入背包武器栏后生效）
export interface WeaponDef {
  name: string;
  icon: string;
  damage: number;
  magSize: number;
  reloadTime: number;
  fireInterval: number;
  pellets: number;
  spread: number;
  cellsW: number;   // 背包占格宽
  cellsH: number;   // 背包占格高
  ammoType: AmmoType;  // 消耗的弹药种类
}

// 弹药种类（不同武器消耗不同弹药）
export type AmmoType = 'pistol' | 'rifle' | 'shell';
export const AMMO_INFO: Record<AmmoType, { name: string; icon: string; color: string }> = {
  pistol: { name: '手枪弹', icon: '🔸', color: '#caa46a' },
  rifle:  { name: '步枪弹', icon: '🔹', color: '#9ab0d0' },
  shell:  { name: '霰弹',   icon: '🔴', color: '#d0866a' },
};

export type ItemKind = 'weapon' | 'ammo' | 'treasure' | 'med' | 'sedative' | 'grenade' | 'horus' | 'expired' | 'osiris' | 'mummy' | 'honey' | 'adren';

// 背包中的统一物品实例
export interface InvItem {
  id: number;
  kind: ItemKind;
  name: string;
  icon: string;
  w: number;        // 占格宽
  h: number;        // 占格高
  color: string;    // 边框/高亮色（=品质或类别色）
  cx: number;       // 左上格 x（网格内）
  cy: number;       // 左上格 y
  // 类型相关
  rarity?: Rarity;
  value?: number;   // 宝物售价
  stack?: number;   // 子弹数量
  ammoType?: AmmoType;  // 弹药种类
  weapon?: WeaponDef;
  equipped?: boolean;
  slot?: number;
}

export const TREASURES: { name: string; icon: string; rarity: Rarity; base: number }[] = [
  { name: '青铜短剑', icon: '🗡️', rarity: 'common', base: 12 },
  { name: '陶土小像', icon: '🗿', rarity: 'common', base: 16 },
  { name: '褪色壁画残片', icon: '🧱', rarity: 'common', base: 14 },
  { name: '青玉佩', icon: '🟢', rarity: 'rare', base: 42 },
  { name: '银质香炉', icon: '🏺', rarity: 'rare', base: 55 },
  { name: '象牙骨笛', icon: '🦴', rarity: 'rare', base: 48 },
  { name: '黄金面具', icon: '👺', rarity: 'epic', base: 120 },
  { name: '翡翠圣甲虫', icon: '🪲', rarity: 'epic', base: 140 },
  { name: '法老权杖', icon: '🪄', rarity: 'legend', base: 300 },
  { name: '失落王冠', icon: '👑', rarity: 'legend', base: 360 },
];

// 章节圣物（BOSS掉落，解锁下一章）
export const RELICS: { name: string; icon: string; value: number }[] = [
  { name: '法老黄金圣甲', icon: '🏆', value: 600 },
  { name: '羽蛇神之心', icon: '💚', value: 800 },
  { name: '十二金人残片', icon: '🥇', value: 1000 },
];

export function rollTreasure(depth: number): TreasureItem {
  const r = Math.random();
  const legendP = Math.min(0.1, 0.01 + depth * 0.004);
  const epicP = Math.min(0.24, 0.06 + depth * 0.008);
  const rareP = Math.min(0.42, 0.22 + depth * 0.008);
  let rarity: Rarity = 'common';
  if (r < legendP) rarity = 'legend';
  else if (r < legendP + epicP) rarity = 'epic';
  else if (r < legendP + epicP + rareP) rarity = 'rare';
  const pool = TREASURES.filter((t) => t.rarity === rarity);
  const t = pool[Math.floor(Math.random() * pool.length)];
  const value = Math.round(t.base * (1 + depth * 0.06) * (0.85 + Math.random() * 0.3));
  return { name: t.name, icon: t.icon, rarity: t.rarity, value };
}

export function rollTreasureOfRarity(depth: number, rarity: Rarity): TreasureItem {
  const pool = TREASURES.filter((t) => t.rarity === rarity);
  const t = pool[Math.floor(Math.random() * pool.length)];
  const value = Math.round(t.base * (1 + depth * 0.06) * (0.85 + Math.random() * 0.3));
  return { name: t.name, icon: t.icon, rarity, value };
}

export function rollCrateRarity(depth: number): Rarity {
  const r = Math.random();
  const legendP = Math.min(0.08, 0.005 + depth * 0.003);
  const epicP = Math.min(0.20, 0.04 + depth * 0.006);
  const rareP = Math.min(0.40, 0.20 + depth * 0.006);
  if (r < legendP) return 'legend';
  if (r < legendP + epicP) return 'epic';
  if (r < legendP + epicP + rareP) return 'rare';
  return 'common';
}

export type ConsumableKind = 'med' | 'sedative' | 'grenade' | 'horus' | 'expired' | 'osiris' | 'mummy' | 'honey' | 'adren';

// hp/san：使用后的生命/神智变化（可为负）；special：特殊行为
export const CONSUMABLE_INFO: Record<ConsumableKind, { name: string; icon: string; key: string; cap: number; desc: string; color: string; hp: number; san: number; special?: 'grenade' | 'adren' }> = {
  med:      { name: '医疗包',       icon: '🩹', key: '1', cap: 9, desc: '生命 +35',          color: '#e8504d', hp: 35,  san: 0 },
  sedative: { name: '镇静剂',       icon: '💊', key: '2', cap: 9, desc: '神智 +15',          color: '#7d9bff', hp: 0,   san: 15 },
  grenade:  { name: '手雷',         icon: '💣', key: '3', cap: 9, desc: '范围爆炸',          color: '#cfa14d', hp: 0,   san: 0, special: 'grenade' },
  horus:    { name: '荷鲁斯之泪',   icon: '💧', key: '', cap: 9, desc: '理智+45，生命-30',   color: '#66ccff', hp: -30, san: 45 },
  expired:  { name: '过期镇定剂',   icon: '🧪', key: '', cap: 9, desc: '理智+15，生命-5',    color: '#9aa6cc', hp: -5,  san: 15 },
  osiris:   { name: '奥西里斯之脂', icon: '🫙', key: '', cap: 9, desc: '生命+35，理智-20',   color: '#e89a4d', hp: 35,  san: -20 },
  mummy:    { name: '木乃伊绷带',   icon: '🧻', key: '', cap: 9, desc: '生命+30，理智-10',   color: '#d8cfb8', hp: 30,  san: -10 },
  honey:    { name: '野蜂蜜',       icon: '🍯', key: '', cap: 9, desc: '理智+15，生命+10',   color: '#ffc04d', hp: 10,  san: 15 },
  adren:    { name: '肾上腺素',     icon: '💉', key: '', cap: 9, desc: '血量/理智临时+30，之后3房间各-10', color: '#ff5c8a', hp: 30, san: 30, special: 'adren' },
};

// ===== 物品工厂 =====
let _nextId = 1;
function nextId(): number { return _nextId++; }

function treasureCells(r: Rarity): [number, number] {
  if (r === 'legend') return [2, 2];
  if (r === 'epic') return [2, 1];
  return [1, 1];
}

export function makeTreasureItem(t: TreasureItem): InvItem {
  const [w, h] = treasureCells(t.rarity);
  return {
    id: nextId(), kind: 'treasure', name: t.name, icon: t.icon,
    w, h, color: RARITY_INFO[t.rarity].color, cx: 0, cy: 0,
    rarity: t.rarity, value: t.value,
  };
}
export function makeConsumableItem(kind: ConsumableKind): InvItem {
  const info = CONSUMABLE_INFO[kind];
  return {
    id: nextId(), kind, name: info.name, icon: info.icon,
    w: 1, h: 1, color: info.color, cx: 0, cy: 0,
  };
}
export function makeAmmoItem(count: number, type: AmmoType = 'pistol'): InvItem {
  const info = AMMO_INFO[type];
  return {
    id: nextId(), kind: 'ammo', name: info.name, icon: info.icon,
    w: 1, h: 1, color: info.color, cx: 0, cy: 0, stack: count, ammoType: type,
  };
}
export function makeWeaponItem(def: WeaponDef): InvItem {
  return {
    id: nextId(), kind: 'weapon', name: def.name, icon: def.icon,
    w: def.cellsW, h: def.cellsH, color: '#9aa6bd', cx: 0, cy: 0, weapon: def,
  };
}

// 随机一种药品类消耗品（不含手雷）
const MED_CONSUMABLES: ConsumableKind[] = ['med', 'sedative', 'horus', 'expired', 'osiris', 'mummy', 'honey', 'adren'];
export function randomMedConsumable(): ConsumableKind {
  return MED_CONSUMABLES[Math.floor(Math.random() * MED_CONSUMABLES.length)];
}

// 补给房箱内容：药品 / 步枪弹（手枪弹无限，不再掉落）
export function rollSupplyContent(depth: number): InvItem {
  const r = Math.random();
  if (r < 0.6) return makeConsumableItem(randomMedConsumable());
  return makeAmmoItem(30, 'rifle');
}

// 宝石房箱内容：宝藏（按品质）
export function rollGemContent(depth: number): InvItem {
  return makeTreasureItem(rollTreasureOfRarity(depth, rollCrateRarity(depth)));
}

// 箱子预定内容（颜色=物品色，搜满即得该物品）
export function rollCrateContent(depth: number): InvItem {
  const r = Math.random();
  if (r < 0.18) {
    return makeConsumableItem(Math.random() < 0.2 ? 'grenade' : randomMedConsumable());
  }
  if (r < 0.32) {
    return makeAmmoItem(30, 'rifle');
  }
  const rarity = rollCrateRarity(depth);
  return makeTreasureItem(rollTreasureOfRarity(depth, rarity));
}

// ===== 网格背包 =====
export class Backpack {
  readonly cols: number = 6;
  readonly rows: number = 5;
  items: InvItem[] = [];                          // 网格中的物品
  weaponSlots: (InvItem | null)[] = [null, null]; // 2 个武器栏
  coins: number = 0;                              // 局内金币（击杀掉落，撤离结算入金库）

  private overlap(ax: number, ay: number, aw: number, ah: number, b: InvItem): boolean {
    return ax < b.cx + b.w && ax + aw > b.cx && ay < b.cy + b.h && ay + ah > b.cy;
  }

  fits(cx: number, cy: number, w: number, h: number, ignore?: InvItem): boolean {
    if (cx < 0 || cy < 0 || cx + w > this.cols || cy + h > this.rows) return false;
    for (const it of this.items) {
      if (it === ignore) continue;
      if (this.overlap(cx, cy, w, h, it)) return false;
    }
    return true;
  }

  private findFree(w: number, h: number): { cx: number; cy: number } | null {
    for (let y = 0; y <= this.rows - h; y++) {
      for (let x = 0; x <= this.cols - w; x++) {
        if (this.fits(x, y, w, h)) return { cx: x, cy: y };
      }
    }
    return null;
  }

  // 子弹优先合并到同类型已有堆叠
  addItem(item: InvItem): boolean {
    if (item.kind === 'ammo') {
      const stackEx = this.items.find((i) => i.kind === 'ammo' && i.ammoType === item.ammoType);
      if (stackEx) { stackEx.stack = (stackEx.stack || 0) + (item.stack || 0); return true; }
    }
    const spot = this.findFree(item.w, item.h);
    if (!spot) return false;
    item.cx = spot.cx; item.cy = spot.cy; item.equipped = false; item.slot = undefined;
    this.items.push(item);
    return true;
  }

  removeItem(item: InvItem): void {
    this.items = this.items.filter((i) => i !== item);
  }
  removeById(id: number): InvItem | null {
    const it = this.items.find((i) => i.id === id) || null;
    if (it) this.removeItem(it);
    return it;
  }
  byId(id: number): InvItem | null {
    return this.items.find((i) => i.id === id)
      || this.weaponSlots.find((w) => w && w.id === id) || null;
  }

  moveItem(item: InvItem, cx: number, cy: number): boolean {
    if (!this.fits(cx, cy, item.w, item.h, item)) return false;
    item.cx = cx; item.cy = cy;
    return true;
  }

  private fitsExcept(cx: number, cy: number, w: number, h: number, ignores: InvItem[]): boolean {
    if (cx < 0 || cy < 0 || cx + w > this.cols || cy + h > this.rows) return false;
    for (const it of this.items) {
      if (ignores.indexOf(it) >= 0) continue;
      if (this.overlap(cx, cy, w, h, it)) return false;
    }
    return true;
  }

  // 移动到目标格；若目标处恰好压住另一个物品则与之“位置调换”
  moveOrSwap(item: InvItem, cx: number, cy: number): boolean {
    if (this.fits(cx, cy, item.w, item.h, item)) {
      item.cx = cx; item.cy = cy; return true;
    }
    const overlapping = this.items.filter((o) => o !== item && this.overlap(cx, cy, item.w, item.h, o));
    if (overlapping.length === 1) {
      const b = overlapping[0];
      const ax = item.cx, ay = item.cy;
      // item → b 的格子；b → item 原格子（互不冲突时才交换）
      if (this.fitsExcept(b.cx, b.cy, item.w, item.h, [item, b]) &&
          this.fitsExcept(ax, ay, b.w, b.h, [item, b])) {
        const bx = b.cx, by = b.cy;
        item.cx = bx; item.cy = by;
        b.cx = ax; b.cy = ay;
        return true;
      }
    }
    return false;
  }

  // 把网格中的武器装入武器栏（slot）
  equipToSlot(id: number, slot: number): boolean {
    const item = this.items.find((i) => i.id === id);
    if (!item || item.kind !== 'weapon') return false;
    const prev = this.weaponSlots[slot];
    this.removeItem(item);
    if (prev) {
      prev.equipped = false; prev.slot = undefined;
      if (!this.addItem(prev)) {            // 放不下则回滚
        this.addItem(item);
        this.weaponSlots[slot] = prev; prev.equipped = true; prev.slot = slot;
        return false;
      }
    }
    this.weaponSlots[slot] = item; item.equipped = true; item.slot = slot;
    return true;
  }

  // 从武器栏卸回网格
  unequip(slot: number): boolean {
    const w = this.weaponSlots[slot];
    if (!w) return false;
    if (!this.addItem(w)) return false;
    w.equipped = false; w.slot = undefined;
    this.weaponSlots[slot] = null;
    return true;
  }

  equippedWeaponDefs(): WeaponDef[] {
    const out: WeaponDef[] = [];
    for (const s of this.weaponSlots) if (s && s.weapon) out.push(s.weapon);
    return out;
  }

  // ===== 经济/计数 =====
  get totalValue(): number {
    return this.items.reduce((s, i) => s + (i.kind === 'treasure' ? (i.value || 0) : 0), 0);
  }
  countKind(kind: ItemKind): number {
    return this.items.filter((i) => i.kind === kind).length;
  }
  get bullets(): number {
    return this.items.reduce((s, i) => s + (i.kind === 'ammo' ? (i.stack || 0) : 0), 0);
  }
  // 按弹药种类计数/补充/消耗
  bulletsOf(type: AmmoType): number {
    return this.items.reduce((s, i) => s + (i.kind === 'ammo' && i.ammoType === type ? (i.stack || 0) : 0), 0);
  }
  addBulletsOf(type: AmmoType, n: number): void {
    const ex = this.items.find((i) => i.kind === 'ammo' && i.ammoType === type);
    if (ex) { ex.stack = (ex.stack || 0) + n; return; }
    this.addItem(makeAmmoItem(n, type));
  }
  takeBulletsOf(type: AmmoType, n: number): number {
    let need = n;
    for (const it of this.items) {
      if (it.kind !== 'ammo' || it.ammoType !== type || need <= 0) continue;
      const take = Math.min(it.stack || 0, need);
      it.stack = (it.stack || 0) - take;
      need -= take;
    }
    this.items = this.items.filter((i) => !(i.kind === 'ammo' && (i.stack || 0) <= 0));
    return n - need;
  }

  addBullets(n: number): void {
    const ex = this.items.find((i) => i.kind === 'ammo');
    if (ex) { ex.stack = (ex.stack || 0) + n; return; }
    this.addItem(makeAmmoItem(n));
  }
  takeBullets(n: number): number {
    let need = n;
    for (const it of this.items) {
      if (it.kind !== 'ammo' || need <= 0) continue;
      const take = Math.min(it.stack || 0, need);
      it.stack = (it.stack || 0) - take;
      need -= take;
    }
    // 清掉空堆叠
    this.items = this.items.filter((i) => !(i.kind === 'ammo' && (i.stack || 0) <= 0));
    return n - need;
  }

  addConsumable(kind: ConsumableKind): boolean {
    return this.addItem(makeConsumableItem(kind));
  }
  useConsumable(kind: ConsumableKind): boolean {
    const it = this.items.find((i) => i.kind === kind);
    if (!it) return false;
    this.removeItem(it);
    return true;
  }
}
