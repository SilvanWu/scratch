import { LootRarity, TreasureConfig, SpecialCollectionConfig, TREASURE_CONFIG, SPECIAL_COLLECTION_CONFIG } from './content-config';

// 物品/背包系统 —— 网格背包（塔克夫式：物品占多格，统一物品模型）
export type Rarity = LootRarity;

export const RARITY_INFO: Record<Rarity, { name: string; color: string }> = {
  common:   { name: '白色', color: '#f2f2f2' },
  uncommon: { name: '绿色', color: '#64d879' },
  rare:     { name: '蓝色', color: '#5aa0ff' },
  epic:     { name: '紫色', color: '#b46aff' },
  legend:   { name: '金色', color: '#ffd24d' },
  mythic:   { name: '红色', color: '#ff5656' },
};

export interface TreasureItem {
  name: string;
  icon: string;
  rarity: Rarity;
  value: number;
  w?: number;
  h?: number;
  weight?: number;
  description?: string;
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
  description?: string;
  stack?: number;   // 子弹数量
  ammoType?: AmmoType;  // 弹药种类
  weapon?: WeaponDef;
  equipped?: boolean;
  slot?: number;
}

export type OccupancyMatrix = (number | null)[][];

export type DragPlacementMode = 'move' | 'swap' | 'invalid';
export type DragPlacementReason = 'out-of-bounds' | 'occupied' | 'multiple-overlap' | 'swap-blocked' | 'stale-transaction';

export interface DragPlacement {
  valid: boolean;
  mode: DragPlacementMode;
  requestedCx: number;
  requestedCy: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  targetId?: number;
  reason?: DragPlacementReason;
}

interface DragSnapshot {
  item: InvItem;
  cx: number;
  cy: number;
  w: number;
  h: number;
  layoutSignature: string;
}

export interface DragCommitResult {
  committed: boolean;
  mode: DragPlacementMode;
  reason?: DragPlacementReason;
}

export interface InventoryPlacementTransaction {
  readonly width: number;
  readonly height: number;
  rotate(): boolean;
  preview(cx: number, cy: number): DragPlacement;
  commit(placement: DragPlacement): DragCommitResult;
  cancel(): void;
}

interface BackpackItemSnapshot {
  item: InvItem;
  cx: number;
  cy: number;
  w: number;
  h: number;
  equipped?: boolean;
  slot?: number;
}

export interface BackpackSnapshot {
  items: InvItem[];
  weaponSlots: (InvItem | null)[];
  itemStates: BackpackItemSnapshot[];
}

export class BackpackDragTransaction {
  private active: boolean = true;
  private readonly bag: Backpack;
  private readonly snapshot: DragSnapshot;
  private currentW: number;
  private currentH: number;

  constructor(bag: Backpack, snapshot: DragSnapshot) {
    this.bag = bag;
    this.snapshot = snapshot;
    this.currentW = snapshot.w;
    this.currentH = snapshot.h;
  }

  get width(): number { return this.currentW; }
  get height(): number { return this.currentH; }

  rotate(): boolean {
    if (!this.active || this.currentW === this.currentH) return false;
    const nextW = this.currentH;
    this.currentH = this.currentW;
    this.currentW = nextW;
    return true;
  }

  preview(cx: number, cy: number): DragPlacement {
    if (!this.active) return this.bag.invalidDragPlacement(cx, cy, this.currentW, this.currentH, 'stale-transaction');
    return this.bag.previewDragPlacement(this.snapshot, cx, cy, this.currentW, this.currentH);
  }

  commit(placement: DragPlacement): DragCommitResult {
    if (!this.active) return { committed: false, mode: 'invalid', reason: 'stale-transaction' };
    this.active = false;
    return this.bag.commitDragPlacement(this.snapshot, placement, this.currentW, this.currentH);
  }

  cancel(): void {
    this.active = false;
  }
}

export class BackpackInsertTransaction implements InventoryPlacementTransaction {
  private active: boolean = true;
  private readonly bag: Backpack;
  private readonly item: InvItem;
  private readonly layoutSignature: string;
  private currentW: number;
  private currentH: number;

  constructor(bag: Backpack, item: InvItem, layoutSignature: string) {
    this.bag = bag;
    this.item = item;
    this.layoutSignature = layoutSignature;
    this.currentW = item.w;
    this.currentH = item.h;
  }

  get width(): number { return this.currentW; }
  get height(): number { return this.currentH; }

  rotate(): boolean {
    if (!this.active || this.currentW === this.currentH) return false;
    const nextW = this.currentH;
    this.currentH = this.currentW;
    this.currentW = nextW;
    return true;
  }

  preview(cx: number, cy: number): DragPlacement {
    if (!this.active) return this.bag.invalidDragPlacement(cx, cy, this.currentW, this.currentH, 'stale-transaction');
    return this.bag.previewInsertPlacement(this.item, this.layoutSignature, cx, cy, this.currentW, this.currentH);
  }

  commit(placement: DragPlacement): DragCommitResult {
    if (!this.active) return { committed: false, mode: 'invalid', reason: 'stale-transaction' };
    this.active = false;
    return this.bag.commitInsertPlacement(
      this.item, this.layoutSignature, placement, this.currentW, this.currentH);
  }

  cancel(): void {
    this.active = false;
  }
}

export const TREASURES: TreasureConfig[] = TREASURE_CONFIG;
export const SPECIAL_COLLECTIONS: SpecialCollectionConfig[] = SPECIAL_COLLECTION_CONFIG;

// 章节圣物（BOSS掉落，解锁下一章）
export const RELICS: { name: string; icon: string; value: number }[] = [
  { name: '法老黄金圣甲', icon: '🏆', value: 600 },
  { name: '羽蛇神之心', icon: '💚', value: 800 },
  { name: '十二金人残片', icon: '🥇', value: 1000 },
];

function weightedTreasure(pool: TreasureConfig[]): TreasureConfig {
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of pool) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return pool[pool.length - 1];
}

function asTreasureItem(t: TreasureConfig): TreasureItem {
  return {
    name: t.name, icon: t.icon, rarity: t.rarity, value: t.value,
    w: t.w, h: t.h, weight: t.weight, description: t.description,
  };
}

export function rollTreasure(_depth: number): TreasureItem {
  return asTreasureItem(weightedTreasure(TREASURES));
}

export function rollTreasureOfRarity(_depth: number, rarity: Rarity): TreasureItem {
  const pool = TREASURES.filter((t) => t.rarity === rarity);
  return asTreasureItem(weightedTreasure(pool));
}

export function rollCrateRarity(_depth: number): Rarity {
  return weightedTreasure(TREASURES).rarity;
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
  const fallback = treasureCells(t.rarity);
  const w = t.w || fallback[0];
  const h = t.h || fallback[1];
  return {
    id: nextId(), kind: 'treasure', name: t.name, icon: t.icon,
    w, h, color: RARITY_INFO[t.rarity].color, cx: 0, cy: 0,
    rarity: t.rarity, value: t.value, description: t.description,
  };
}
export function makeSpecialCollectionItem(t: SpecialCollectionConfig): InvItem {
  return makeTreasureItem(asTreasureItem(t));
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

// 补给房从 PDF 的白/绿/蓝品质表抽取，避免高品质大件过早挤满背包。
export function rollSupplyContent(depth: number): InvItem {
  const pool = TREASURES.filter((item) => item.rarity === 'common' || item.rarity === 'uncommon' || item.rarity === 'rare');
  return makeTreasureItem(asTreasureItem(weightedTreasure(pool)));
}

// 宝藏房使用 PDF 全品质刷新权重。
export function rollGemContent(depth: number): InvItem {
  return makeTreasureItem(rollTreasure(depth));
}

export function rollLowQualityTreasure(depth: number): InvItem {
  const pool = TREASURES.filter((item) => item.rarity === 'common' || item.rarity === 'uncommon');
  return makeTreasureItem(asTreasureItem(weightedTreasure(pool)));
}

// 通用箱子同样使用 PDF 全表权重。
export function rollCrateContent(depth: number): InvItem {
  return makeTreasureItem(rollTreasure(depth));
}

// ===== 网格背包 =====
export class Backpack {
  readonly cols: number;
  readonly rows: number;
  items: InvItem[] = [];                          // 网格中的物品
  weaponSlots: (InvItem | null)[] = [null, null]; // 2 个武器栏
  coins: number = 0;                              // 局内金币（击杀掉落，撤离结算入金库）

  constructor(cols: number = 6, rows: number = 5) {
    this.cols = Math.max(1, Math.floor(cols));
    this.rows = Math.max(1, Math.floor(rows));
  }

  private layoutSignature(): string {
    const grid = this.items.map((item) => `${item.id}:${item.cx},${item.cy},${item.w},${item.h}`).join('|');
    const slots = this.weaponSlots.map((item) => item ? item.id : '-').join(',');
    return `${grid}#${slots}`;
  }

  createSnapshot(): BackpackSnapshot {
    const unique = new Set<InvItem>();
    for (const item of this.items) unique.add(item);
    for (const item of this.weaponSlots) if (item) unique.add(item);
    return {
      items: this.items.slice(),
      weaponSlots: this.weaponSlots.slice(),
      itemStates: [...unique].map((item) => ({
        item, cx: item.cx, cy: item.cy, w: item.w, h: item.h,
        equipped: item.equipped, slot: item.slot,
      })),
    };
  }

  restoreSnapshot(snapshot: BackpackSnapshot): void {
    for (const state of snapshot.itemStates) {
      state.item.cx = state.cx;
      state.item.cy = state.cy;
      state.item.w = state.w;
      state.item.h = state.h;
      state.item.equipped = state.equipped;
      state.item.slot = state.slot;
    }
    this.items = snapshot.items.slice();
    this.weaponSlots = snapshot.weaponSlots.slice();
  }

  createOccupancy(ignoreIds: readonly number[] = []): OccupancyMatrix {
    const ignored = new Set(ignoreIds);
    const matrix: OccupancyMatrix = Array.from({ length: this.rows }, () =>
      Array<number | null>(this.cols).fill(null));
    for (const item of this.items) {
      if (ignored.has(item.id)) continue;
      for (let y = item.cy; y < item.cy + item.h; y++) {
        for (let x = item.cx; x < item.cx + item.w; x++) {
          if (x >= 0 && y >= 0 && x < this.cols && y < this.rows) matrix[y][x] = item.id;
        }
      }
    }
    return matrix;
  }

  private isInside(cx: number, cy: number, w: number, h: number): boolean {
    return Number.isInteger(cx) && Number.isInteger(cy)
      && cx >= 0 && cy >= 0 && cx + w <= this.cols && cy + h <= this.rows;
  }

  private fitsMatrix(matrix: OccupancyMatrix, cx: number, cy: number, w: number, h: number): boolean {
    if (!this.isInside(cx, cy, w, h)) return false;
    for (let y = cy; y < cy + h; y++) {
      for (let x = cx; x < cx + w; x++) {
        if (matrix[y][x] !== null) return false;
      }
    }
    return true;
  }

  private occupy(matrix: OccupancyMatrix, id: number, cx: number, cy: number, w: number, h: number): boolean {
    if (!this.fitsMatrix(matrix, cx, cy, w, h)) return false;
    for (let y = cy; y < cy + h; y++) {
      for (let x = cx; x < cx + w; x++) matrix[y][x] = id;
    }
    return true;
  }

  private overlapIds(matrix: OccupancyMatrix, cx: number, cy: number, w: number, h: number): number[] {
    const ids = new Set<number>();
    if (!this.isInside(cx, cy, w, h)) return [];
    for (let y = cy; y < cy + h; y++) {
      for (let x = cx; x < cx + w; x++) {
        const id = matrix[y][x];
        if (id !== null) ids.add(id);
      }
    }
    return [...ids];
  }

  fits(cx: number, cy: number, w: number, h: number, ignore?: InvItem): boolean {
    return this.fitsMatrix(this.createOccupancy(ignore ? [ignore.id] : []), cx, cy, w, h);
  }

  private findFreeIn(matrix: OccupancyMatrix, w: number, h: number): { cx: number; cy: number } | null {
    for (let y = 0; y <= this.rows - h; y++) {
      for (let x = 0; x <= this.cols - w; x++) {
        if (this.fitsMatrix(matrix, x, y, w, h)) return { cx: x, cy: y };
      }
    }
    return null;
  }

  private findFree(w: number, h: number): { cx: number; cy: number } | null {
    return this.findFreeIn(this.createOccupancy(), w, h);
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
    const matrix = this.createOccupancy([item.id]);
    if (!this.fitsMatrix(matrix, cx, cy, item.w, item.h)) return false;
    item.cx = cx; item.cy = cy;
    return true;
  }

  beginDragTransaction(item: InvItem): BackpackDragTransaction | null {
    if (!this.items.includes(item)) return null;
    return new BackpackDragTransaction(this, {
      item,
      cx: item.cx,
      cy: item.cy,
      w: item.w,
      h: item.h,
      layoutSignature: this.layoutSignature(),
    });
  }

  beginInsertTransaction(item: InvItem): BackpackInsertTransaction | null {
    if (this.items.includes(item) || this.weaponSlots.includes(item)) return null;
    return new BackpackInsertTransaction(this, item, this.layoutSignature());
  }

  invalidDragPlacement(cx: number, cy: number, w: number, h: number, reason: DragPlacementReason): DragPlacement {
    return { valid: false, mode: 'invalid', requestedCx: cx, requestedCy: cy, cx, cy, w, h, reason };
  }

  previewDragPlacement(snapshot: DragSnapshot, cx: number, cy: number, w: number, h: number): DragPlacement {
    const item = snapshot.item;
    if (this.layoutSignature() !== snapshot.layoutSignature || !this.items.includes(item)
        || item.cx !== snapshot.cx || item.cy !== snapshot.cy
        || item.w !== snapshot.w || item.h !== snapshot.h) {
      return this.invalidDragPlacement(cx, cy, w, h, 'stale-transaction');
    }
    if (!this.isInside(cx, cy, w, h)) {
      return this.invalidDragPlacement(cx, cy, w, h, 'out-of-bounds');
    }

    const occupancy = this.createOccupancy([item.id]);
    const overlaps = this.overlapIds(occupancy, cx, cy, w, h);
    if (overlaps.length === 0) {
      return { valid: true, mode: 'move', requestedCx: cx, requestedCy: cy, cx, cy, w, h };
    }
    if (overlaps.length > 1) {
      return this.invalidDragPlacement(cx, cy, w, h, 'multiple-overlap');
    }

    const target = this.items.find((other) => other.id === overlaps[0]);
    if (!target) return this.invalidDragPlacement(cx, cy, w, h, 'stale-transaction');

    const swapMatrix = this.createOccupancy([item.id, target.id]);
    if (!this.occupy(swapMatrix, item.id, target.cx, target.cy, w, h)
        || !this.occupy(swapMatrix, target.id, snapshot.cx, snapshot.cy, target.w, target.h)) {
      return this.invalidDragPlacement(cx, cy, w, h, 'swap-blocked');
    }
    return {
      valid: true,
      mode: 'swap',
      requestedCx: cx,
      requestedCy: cy,
      cx: target.cx,
      cy: target.cy,
      w,
      h,
      targetId: target.id,
    };
  }

  previewInsertPlacement(item: InvItem, layoutSignature: string, cx: number, cy: number, w: number, h: number): DragPlacement {
    if (this.layoutSignature() !== layoutSignature || this.items.includes(item) || this.weaponSlots.includes(item)) {
      return this.invalidDragPlacement(cx, cy, w, h, 'stale-transaction');
    }
    if (!this.isInside(cx, cy, w, h)) {
      return this.invalidDragPlacement(cx, cy, w, h, 'out-of-bounds');
    }
    if (!this.fitsMatrix(this.createOccupancy(), cx, cy, w, h)) {
      return this.invalidDragPlacement(cx, cy, w, h, 'occupied');
    }
    return { valid: true, mode: 'move', requestedCx: cx, requestedCy: cy, cx, cy, w, h };
  }

  commitInsertPlacement(item: InvItem, layoutSignature: string, placement: DragPlacement, w: number, h: number): DragCommitResult {
    const current = this.previewInsertPlacement(
      item, layoutSignature, placement.requestedCx, placement.requestedCy, w, h);
    const samePlacement = current.valid && placement.valid
      && current.cx === placement.cx && current.cy === placement.cy
      && current.w === placement.w && current.h === placement.h;
    if (!samePlacement) {
      return { committed: false, mode: 'invalid', reason: current.reason || 'stale-transaction' };
    }
    item.cx = current.cx;
    item.cy = current.cy;
    item.w = current.w;
    item.h = current.h;
    item.equipped = false;
    item.slot = undefined;
    this.items.push(item);
    return { committed: true, mode: 'move' };
  }

  commitDragPlacement(snapshot: DragSnapshot, placement: DragPlacement, w: number, h: number): DragCommitResult {
    const current = this.previewDragPlacement(snapshot, placement.requestedCx, placement.requestedCy, w, h);
    const samePlacement = current.valid && placement.valid
      && current.mode === placement.mode
      && current.cx === placement.cx && current.cy === placement.cy
      && current.w === placement.w && current.h === placement.h
      && current.targetId === placement.targetId;
    if (!samePlacement) {
      return { committed: false, mode: 'invalid', reason: current.reason || 'stale-transaction' };
    }

    const item = snapshot.item;
    if (current.mode === 'move') {
      item.cx = current.cx;
      item.cy = current.cy;
      item.w = current.w;
      item.h = current.h;
      return { committed: true, mode: 'move' };
    }

    const target = this.items.find((other) => other.id === current.targetId);
    if (!target) return { committed: false, mode: 'invalid', reason: 'stale-transaction' };
    const targetCx = target.cx;
    const targetCy = target.cy;
    item.cx = targetCx;
    item.cy = targetCy;
    item.w = current.w;
    item.h = current.h;
    target.cx = snapshot.cx;
    target.cy = snapshot.cy;
    return { committed: true, mode: 'swap' };
  }

  // 兼容旧调用；内部统一走占格矩阵与原子拖动事务。
  moveOrSwap(item: InvItem, cx: number, cy: number): boolean {
    const transaction = this.beginDragTransaction(item);
    if (!transaction) return false;
    return transaction.commit(transaction.preview(cx, cy)).committed;
  }

  rotateItem(item: InvItem): boolean {
    if (!this.items.includes(item) || item.w === item.h) return false;
    const nextW = item.h;
    const nextH = item.w;
    if (!this.fitsMatrix(this.createOccupancy([item.id]), item.cx, item.cy, nextW, nextH)) return false;
    item.w = nextW;
    item.h = nextH;
    return true;
  }

  autoArrange(): boolean {
    const ordered = this.items.slice().sort((a, b) => {
      const areaDiff = b.w * b.h - a.w * a.h;
      if (areaDiff !== 0) return areaDiff;
      const longDiff = Math.max(b.w, b.h) - Math.max(a.w, a.h);
      if (longDiff !== 0) return longDiff;
      const shortDiff = Math.min(b.w, b.h) - Math.min(a.w, a.h);
      return shortDiff !== 0 ? shortDiff : a.id - b.id;
    });
    const placements = new Map<number, { cx: number; cy: number; w: number; h: number }>();
    const failed = new Set<string>();

    const placementMask = (cx: number, cy: number, w: number, h: number): bigint => {
      let mask = 0n;
      for (let y = cy; y < cy + h; y++) {
        for (let x = cx; x < cx + w; x++) mask |= 1n << BigInt(y * this.cols + x);
      }
      return mask;
    };

    const solve = (index: number, occupied: bigint): boolean => {
      if (index >= ordered.length) return true;
      const memoKey = `${index}:${occupied.toString()}`;
      if (failed.has(memoKey)) return false;
      const item = ordered[index];
      const wide = Math.max(item.w, item.h);
      const narrow = Math.min(item.w, item.h);
      const orientations = wide === narrow
        ? [{ w: wide, h: narrow }]
        : [{ w: wide, h: narrow }, { w: narrow, h: wide }];
      for (const orientation of orientations) {
        for (let y = 0; y <= this.rows - orientation.h; y++) {
          for (let x = 0; x <= this.cols - orientation.w; x++) {
            const mask = placementMask(x, y, orientation.w, orientation.h);
            if ((occupied & mask) !== 0n) continue;
            placements.set(item.id, { cx: x, cy: y, w: orientation.w, h: orientation.h });
            if (solve(index + 1, occupied | mask)) return true;
            placements.delete(item.id);
          }
        }
      }
      failed.add(memoKey);
      return false;
    };

    if (!solve(0, 0n)) return false;
    for (const item of this.items) {
      const placement = placements.get(item.id);
      if (!placement) return false;
    }
    for (const item of this.items) {
      const placement = placements.get(item.id)!;
      item.cx = placement.cx;
      item.cy = placement.cy;
      item.w = placement.w;
      item.h = placement.h;
    }
    return true;
  }

  // 把网格中的武器装入武器栏（slot）
  equipToSlot(id: number, slot: number): boolean {
    if (slot < 0 || slot >= this.weaponSlots.length) return false;
    const item = this.items.find((i) => i.id === id);
    if (!item || item.kind !== 'weapon') return false;
    const prev = this.weaponSlots[slot];
    const nextItems = this.items.filter((entry) => entry !== item);
    let prevSpot: { cx: number; cy: number } | null = null;
    if (prev) {
      const matrix = this.createOccupancy([item.id]);
      prevSpot = this.findFreeIn(matrix, prev.w, prev.h);
      if (!prevSpot) return false;
      nextItems.push(prev);
    }
    this.items = nextItems;
    if (prev && prevSpot) {
      prev.cx = prevSpot.cx; prev.cy = prevSpot.cy;
      prev.equipped = false; prev.slot = undefined;
    }
    this.weaponSlots[slot] = item;
    item.equipped = true; item.slot = slot;
    return true;
  }

  // 从武器栏卸回网格
  unequip(slot: number): boolean {
    if (slot < 0 || slot >= this.weaponSlots.length) return false;
    const w = this.weaponSlots[slot];
    if (!w) return false;
    const spot = this.findFree(w.w, w.h);
    if (!spot) return false;
    w.cx = spot.cx; w.cy = spot.cy;
    w.equipped = false; w.slot = undefined;
    this.items.push(w);
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
