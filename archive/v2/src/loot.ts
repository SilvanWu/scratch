// 战利品表：搜索/击杀产出
export interface LootResult {
  name: string;
  icon: string;
  coins: number;   // 价值（结算金币）
  hp: number;      // 立即回血
  sanity: number;  // 立即回神智
  ammoBoost: boolean; // 强化弹药（本局伤害+10%）
}

export function rollLoot(depth: number): LootResult {
  const r = Math.random();
  const mult = 1 + depth * 0.15;
  if (r < 0.34) {
    const c = Math.round((8 + Math.random() * 12) * mult);
    return { name: `金币 ×${c}`, icon: '🪙', coins: c, hp: 0, sanity: 0, ammoBoost: false };
  }
  if (r < 0.52) {
    return { name: '医疗包 +30HP', icon: '🩹', coins: 0, hp: 30, sanity: 0, ammoBoost: false };
  }
  if (r < 0.68) {
    return { name: '镇静剂 +12神智', icon: '💊', coins: 0, hp: 0, sanity: 12, ammoBoost: false };
  }
  if (r < 0.82) {
    return { name: '强化弹药 伤害+10%', icon: '🔫', coins: 0, hp: 0, sanity: 0, ammoBoost: true };
  }
  if (r < 0.95) {
    const c = Math.round((25 + Math.random() * 25) * mult);
    return { name: `古代饰品 价值${c}`, icon: '🏺', coins: c, hp: 0, sanity: 0, ammoBoost: false };
  }
  const c = Math.round((70 + Math.random() * 60) * mult);
  return { name: `稀世珍宝 价值${c}！`, icon: '👑', coins: c, hp: 0, sanity: 0, ammoBoost: false };
}
