import * as THREE from 'three';

// 房间类型（策划案"场景"表）
export type RoomType = 'combat' | 'treasure' | 'altar' | 'corridor' | 'extract' | 'safehouse' | 'elite';

export const ROOM_INFO: Record<string, { name: string; icon: string; hint: string }> = {
  combat:   { name: '战斗', icon: '⚔️', hint: '有敌人盘踞，消灭后可获得奖励' },
  treasure: { name: '宝藏', icon: '📦', hint: '可以搜刮战利品' },
  altar:    { name: '祭坛', icon: '🔮', hint: '获取局内强化' },
  corridor: { name: '回廊', icon: '🚪', hint: '连通通道，可能有敌人出没' },
  extract:  { name: '撤离点', icon: '🟢', hint: '可以安全撤离' },
  safehouse:{ name: '安全屋', icon: '🏕️', hint: '没有敌人，休整并记录检查点' },
  elite:    { name: '精英巢穴', icon: '💀', hint: '强敌盘踞，掉落高价值战利品' },
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
}

const WIDTH = 11;
const HEIGHT = 5.2;

// 共享石材纹理
let stoneTex: THREE.CanvasTexture | null = null;
function getStoneTex(): THREE.CanvasTexture {
  if (stoneTex) return stoneTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5a4d3b';
  g.fillRect(0, 0, 128, 128);
  // 砖缝
  g.strokeStyle = '#473c2e';
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
  stoneTex = new THREE.CanvasTexture(c);
  stoneTex.wrapS = THREE.RepeatWrapping;
  stoneTex.wrapT = THREE.RepeatWrapping;
  return stoneTex;
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
    const length = type === 'corridor' ? 10 : type === 'extract' ? 12 : type === 'safehouse' ? 11 : 15;
    const zEntry = this.nextZ;
    const zExit = zEntry - length;
    this.nextZ = zExit;

    const group = new THREE.Group();
    const tex = getStoneTex();
    const wallMat = new THREE.MeshStandardMaterial({ map: tex, color: 0x8a7a60 });
    const floorMat = new THREE.MeshStandardMaterial({ map: tex, color: 0x6b5d48 });
    const w = type === 'corridor' ? 5 : WIDTH;

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
    // 门洞内的黑暗
    const dark = new THREE.Mesh(
      new THREE.PlaneGeometry(doorW, 3.2),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    dark.position.set(0, 1.6, zExit - 0.25);
    group.add(dark);

    // 火把（带光源，限2个控制性能）
    const torches: THREE.PointLight[] = [];
    const torchGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.6, 6);
    const torchMat = new THREE.MeshStandardMaterial({ color: 0x4a3520 });
    for (const side of [-1, 1]) {
      const tz = zEntry - length * 0.45;
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
      const light = new THREE.PointLight(0xff8830, 6, 12, 1.6);
      light.position.copy(flame.position);
      group.add(light);
      torches.push(light);
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
    };
    this.rooms.push(room);

    // 只保留最近4个房间
    while (this.rooms.length > 4) {
      const old = this.rooms.shift()!;
      this.scene.remove(old.group);
      old.group.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    }
    return room;
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
