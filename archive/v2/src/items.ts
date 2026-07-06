// 物品/背包系统（策划案"背包与容量管理"：总空间 + 消耗品独立槽）
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

const TREASURES: { name: string; icon: string; rarity: Rarity; base: number }[] = [
  { name: '古旧铜币', icon: '🪙', rarity: 'common', base: 12 },
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

export function rollTreasure(depth: number): TreasureItem {
  // 深度越深，高品质权重越大
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

export type ConsumableKind = 'med' | 'sedative' | 'grenade';

export const CONSUMABLE_INFO: Record<ConsumableKind, { name: string; icon: string; key: string; cap: number; desc: string }> = {
  med:      { name: '医疗包', icon: '🩹', key: '1', cap: 3, desc: '+35 生命' },
  sedative: { name: '镇静剂', icon: '💊', key: '2', cap: 2, desc: '+15 神智' },
  grenade:  { name: '手雷',   icon: '💣', key: '3', cap: 3, desc: '范围爆炸' },
};

export class Backpack {
  readonly cap: number = 8;
  items: TreasureItem[] = [];
  consumables: Record<ConsumableKind, number> = { med: 1, sedative: 0, grenade: 1 };

  get totalValue(): number {
    return this.items.reduce((s, i) => s + i.value, 0);
  }

  get isFull(): boolean {
    return this.items.length >= this.cap;
  }

  add(item: TreasureItem): boolean {
    if (this.isFull) return false;
    this.items.push(item);
    return true;
  }

  lowestItem(): TreasureItem | null {
    if (this.items.length === 0) return null;
    return this.items.reduce((a, b) => (a.value <= b.value ? a : b));
  }

  // 丢掉最低价值物品换新（返回被丢的物品）
  replaceLowest(item: TreasureItem): TreasureItem | null {
    const low = this.lowestItem();
    if (!low) return null;
    this.items.splice(this.items.indexOf(low), 1);
    this.items.push(item);
    return low;
  }

  addConsumable(kind: ConsumableKind): boolean {
    if (this.consumables[kind] >= CONSUMABLE_INFO[kind].cap) return false;
    this.consumables[kind] += 1;
    return true;
  }

  useConsumable(kind: ConsumableKind): boolean {
    if (this.consumables[kind] <= 0) return false;
    this.consumables[kind] -= 1;
    return true;
  }
}

// 搜索掉落：宝物 / 消耗品 / 强化弹药
export type SearchDrop =
  | { kind: 'treasure'; item: TreasureItem }
  | { kind: 'consumable'; con: ConsumableKind }
  | { kind: 'ammo' };

export function rollSearchDrop(depth: number): SearchDrop {
  const r = Math.random();
  if (r < 0.55) return { kind: 'treasure', item: rollTreasure(depth) };
  if (r < 0.85) {
    const r2 = Math.random();
    const con: ConsumableKind = r2 < 0.45 ? 'med' : r2 < 0.7 ? 'sedative' : 'grenade';
    return { kind: 'consumable', con };
  }
  return { kind: 'ammo' };
}
