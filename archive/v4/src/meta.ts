// 局外持久化：金库、最深记录
export interface MetaData {
  bank: number;     // 已结算金币
  bestDepth: number;
  runs: number;
  extracts: number;
  checkpoint: number; // 安全屋检查点深度
  chaptersCleared: number;     // 已击败BOSS的章节数
  shotgunOwned: boolean;       // 霰弹枪解锁
  pistolDmgLv: number;         // 手枪伤害改装 0~3
  magLv: number;               // 弹夹扩容 0~2
  assistantOwned: boolean;     // 助手"夜枭"解锁
  collection: string[];        // 收藏品图鉴（按名字）
}

const KEY = 'tomb_meta_v1';

export class Meta {
  data: MetaData;

  constructor() {
    this.data = {
      bank: 0, bestDepth: 0, runs: 0, extracts: 0, checkpoint: 0,
      chaptersCleared: 0, shotgunOwned: false, pistolDmgLv: 0, magLv: 0,
      assistantOwned: false, collection: [],
    };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.bank === 'number') this.data = { ...this.data, ...p };
      }
    } catch (e) { /* 降级单次会话 */ }
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) { /* ignore */ }
  }

  spend(cost: number): boolean {
    if (this.data.bank < cost) return false;
    this.data.bank -= cost;
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
