import * as THREE from 'three';

// 房间类型（策划案"场景"表）
export type RoomType = 'combat' | 'treasure' | 'altar' | 'corridor' | 'extract' | 'safehouse' | 'elite' | 'boss';

// 章节主题（策划案"世界观"：金字塔/玛雅神庙/秦始皇陵）
export interface Theme {
  name: string;
  story: string;
  wall: number;
  floor: number;
  brick: string;
  gap: string;
}

export const THEMES: Theme[] = [
  { name: '第一章 · 失落金字塔', story: '黄沙之下，法老的诅咒仍在低语……找到王冠，活着出去。',
    wall: 0x8a7a60, floor: 0x6b5d48, brick: '#5a4d3b', gap: '#473c2e' },
  { name: '第二章 · 玛雅神庙', story: '雨林深处的石阶通向献祭之台，羽蛇神注视着每一个闯入者。',
    wall: 0x5f7a62, floor: 0x4a6350, brick: '#3e5a44', gap: '#2e4634' },
  { name: '第三章 · 秦陵地宫', story: '水银为江河，人俑为军阵。地宫深处，长明灯还亮着。',
    wall: 0x6a6a72, floor: 0x55555f, brick: '#4a4a52', gap: '#36363e' },
];

export function themeForDepth(depth: number): Theme {
  return THEMES[Math.floor(Math.max(0, depth - 1) / 30) % THEMES.length];
}

export const ROOM_INFO: Record<string, { name: string; icon: string; hint: string }> = {
  combat:   { name: '战斗', icon: '⚔️', hint: '有敌人盘踞，消灭后可获得奖励' },
  treasure: { name: '宝藏', icon: '📦', hint: '可以搜刮战利品' },
  altar:    { name: '祭坛', icon: '🔮', hint: '获取局内强化' },
  corridor: { name: '回廊', icon: '🚪', hint: '连通通道，可能有敌人出没' },
  extract:  { name: '撤离点', icon: '🟢', hint: '可以安全撤离' },
  safehouse:{ name: '安全屋', icon: '🏕️', hint: '没有敌人，休整并记录检查点' },
  elite:    { name: '精英巢穴', icon: '💀', hint: '强敌盘踞，掉落高价值战利品' },
  boss:     { name: 'BOSS', icon: '👹', hint: '本章主宰，击败后解锁下一章' },
};

export interface Room {
  type: RoomType;
  depth: number;        // 第几个房间
  group: THREE.Group;
  zEntry: number;       // 入口z（大）
  zCenter: number;      // 触发点
  zExit: number;        // 出口z（小）
  length: number;
  crates: THREE.Mesh[]; // 宝藏房可搜索点
  searched: number;     // 已搜索数
  torches: THREE.PointLight[];
  cleared: boolean;
  doorPanels: THREE.Mesh[];  // 雕花石门（左右两扇）
  doorProgress: number;      // 0关 → 1全开
  doorRumbled: boolean;
  doorW: number;
}

const WIDTH = 11;
const HEIGHT = 5.2;

// 石材纹理（按主题缓存）
const texCache: Map<string, THREE.CanvasTexture> = new Map();
function getStoneTex(theme: Theme): THREE.CanvasTexture {
  const hit = texCache.get(theme.name);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = theme.brick;
  g.fillRect(0, 0, 128, 128);
  // 砖缝
  g.strokeStyle = theme.gap;
  g.lineWidth = 2;
  for (let y = 0; y < 128; y += 32) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke();
    const off = (y / 32) % 2 === 0 ? 0 : 32;
    for (let x = off; x < 128; x += 64) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke();
    }
  }
  // 噪点风化
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(30,24,16,${0.05 + Math.random() * 0.1})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  texCache.set(theme.name, tex);
  return tex;
}

// 门板浮雕纹理：石底 + 鎏金边 + 象形符文
const doorTexCache: Map<string, THREE.CanvasTexture> = new Map();
function getDoorTex(theme: Theme): THREE.CanvasTexture {
  const hit = doorTexCache.get(theme.name);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = theme.gap;
  g.fillRect(0, 0, 64, 128);
  // 鎏金描边
  g.strokeStyle = 'rgba(220,178,80,0.95)';
  g.lineWidth = 3;
  g.strokeRect(3, 3, 58, 122);
  g.strokeStyle = 'rgba(220,178,80,0.45)';
  g.lineWidth = 1;
  g.strokeRect(8, 8, 48, 112);
  // 象形符文（圆/眼/波浪/三角，逐行排布）
  g.strokeStyle = 'rgba(255,214,130,0.8)';
  g.fillStyle = 'rgba(255,214,130,0.55)';
  g.lineWidth = 1.5;
  for (let row = 0; row < 5; row++) {
    const y = 20 + row * 21;
    const kind = row % 4;
    if (kind === 0) { // 荷鲁斯之眼
      g.beginPath(); g.ellipse(32, y, 9, 4.5, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(32, y, 2, 0, Math.PI * 2); g.fill();
    } else if (kind === 1) { // 安卡
      g.beginPath(); g.arc(32, y - 3, 4, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(32, y + 1); g.lineTo(32, y + 8); g.moveTo(26, y + 3); g.lineTo(38, y + 3); g.stroke();
    } else if (kind === 2) { // 水波
      g.beginPath();
      for (let x = 14; x <= 50; x += 4) {
        g.lineTo(x, y + ((x / 4) % 2 === 0 ? -3 : 3));
      }
      g.stroke();
    } else { // 金字塔三角
      g.beginPath(); g.moveTo(32, y - 5); g.lineTo(24, y + 5); g.lineTo(40, y + 5); g.closePath(); g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  doorTexCache.set(theme.name, tex);
  return tex;
}

export class Dungeon {
  rooms: Room[] = [];
  private scene: THREE.Scene;
  private nextZ: number = 0; // 下一个房间入口z
  private depthCount: number = 0;

  constructor(scene: THREE.Scene, startDepth: number = 0) {
    this.scene = scene;
    this.depthCount = startDepth;
  }

  get currentDepth(): number {
    return this.depthCount;
  }

  // 决定下一房间候选（每3间出岔路二选一；第10/20/30…间为撤离点）
  nextOptions(): RoomType[] {
    const d = this.depthCount + 1;
    if (d % 30 === 0) return ['boss'];
    if (d % 10 === 0) return ['extract'];
    if (d % 10 === 5) return ['safehouse'];
    if (d % 10 === 8) return ['elite'];
    if (d % 3 === 0) {
      // 岔路二选一
      const pool: RoomType[] = ['combat', 'treasure', 'altar', 'corridor'];
      const a = pool[Math.floor(Math.random() * pool.length)];
      let b = pool[Math.floor(Math.random() * pool.length)];
      if (b === a) b = pool[(pool.indexOf(a) + 1) % pool.length];
      return [a, b];
    }
    const r = Math.random();
    if (r < 0.45) return ['combat'];
    if (r < 0.7) return ['treasure'];
    if (r < 0.82) return ['altar'];
    return ['corridor'];
  }

  append(type: RoomType): Room {
    this.depthCount += 1;
    const length = type === 'corridor' ? 10 : type === 'extract' ? 12 : type === 'safehouse' ? 11 : type === 'boss' ? 24 : 15;
    const zEntry = this.nextZ;
    const zExit = zEntry - length;
    this.nextZ = zExit;

    const group = new THREE.Group();
    const theme = themeForDepth(this.depthCount);
    const tex = getStoneTex(theme);
    const wallMat = new THREE.MeshStandardMaterial({ map: tex, color: theme.wall });
    const floorMat = new THREE.MeshStandardMaterial({ map: tex, color: theme.floor });
    const w = type === 'corridor' ? 5 : type === 'boss' ? 15 : WIDTH;

    // 地板/天花
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, length), floorMat);
    floor.position.set(0, -0.15, zEntry - length / 2);
    floor.receiveShadow = true;
    group.add(floor);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, length),
      new THREE.MeshStandardMaterial({ map: tex, color: 0x3a3228 }));
    ceil.position.set(0, HEIGHT, zEntry - length / 2);
    group.add(ceil);

    // 侧墙
    const wallGeo = new THREE.BoxGeometry(0.4, HEIGHT, length);
    const wl = new THREE.Mesh(wallGeo, wallMat);
    wl.position.set(-w / 2, HEIGHT / 2, zEntry - length / 2);
    group.add(wl);
    const wr = new THREE.Mesh(wallGeo, wallMat);
    wr.position.set(w / 2, HEIGHT / 2, zEntry - length / 2);
    group.add(wr);

    // 端墙（带门洞：左右两块+门楣）
    const doorW = 2.2;
    const endWallSide = new THREE.BoxGeometry((w - doorW) / 2, HEIGHT, 0.4);
    const el = new THREE.Mesh(endWallSide, wallMat);
    el.position.set(-(doorW / 2 + (w - doorW) / 4), HEIGHT / 2, zExit);
    group.add(el);
    const er = new THREE.Mesh(endWallSide, wallMat);
    er.position.set(doorW / 2 + (w - doorW) / 4, HEIGHT / 2, zExit);
    group.add(er);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW, HEIGHT - 3.2, 0.4), wallMat);
    lintel.position.set(0, HEIGHT - (HEIGHT - 3.2) / 2, zExit);
    group.add(lintel);

    // ===== 仪式感石门：雕花门框 + 鎏金浮雕双开门 =====
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd8b050, emissive: 0x4a3408, metalness: 0.8, roughness: 0.3,
    });
    // 两侧雕花门柱
    for (const side of [-1, 1]) {
      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 3.5, 8), wallMat
      );
      column.position.set(side * (doorW / 2 + 0.18), 1.75, zExit + 0.12);
      group.add(column);
      const capital = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.45), goldMat);
      capital.position.set(side * (doorW / 2 + 0.18), 3.45, zExit + 0.12);
      group.add(capital);
    }
    // 门楣鎏金饰带 + 圣甲虫徽记
    const band = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.7, 0.16, 0.1), goldMat);
    band.position.set(0, 3.32, zExit + 0.22);
    group.add(band);
    const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), goldMat);
    emblem.position.set(0, 3.62, zExit + 0.2);
    group.add(emblem);
    // 双开浮雕门板
    const doorTex = getDoorTex(theme);
    const doorMat = new THREE.MeshStandardMaterial({
      map: doorTex, color: 0xb8b0a0, roughness: 0.8,
    });
    const doorPanels: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(doorW / 2 - 0.02, 3.15, 0.16), doorMat
      );
      panel.position.set(side * doorW / 4, 1.58, zExit);
      group.add(panel);
      doorPanels.push(panel);
    }
    // 门洞内的黑暗（门开后可见下一间的幽暗）
    const dark = new THREE.Mesh(
      new THREE.PlaneGeometry(doorW, 3.2),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    dark.position.set(0, 1.6, zExit - 0.35);
    group.add(dark);

    // 火把（带光源，限2个控制性能）
    const torches: THREE.PointLight[] = [];
    const torchGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.6, 6);
    const torchMat = new THREE.MeshStandardMaterial({ color: 0x4a3520 });
    const torchSpots: number[] = type === 'corridor' ? [0.5] : [0.24, 0.72];
    for (const frac of torchSpots) {
    for (const side of [-1, 1]) {
      const tz = zEntry - length * frac;
      const torch = new THREE.Mesh(torchGeo, torchMat);
      torch.position.set(side * (w / 2 - 0.35), 2.6, tz);
      torch.rotation.z = -side * 0.3;
      group.add(torch);
      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xffaa33 })
      );
      flame.position.set(side * (w / 2 - 0.42), 2.95, tz);
      group.add(flame);
      const light = new THREE.PointLight(0xff8830, 7, 15, 1.5);
      light.position.copy(flame.position);
      group.add(light);
      torches.push(light);
    }
    }

    // 类型化布置
    const crates: THREE.Mesh[] = [];
    if (type === 'treasure') {
      const crateGeo = new THREE.BoxGeometry(1.1, 0.9, 0.85);
      const crateMat = new THREE.MeshStandardMaterial({ color: 0x7a5a30 });
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const crate = new THREE.Mesh(crateGeo, crateMat.clone());
        const side = i % 2 === 0 ? -1 : 1;
        crate.position.set(
          side * (2.2 + Math.random() * 1.6),
          0.45,
          zEntry - 4 - i * 3.2
        );
        crate.rotation.y = Math.random() * 0.6 - 0.3;
        crate.castShadow = true;
        crate.userData.crate = true;
        crate.userData.searched = false;
        group.add(crate);
        crates.push(crate);
      }
      // 金光点缀
      const glow = new THREE.PointLight(0xffd24d, 2, 8, 2);
      glow.position.set(0, 1.5, zEntry - length / 2);
      group.add(glow);
    } else if (type === 'altar') {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.7, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x55607a })
      );
      pillar.position.set(0, 0.8, zEntry - length / 2 - 1);
      group.add(pillar);
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x8fb8ff, emissive: 0x2244aa })
      );
      orb.position.set(0, 2.0, zEntry - length / 2 - 1);
      orb.userData.altarOrb = true;
      group.add(orb);
      const light = new THREE.PointLight(0x6688ff, 4, 10, 1.8);
      light.position.copy(orb.position);
      group.add(light);
    } else if (type === 'extract') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.3, 0.12, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0x35e07a, emissive: 0x117733 })
      );
      ring.position.set(0, 1.8, zExit + 2.5);
      group.add(ring);
      const light = new THREE.PointLight(0x35e07a, 6, 12, 1.6);
      light.position.copy(ring.position);
      group.add(light);
    } else if (type === 'safehouse') {
      // 篝火 + 暖光
      const fire = new THREE.Mesh(
        new THREE.ConeGeometry(0.3, 0.5, 6),
        new THREE.MeshBasicMaterial({ color: 0xffaa33 })
      );
      fire.position.set(0, 0.25, zEntry - length / 2);
      group.add(fire);
      const logs = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.9, 5),
        new THREE.MeshStandardMaterial({ color: 0x5a4025 })
      );
      logs.rotation.z = Math.PI / 2;
      logs.position.set(0, 0.06, zEntry - length / 2);
      group.add(logs);
      const warm = new THREE.PointLight(0xffa040, 8, 14, 1.4);
      warm.position.set(0, 1.4, zEntry - length / 2);
      group.add(warm);
      // 床铺
      const bed = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.12, 2),
        new THREE.MeshStandardMaterial({ color: 0x6a3a3a })
      );
      bed.position.set(-3.4, 0.06, zEntry - length / 2 - 1);
      group.add(bed);
    } else if (type === 'elite') {
      // 骷髅警示 + 红光
      const skullMat = new THREE.MeshStandardMaterial({ color: 0xd8cfb8 });
      for (const sx of [-2.2, 2.2]) {
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), skullMat);
        skull.position.set(sx, 1.1, zEntry - 2);
        group.add(skull);
        const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.0, 5), skullMat);
        spike.position.set(sx, 0.5, zEntry - 2);
        group.add(spike);
      }
      const red = new THREE.PointLight(0xff2233, 5, 13, 1.6);
      red.position.set(0, 2.6, zEntry - length / 2);
      group.add(red);
    } else if (type === 'boss') {
      // 王座 + 双红炬
      const throne = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 2.6, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x3a3030 })
      );
      throne.position.set(0, 1.3, zExit + 2);
      group.add(throne);
      for (const sx of [-3.5, 3.5]) {
        const brazier = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.2, 0.8, 8),
          new THREE.MeshStandardMaterial({ color: 0x444444 })
        );
        brazier.position.set(sx, 0.4, zEntry - length / 2);
        group.add(brazier);
        const fl = new THREE.PointLight(0xff3322, 7, 14, 1.5);
        fl.position.set(sx, 1.4, zEntry - length / 2);
        group.add(fl);
      }
    } else if (type === 'combat') {
      // 残骸装饰
      const boneMat = new THREE.MeshStandardMaterial({ color: 0xd8cfb8 });
      for (let i = 0; i < 3; i++) {
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 5), boneMat);
        bone.position.set(
          (Math.random() - 0.5) * (w - 3), 0.06,
          zEntry - 2 - Math.random() * (length - 4)
        );
        bone.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);
        group.add(bone);
      }
    }

    this.scene.add(group);
    const room: Room = {
      type,
      depth: this.depthCount,
      group,
      zEntry,
      zCenter: zEntry - length / 2,
      zExit,
      length,
      crates,
      searched: 0,
      torches,
      cleared: false,
      doorPanels,
      doorProgress: 0,
      doorRumbled: false,
      doorW,
    };
    this.rooms.push(room);

    // 只保留最近4个房间
    while (this.rooms.length > 3) {
      const old = this.rooms.shift()!;
      this.scene.remove(old.group);
      old.group.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    }
    return room;
  }

  // 石门开启：靠近时缓缓滑入墙内（带回调播放隆隆声）
  updateDoors(dt: number, playerZ: number, onRumble: () => void): void {
    for (const room of this.rooms) {
      if (room.doorProgress >= 1) continue;
      const dist = playerZ - room.zExit;
      if (dist < 6.5 && dist > -2) {
        if (!room.doorRumbled) {
          room.doorRumbled = true;
          onRumble();
        }
        room.doorProgress = Math.min(1, room.doorProgress + dt / 1.4);
        // 缓动：先慢后快的开门感
        const t = room.doorProgress;
        const ease = t * t * (3 - 2 * t);
        const slide = ease * (room.doorW / 2 + 0.25);
        room.doorPanels[0].position.x = -room.doorW / 4 - slide;
        room.doorPanels[1].position.x = room.doorW / 4 + slide;
      }
    }
  }

  // 火把闪烁
  flicker(time: number): void {
    for (const room of this.rooms) {
      for (let i = 0; i < room.torches.length; i++) {
        const t = room.torches[i];
        t.intensity = 5 + Math.sin(time * 9 + i * 2.7 + room.depth) * 1.2 + Math.random() * 0.6;
      }
    }
  }
}
