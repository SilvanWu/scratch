// 局外持久化：双资源、章节解锁与永久养成。
export interface MetaData {
  bank: number;
  relicMarks: number;
  bestDepth: number;
  runs: number;
  extracts: number;
  checkpoint: number;
  chaptersCleared: number;
  surveyedMapChapters: number[];
  backpackLv: number;
  shotgunOwned: boolean;
  weaponCalibrationLv: number;
  magLv: number;
  shieldCapLv: number;
  hpLv: number;
  sanityLv: number;
  reloadLv: number;
  assistantOwned: boolean;
  collection: string[];
  relicMarkCollections: string[];
  bossMarkChapters: number[];
  specialGoldPity: number;
}

export interface BackpackUpgradeConfig {
  level: number;
  cols: number;
  rows: number;
  coinCost: number;
  markCost: number;
  unlockLabel: string;
}

export const BACKPACK_UPGRADES: BackpackUpgradeConfig[] = [
  { level: 0, cols: 6, rows: 5, coinCost: 0, markCost: 0, unlockLabel: '初始' },
  { level: 1, cols: 6, rows: 6, coinCost: 2000, markCost: 0, unlockLabel: '完成 2 次撤离' },
  { level: 2, cols: 7, rows: 6, coinCost: 6000, markCost: 1, unlockLabel: '击败第一章 BOSS' },
  { level: 3, cols: 7, rows: 7, coinCost: 14000, markCost: 2, unlockLabel: '解锁第二章' },
  { level: 4, cols: 8, rows: 7, coinCost: 28000, markCost: 4, unlockLabel: '击败第二章 BOSS' },
];

const KEY = 'tomb_meta_v1';
export const HP_TRAINING_STEP = 6;
export const SANITY_TRAINING_STEP = 4;
export const WEAPON_CALIBRATION_STEP = 0.04;

export function reloadTrainingMultiplier(level: number): number {
  return Math.max(0.8, 1 - Math.max(0, Math.min(5, level)) * 0.04);
}

export function trainingChapterCap(chaptersCleared: number): number {
  if (chaptersCleared >= 2) return 10;
  if (chaptersCleared >= 1) return 6;
  return 3;
}

export function backpackUpgradeUnlocked(data: MetaData, targetLevel: number): boolean {
  if (targetLevel <= 0) return true;
  if (targetLevel === 1) return data.extracts >= 2;
  if (targetLevel === 2 || targetLevel === 3) return data.chaptersCleared >= 1;
  if (targetLevel === 4) return data.chaptersCleared >= 2;
  return false;
}

export class Meta {
  data: MetaData;

  constructor() {
    const defaults: MetaData = {
      bank: 0, relicMarks: 0, bestDepth: 0, runs: 0, extracts: 0, checkpoint: 0,
      chaptersCleared: 0, surveyedMapChapters: [], backpackLv: 0, shotgunOwned: false,
      weaponCalibrationLv: 0, magLv: 0, shieldCapLv: 0,
      hpLv: 0, sanityLv: 0, reloadLv: 0,
      assistantOwned: false, collection: [],
      relicMarkCollections: [], bossMarkChapters: [], specialGoldPity: 0,
    };
    this.data = defaults;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.bank === 'number') {
          this.data = { ...defaults, ...parsed };
          if (typeof parsed.weaponCalibrationLv !== 'number') {
            this.data.weaponCalibrationLv = Math.max(0, Math.min(8, Number(parsed.pistolDmgLv || 0)));
          }
          this.data.backpackLv = Math.max(0, Math.min(BACKPACK_UPGRADES.length - 1, Number(this.data.backpackLv || 0)));
          this.data.relicMarks = Math.max(0, Number(this.data.relicMarks || 0));
          if (!Array.isArray(this.data.relicMarkCollections)) this.data.relicMarkCollections = [];
          if (!Array.isArray(this.data.bossMarkChapters)) this.data.bossMarkChapters = [];
          if (!Array.isArray(this.data.surveyedMapChapters)) this.data.surveyedMapChapters = [];
          for (let chapter = 1; chapter <= this.data.chaptersCleared; chapter++) {
            if (!this.data.surveyedMapChapters.includes(chapter)) this.data.surveyedMapChapters.push(chapter);
          }
          this.data.specialGoldPity = Math.max(0, Number(this.data.specialGoldPity || 0));
        }
      }
    } catch (e) { /* 降级单次会话 */ }
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) { /* ignore */ }
  }

  clearSave(): void {
    try {
      localStorage.removeItem(KEY);
    } catch (e) { /* ignore */ }
  }

  spend(cost: number): boolean {
    return this.spendResources(cost, 0);
  }

  spendResources(coinCost: number, markCost: number): boolean {
    if (this.data.bank < coinCost || this.data.relicMarks < markCost) return false;
    this.data.bank -= coinCost;
    this.data.relicMarks -= markCost;
    this.save();
    return true;
  }

  collect(name: string): boolean {
    if (this.data.collection.includes(name)) return false;
    this.data.collection.push(name);
    this.save();
    return true;
  }
}
