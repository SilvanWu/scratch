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

// 神之祝福（精英房清场获得）：增一项、减一项
// 祝福祭坛：纯增益，无代价
export const BLESSINGS: Pact[] = [
  { id: 'bless_might',    name: '战神之力', icon: '⚔️', boon: '武器伤害 +15%', curse: '' },
  { id: 'bless_vital',    name: '生命之泉', icon: '❤️', boon: '最大生命 +20', curse: '' },
  { id: 'bless_calm',     name: '头脑冷静', icon: '🧊', boon: '进入房间消耗的理智 -1（最多3层）', curse: '' },
  { id: 'bless_reaper',   name: '死神之力', icon: '☠️', boon: '击杀后 15% 概率回 5 生命', curse: '' },
  { id: 'bless_marksman', name: '神枪手',   icon: '🎯', boon: '爆头伤害 +10%', curse: '' },
  { id: 'bless_owl_fury', name: '夜枭共鸣', icon: '🦉', boon: '宠物伤害 +25%', curse: '' },
];

// 神之诅咒（祭坛抉择）：以理智/生命（或上限）为代价换增益
export const CURSES: Pact[] = [
  { id: 'curse_san',    name: '理智献祭', icon: '🧠', boon: '武器伤害 +25%',   curse: '当前理智 -20' },
  { id: 'curse_hp',     name: '血之契印', icon: '🩸', boon: '撤离价值 +30%',   curse: '当前生命 -25' },
  { id: 'curse_sancap', name: '心智裂隙', icon: '🌑', boon: '受到伤害 -15%',   curse: '神智上限 -15' },
  { id: 'curse_hpcap',  name: '残躯之誓', icon: '💀', boon: '前进/搜索 +25%',  curse: '生命上限 -20' },
];

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
