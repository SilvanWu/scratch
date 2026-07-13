// PDF《古墓不样进_V3版本物资与BUFF》配置表。
// 游戏中的宝物掉落、祝福和诅咒均从这里读取，避免数值散落在业务逻辑中。
export type LootRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legend' | 'mythic';

export interface TreasureConfig {
  name: string;
  icon: string;
  rarity: LootRarity;
  w: number;
  h: number;
  value: number;
  weight: number;
  description: string;
}

export const TREASURE_CONFIG: TreasureConfig[] = [
  { name: '陶片', icon: '🏺', rarity: 'common', w: 1, h: 1, value: 1, weight: 1, description: '碎陶器残片' },
  { name: '破损的麻布', icon: '🧵', rarity: 'common', w: 1, h: 1, value: 2, weight: 1, description: '腐朽的织物' },
  { name: '骨制针', icon: '🦴', rarity: 'common', w: 1, h: 1, value: 2, weight: 1, description: '动物骨打磨的针' },
  { name: '沙粒石珠', icon: '⚪', rarity: 'common', w: 1, h: 1, value: 3, weight: 1, description: '粗糙的石珠串' },
  { name: '断折的铜针', icon: '📍', rarity: 'common', w: 1, h: 1, value: 3, weight: 1, description: '已锈断的铜针' },
  { name: '空油灯', icon: '🪔', rarity: 'common', w: 1, h: 1, value: 4, weight: 1, description: '没有燃油的小灯' },
  { name: '古旧绳结', icon: '🪢', rarity: 'common', w: 1, h: 1, value: 4, weight: 1, description: '用于记事的绳结' },
  { name: '芦苇笔杆', icon: '✒️', rarity: 'common', w: 1, h: 1, value: 5, weight: 1, description: '空心的芦苇茎' },
  { name: '碎贝壳饰', icon: '🐚', rarity: 'common', w: 1, h: 1, value: 5, weight: 1, description: '打磨过的贝壳碎片' },
  { name: '磨损的护符', icon: '🧿', rarity: 'common', w: 1, h: 1, value: 6, weight: 1, description: '图案模糊的陶质护符' },
  { name: '铜制砝码', icon: '⚖️', rarity: 'common', w: 1, h: 1, value: 7, weight: 1, description: '天平用的小砝码' },
  { name: '干燥的香料', icon: '🌿', rarity: 'common', w: 1, h: 1, value: 8, weight: 1, description: '一撮已经失效的香料' },

  { name: '彩绘陶罐', icon: '🏺', rarity: 'uncommon', w: 1, h: 1, value: 10, weight: 2.5, description: '带简单纹饰的小罐' },
  { name: '铜制圣甲虫', icon: '🪲', rarity: 'uncommon', w: 1, h: 1, value: 12, weight: 2.3, description: '铜铸圣甲虫，略有铜绿' },
  { name: '亚麻绷带', icon: '🧻', rarity: 'uncommon', w: 2, h: 2, value: 15, weight: 2, description: '一卷保存尚可的亚麻布' },
  { name: '红玉髓珠串', icon: '🔴', rarity: 'uncommon', w: 1, h: 1, value: 18, weight: 1.8, description: '红玉髓打磨的珠子' },
  { name: '木制荷鲁斯像', icon: '🦅', rarity: 'uncommon', w: 2, h: 2, value: 22, weight: 1.6, description: '木质小神像，局部缺损' },
  { name: '雪花石膏瓶', icon: '🏺', rarity: 'uncommon', w: 2, h: 2, value: 26, weight: 1.5, description: '雪花石膏制成的小瓶' },
  { name: '青铜匕首', icon: '🗡️', rarity: 'uncommon', w: 2, h: 2, value: 30, weight: 1.3, description: '青铜刃，已钝' },
  { name: '彩绘木盒', icon: '🎁', rarity: 'uncommon', w: 2, h: 2, value: 35, weight: 1.2, description: '描绘尼罗河景的木盒' },
  { name: '绿松石碎块', icon: '🔷', rarity: 'uncommon', w: 1, h: 1, value: 38, weight: 1.1, description: '小块绿松石，可加工' },
  { name: '莎草纸卷', icon: '📜', rarity: 'uncommon', w: 2, h: 2, value: 40, weight: 1, description: '部分烧毁的莎草纸卷' },

  { name: '银质安卡符', icon: '☥', rarity: 'rare', w: 2, h: 2, value: 45, weight: 3, description: '银制的生命之符' },
  { name: '猫神青铜像', icon: '🐈', rarity: 'rare', w: 2, h: 2, value: 55, weight: 3, description: '小巧的猫女神铜像' },
  { name: '象牙梳子', icon: '🪮', rarity: 'rare', w: 2, h: 2, value: 65, weight: 3, description: '雕有莲花纹的象牙梳' },
  { name: '石榴石手镯', icon: '📿', rarity: 'rare', w: 2, h: 2, value: 80, weight: 3, description: '镶嵌石榴石的银镯' },
  { name: '胡狼头木雕', icon: '🐺', rarity: 'rare', w: 3, h: 3, value: 100, weight: 3, description: '阿努比斯形象的木雕' },
  { name: '琉璃圣甲虫', icon: '🪲', rarity: 'rare', w: 2, h: 2, value: 120, weight: 3, description: '彩色琉璃烧制的圣甲虫' },
  { name: '陶制法老印章', icon: '🔏', rarity: 'rare', w: 3, h: 3, value: 140, weight: 3, description: '带有王名圈的陶质印章' },
  { name: '金箔莎草纸', icon: '📜', rarity: 'rare', w: 3, h: 3, value: 160, weight: 3, description: '部分贴金的祭祀文献' },
  { name: '赤铁矿权杖头', icon: '🪄', rarity: 'rare', w: 3, h: 3, value: 180, weight: 3, description: '赤铁矿磨制的权杖顶部' },

  { name: '祖母绿坠饰', icon: '💚', rarity: 'epic', w: 1, h: 1, value: 200, weight: 1.5, description: '小颗祖母绿镶嵌的金坠' },
  { name: '黑曜石胡狼像', icon: '🐺', rarity: 'epic', w: 3, h: 3, value: 260, weight: 1.5, description: '黑曜石雕成的胡狼神像' },
  { name: '银质仪式面具', icon: '🎭', rarity: 'epic', w: 3, h: 3, value: 320, weight: 1.5, description: '银制小型面具，用于祭祀' },
  { name: '蓝宝石戒指', icon: '💍', rarity: 'epic', w: 1, h: 1, value: 400, weight: 1.5, description: '蓝宝石金戒，光彩夺目' },
  { name: '金质荷鲁斯之眼', icon: '👁️', rarity: 'epic', w: 2, h: 2, value: 620, weight: 1.5, description: '纯金打造的荷鲁斯之眼' },
  { name: '花岗岩狮身像', icon: '🗿', rarity: 'epic', w: 4, h: 4, value: 800, weight: 1.5, description: '小型花岗岩狮身人面像' },

  { name: '钻石原石', icon: '💎', rarity: 'legend', w: 1, h: 1, value: 1000, weight: 0.5, description: '未经切割的高纯度钻石' },
  { name: '金制圣甲虫护符', icon: '🪲', rarity: 'legend', w: 1, h: 1, value: 1200, weight: 0.5, description: '纯金圣甲虫，精细入微' },
  { name: '残缺法老面具', icon: '🎭', rarity: 'legend', w: 3, h: 3, value: 1500, weight: 0.5, description: '法老黄金面具的下半部' },
  { name: '红宝石权杖', icon: '🪄', rarity: 'legend', w: 4, h: 4, value: 2000, weight: 0.5, description: '顶端镶红宝石的黄金权杖' },
  { name: '猫神金像', icon: '🐈', rarity: 'legend', w: 3, h: 3, value: 2500, weight: 0.5, description: '纯金猫神像，镶嵌青金石' },
  { name: '太阳船模型', icon: '⛵', rarity: 'legend', w: 4, h: 4, value: 3500, weight: 0.5, description: '黄金制成的太阳船微缩模型' },

  { name: '法老金面具', icon: '👑', rarity: 'mythic', w: 4, h: 4, value: 4000, weight: 0.15, description: '完整的法老黄金丧葬面具' },
  { name: '星空宝石', icon: '🌌', rarity: 'mythic', w: 1, h: 1, value: 5500, weight: 0.15, description: '罕见的天外宝石，内部有星纹' },
  { name: '阿努比斯金像', icon: '🐺', rarity: 'mythic', w: 4, h: 4, value: 7000, weight: 0.05, description: '全金阿努比斯神像，嵌宝石眼' },
  { name: '金棺内棺', icon: '⚰️', rarity: 'mythic', w: 4, h: 4, value: 9000, weight: 0.08, description: '小型金制人形内棺' },
  { name: '法老宝冠', icon: '👑', rarity: 'mythic', w: 3, h: 3, value: 12000, weight: 0.01, description: '带有双蛇装饰的法老王冠' },
];

export type AltarBuffKind = 'blessing' | 'curse';

export interface AltarBuffConfig {
  id: string;
  kind: AltarBuffKind;
  name: string;
  icon: string;
  effect: string;
  cost: string;
}

export const ALTAR_BUFF_CONFIG: AltarBuffConfig[] = [
  { id: 'curse_san', kind: 'curse', name: '理智献祭', icon: '🧠', effect: '武器伤害 +35%', cost: '当前理智 -20' },
  { id: 'curse_hp', kind: 'curse', name: '血之契印', icon: '🩸', effect: '撤离价值 +30%', cost: '当前生命 -25' },
  { id: 'curse_sancap', kind: 'curse', name: '心智裂隙', icon: '🌑', effect: '受到伤害 -15%', cost: '神智上限 -15' },
  { id: 'curse_dodge', kind: 'curse', name: '残躯之誓', icon: '💀', effect: '怪物攻击时有 5% 概率闪避免伤，重复选择时概率叠加', cost: '生命上限 -20' },
  { id: 'curse_greed', kind: 'curse', name: '贪婪诅咒', icon: '👑', effect: '接下来的 3 个房间中，拾取的物品会额外获得 1 个', cost: '生命上限 -10' },
  { id: 'curse_shield', kind: 'curse', name: '神盾契约', icon: '🛡️', effect: '每清完一个房间获得临时护盾（最多 10 点）', cost: '受到伤害 +15%' },
  { id: 'curse_thirst', kind: 'curse', name: '血之渴望', icon: '🩸', effect: '接下来的 3 个房间中，击杀敌人恢复 8 生命', cost: '受到伤害 +20%' },
  { id: 'curse_slayer', kind: 'curse', name: '杀神附身', icon: '⚔️', effect: '接下来的 3 个房间中，击杀敌人恢复 3 理智', cost: '神智 -10' },

  { id: 'bless_might', kind: 'blessing', name: '战神之力', icon: '⚔️', effect: '武器伤害 +25%', cost: '' },
  { id: 'bless_vital', kind: 'blessing', name: '生命之泉', icon: '❤️', effect: '最大生命 +35', cost: '' },
  { id: 'bless_will', kind: 'blessing', name: '钢铁意志', icon: '🧠', effect: '最大理智 +30', cost: '' },
  { id: 'bless_calm', kind: 'blessing', name: '头脑冷静', icon: '🧊', effect: '进入房间理智消耗 -1', cost: '' },
  { id: 'bless_reaper', kind: 'blessing', name: '死神之力', icon: '☠️', effect: '击杀后 30% 概率恢复 10 生命；重复选择时恢复量 +10、概率 +5%', cost: '' },
  { id: 'bless_marksman', kind: 'blessing', name: '神枪手', icon: '🎯', effect: '爆头伤害 +20%', cost: '' },
  { id: 'bless_lucky', kind: 'blessing', name: '幸运星', icon: '⭐', effect: '拾取战利品时 20% 概率额外获得一件低品质宝物；重复选择时概率 +5%', cost: '' },
  { id: 'bless_healing', kind: 'blessing', name: '愈合神力', icon: '✨', effect: '每进入一个房间时自动恢复 3 点生命', cost: '' },
];
