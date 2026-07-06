// 局外持久化：金库、最深记录
export interface MetaData {
  bank: number;     // 已结算金币
  bestDepth: number;
  runs: number;
  extracts: number;
  checkpoint: number; // 安全屋检查点深度
}

const KEY = 'tomb_meta_v1';

export class Meta {
  data: MetaData;

  constructor() {
    this.data = { bank: 0, bestDepth: 0, runs: 0, extracts: 0, checkpoint: 0 };
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
}
