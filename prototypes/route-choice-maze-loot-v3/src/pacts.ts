import { ALTAR_BUFF_CONFIG } from './content-config';

// pacts.ts —— V5「深入契约」：撤离点选择"继续深入"时的高风险增益
// 搜打撤核心是赌注：越往深处越富有也越危险。结契=用一项永久代价换一项强力增益，
// 多次深入可叠加，形成肉鸽式的局内成长与崩盘张力。
export interface Pact {
  id: string;
  name: string;
  icon: string;
  boon: string;   // 增益描述（界面绿色）
  curse: string;  // 代价描述（界面红色）
}

export const PACTS: Pact[] = [
  { id: 'blood',    name: '血祭契约', icon: '🩸', boon: '武器伤害 +30%',          curse: '最大生命 -25' },
  { id: 'greed',    name: '贪婪契约', icon: '👑', boon: '撤离战利品价值 +35%',     curse: '神智上限 -18' },
  { id: 'reckless', name: '亡命契约', icon: '⚡', boon: '前进/搜索 +35%，赠1手雷', curse: '受到伤害 +20%' },
];

// 祭坛内容直接由 PDF 配置表生成，UI 与结算逻辑共享同一来源。
export const BLESSINGS: Pact[] = ALTAR_BUFF_CONFIG
  .filter((entry) => entry.kind === 'blessing')
  .map((entry) => ({ id: entry.id, name: entry.name, icon: entry.icon, boon: entry.effect, curse: entry.cost }));

export const CURSES: Pact[] = ALTAR_BUFF_CONFIG
  .filter((entry) => entry.kind === 'curse')
  .map((entry) => ({ id: entry.id, name: entry.name, icon: entry.icon, boon: entry.effect, curse: entry.cost }));

function pick<T>(arr: T[], n: number): T[] {
  const pool = arr.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  return pool.slice(0, n);
}

// 每次深入随机抽取 2 个契约供选择（另由 UI 附加"婉拒"）
export function rollPacts(): Pact[] { return pick(PACTS, 2); }
export function rollBlessing(): Pact { return pick(BLESSINGS, 1)[0]; }
export function rollBlessings(): Pact[] { return pick(BLESSINGS, 3); }  // 神明祭坛三选一
export function rollCurses(): Pact[] { return pick(CURSES, 2); }
