import * as THREE from 'three';
import { AudioFX } from './audio';

// 敌人种类（策划案"敌人"表）：普通/高速/远程/重甲/精神/精英
export type ZombieKind = 'normal' | 'fast' | 'ranged' | 'heavy' | 'psychic' | 'elite';

interface KindConf {
  name: string;
  hpMult: number;
  speedMult: number;
  scale: number;
  hue: number;          // 体色
  bodyArmor: number;    // 身体部位伤害倍率（重甲减伤）
  touchMult: number;
  ranged: boolean;
  psychic: boolean;     // 近战扣神智
  opacity: number;
}

const KIND_CONF: Record<ZombieKind, KindConf> = {
  normal:  { name: '食尸鬼',   hpMult: 1,   speedMult: 1,    scale: 1,    hue: 0.27, bodyArmor: 1,    touchMult: 1,   ranged: false, psychic: false, opacity: 1 },
  fast:    { name: '开膛手',   hpMult: 0.6, speedMult: 2.1,  scale: 0.85, hue: 0.09, bodyArmor: 1,    touchMult: 0.8, ranged: false, psychic: false, opacity: 1 },
  ranged:  { name: '追踪者',   hpMult: 0.8, speedMult: 0.8,  scale: 1,    hue: 0.55, bodyArmor: 1,    touchMult: 0.8, ranged: true,  psychic: false, opacity: 1 },
  heavy:   { name: '再生者',   hpMult: 3.8, speedMult: 0.55, scale: 1.35, hue: 0.0,  bodyArmor: 0.4,  touchMult: 1.8, ranged: false, psychic: false, opacity: 1 },
  psychic: { name: '无形之子', hpMult: 0.7, speedMult: 0.9,  scale: 1.05, hue: 0.72, bodyArmor: 1,    touchMult: 0,   ranged: false, psychic: true,  opacity: 0.45 },
  elite:   { name: '巨人',     hpMult: 8,   speedMult: 0.7,  scale: 1.9,  hue: 0.83, bodyArmor: 0.7,  touchMult: 2.4, ranged: false, psychic: false, opacity: 1 },
};

// 近战结果：0无 1扣血 2扣神智
export class Zombie {
  mesh: THREE.Group;
  head: THREE.Mesh;
  body: THREE.Mesh;
  kind: ZombieKind;
  conf: KindConf;
  hp: number;
  maxHp: number;
  speed: number;
  dead: boolean = false;
  removed: boolean = false;
  private attackTimer: number = 0;
  private attackAnim: number = 0;            // 攻击动画计时（>0 播放挥臂）
  private readonly attackAnimDur: number = 0.45;
  private armL!: THREE.Mesh;
  private armR!: THREE.Mesh;
  private shootTimer: number = 2;
  private deathTimer: number = 0;
  private bobPhase: number = Math.random() * Math.PI * 2;
  private bodyMat: THREE.MeshStandardMaterial;
  private headMat: THREE.MeshStandardMaterial;
  private flashTimer: number = 0;
  private slowTimer: number = 0;   // 中弹减速计时（>0 时移速降为 0.1×）
  private barTimer: number = 0;    // 头顶血条显形计时（受击5s内显示）
  private hpBarBg!: THREE.Mesh;
  private hpBarFill!: THREE.Mesh;
  private barW: number = 0.8;

  onShoot: ((origin: THREE.Vector3) => void) | null = null;

  constructor(scene: THREE.Scene, pos: THREE.Vector3, depth: number, kind: ZombieKind) {
    this.kind = kind;
    const c = KIND_CONF[kind];
    this.conf = c;
    this.maxHp = Math.round((12 + depth * 3) * c.hpMult * 2);   // 血量整体 ×2
    this.hp = this.maxHp;
    // 基础移速 ×1.2（原 ×1.5 的 0.8 倍）
    this.speed = (1.0 + Math.random() * 0.35 + Math.min(0.8, depth * 0.04)) * c.speedMult * 1.2;

    this.mesh = new THREE.Group();
    const skin = new THREE.Color().setHSL(c.hue, kind === 'heavy' ? 0.1 : 0.35, kind === 'heavy' ? 0.25 : 0.32);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: skin, transparent: c.opacity < 1, opacity: c.opacity,
    });
    this.headMat = new THREE.MeshStandardMaterial({
      color: skin.clone().offsetHSL(0, 0, 0.07), transparent: c.opacity < 1, opacity: c.opacity,
    });

    const s = c.scale;
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.62 * s, 1.05 * s, 0.4 * s), this.bodyMat);
    this.body.position.y = 0.95 * s;
    this.body.userData.part = 'body';
    this.body.userData.zombie = this;
    this.mesh.add(this.body);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.21 * s, 10, 8), this.headMat);
    this.head.position.y = 1.72 * s;
    this.head.userData.part = 'head';
    this.head.userData.zombie = this;
    this.mesh.add(this.head);

    // 眼睛（精英红大眼，远程蓝眼）
    const eyeGeo = new THREE.SphereGeometry(0.035 * s * (kind === 'elite' ? 1.6 : 1), 6, 5);
    const eyeColor = kind === 'ranged' ? 0x55aaff : kind === 'psychic' ? 0xcc88ff : 0xff3322;
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
    const eL = new THREE.Mesh(eyeGeo, eyeMat);
    eL.position.set(-0.07 * s, 1.75 * s, 0.18 * s);
    const eR = eL.clone();
    eR.position.x = 0.07 * s;
    this.mesh.add(eL, eR);

    const armGeo = new THREE.BoxGeometry(0.13 * s, 0.13 * s, 0.62 * s);
    this.armL = new THREE.Mesh(armGeo, this.bodyMat);
    this.armL.position.set(-0.24 * s, 1.25 * s, 0.35 * s);
    this.armR = this.armL.clone();
    this.armR.position.x = 0.24 * s;
    this.mesh.add(this.armL, this.armR);

    const legGeo = new THREE.BoxGeometry(0.2 * s, 0.45 * s, 0.22 * s);
    const legL = new THREE.Mesh(legGeo, this.bodyMat);
    legL.position.set(-0.16 * s, 0.22 * s, 0);
    const legR = legL.clone();
    legR.position.x = 0.16 * s;
    this.mesh.add(legL, legR);

    // 重甲：肩甲
    if (kind === 'heavy' || kind === 'elite') {
      const plateMat = new THREE.MeshStandardMaterial({ color: 0x55555f, metalness: 0.7, roughness: 0.4 });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.8 * s, 0.18 * s, 0.5 * s), plateMat);
      plate.position.y = 1.52 * s;
      this.mesh.add(plate);
    }

    // 头顶血条（默认隐藏，受击后显形）
    this.barW = 0.85 * s;
    const barY = 2.15 * s;
    this.hpBarBg = new THREE.Mesh(
      new THREE.PlaneGeometry(this.barW + 0.06, 0.14 * s),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false })
    );
    this.hpBarBg.position.set(0, barY, 0);
    this.hpBarFill = new THREE.Mesh(
      new THREE.PlaneGeometry(this.barW, 0.1 * s),
      new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0, depthTest: false })
    );
    this.hpBarFill.position.set(0, barY, 0.01);
    this.hpBarBg.renderOrder = 10;
    this.hpBarFill.renderOrder = 11;
    this.mesh.add(this.hpBarBg, this.hpBarFill);

    this.mesh.position.copy(pos);
    scene.add(this.mesh);
  }

  private refreshHpBar(): void {
    const ratio = Math.max(0, this.hp / this.maxHp);
    this.hpBarFill.scale.x = ratio;
    this.hpBarFill.position.x = -this.barW / 2 + (this.barW * ratio) / 2;
  }

  update(dt: number, time: number, playerPos: THREE.Vector3, audio: AudioFX): number {
    if (this.dead) {
      this.deathTimer += dt;
      this.mesh.rotation.x = Math.min(Math.PI / 2, this.deathTimer * 4);
      (this.hpBarBg.material as THREE.MeshBasicMaterial).opacity = 0;
      (this.hpBarFill.material as THREE.MeshBasicMaterial).opacity = 0;
      if (this.deathTimer > 1.1) this.removed = true;
      return 0;
    }

    const to = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
    to.y = 0;
    const dist = to.length();
    to.normalize();

    // 中弹减速：命中后 0.5s 内移速降为 0.1×（精英免疫减速）
    if (this.slowTimer > 0) this.slowTimer -= dt;
    const slowed = this.slowTimer > 0 && this.kind !== 'elite';
    const spd = slowed ? this.speed * 0.1 : this.speed;

    if (this.conf.ranged) {
      // 远程：保持5~9米距离射击
      if (dist > 9) {
        this.mesh.position.addScaledVector(to, spd * dt);
      } else if (dist < 5) {
        this.mesh.position.addScaledVector(to, -spd * 0.6 * dt);
      }
      this.mesh.rotation.y = Math.atan2(to.x, to.z);
      this.shootTimer -= dt;
      if (this.shootTimer <= 0 && dist < 14) {
        this.shootTimer = 2.6 + Math.random() * 0.8;
        this.attackAnim = this.attackAnimDur;   // 射击挥臂动画
        if (this.onShoot) {
          this.onShoot(this.mesh.position.clone().setY(this.mesh.position.y + 1.5));
        }
      }
    } else if (dist > 1.1 * this.conf.scale) {
      this.mesh.position.addScaledVector(to, spd * dt);
      this.mesh.rotation.y = Math.atan2(to.x, to.z);
      this.mesh.rotation.z = Math.sin(time * 4 + this.bobPhase) * 0.08;
      this.mesh.position.y = Math.abs(Math.sin(time * 5 + this.bobPhase)) * 0.05;
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.bodyMat.emissive.setHex(0x000000);
    }

    // 头顶血条：受击5s内显示，最后1s渐隐
    if (this.barTimer > 0) {
      this.barTimer -= dt;
      const op = Math.min(1, this.barTimer);  // 最后1秒淡出
      (this.hpBarBg.material as THREE.MeshBasicMaterial).opacity = op * 0.55;
      (this.hpBarFill.material as THREE.MeshBasicMaterial).opacity = op;
    }

    // 攻击动画：双臂前挥（攻击/射击时触发，平滑回到自然下垂）
    if (this.attackAnim > 0) {
      this.attackAnim -= dt;
      const p = Math.min(1, 1 - Math.max(0, this.attackAnim) / this.attackAnimDur);  // 0→1
      const swing = Math.sin(p * Math.PI);   // 0→1→0
      this.armL.rotation.x = -1.5 * swing;
      this.armR.rotation.x = -1.5 * swing;
    } else {
      this.armL.rotation.x += (0 - this.armL.rotation.x) * Math.min(1, dt * 10);
      this.armR.rotation.x += (0 - this.armR.rotation.x) * Math.min(1, dt * 10);
    }

    // 近战
    this.attackTimer -= dt;
    if (!this.conf.ranged && dist < 1.4 * this.conf.scale && this.attackTimer <= 0) {
      this.attackTimer = 1.4;
      this.attackAnim = this.attackAnimDur;   // 触发挥臂动画
      this.mesh.rotation.y = Math.atan2(to.x, to.z);  // 攻击时面向玩家
      audio.meleeHit();
      return this.conf.psychic ? 2 : 1;
    }
    return 0;
  }

  takeDamage(amount: number, part: string): { dmg: number; killed: boolean; headshot: boolean } {
    if (this.dead) return { dmg: 0, killed: false, headshot: false };
    const headshot = part === 'head';
    const dmg = Math.max(1, Math.round(headshot ? amount * 3 : amount * this.conf.bodyArmor));
    this.hp -= dmg;
    this.bodyMat.emissive.setHex(0x661111);
    this.flashTimer = 0.07;
    this.slowTimer = 0.5;   // 中弹减速 0.5 秒
    this.barTimer = 5;      // 头顶血条显形5秒
    this.refreshHpBar();
    if (this.hp <= 0) {
      this.dead = true;
      return { dmg, killed: true, headshot };
    }
    return { dmg, killed: false, headshot };
  }

  // 受击轻微击退（远离来源方向）
  applyKnockback(from: THREE.Vector3, amount: number): void {
    if (this.dead) return;
    const dir = new THREE.Vector3().subVectors(this.mesh.position, from);
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) return;
    dir.normalize();
    this.mesh.position.addScaledVector(dir, amount / this.conf.scale);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.traverse((o: THREE.Object3D) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

export class ZombieManager {
  zombies: Zombie[] = [];
  private scene: THREE.Scene;
  onRangedShoot: ((origin: THREE.Vector3) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // 按深度抽敌人构成
  composition(depth: number, count: number): ZombieKind[] {
    const out: ZombieKind[] = [];
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      if (depth >= 8 && r < 0.12) out.push('psychic');
      else if (depth >= 6 && r < 0.26) out.push('heavy');
      else if (depth >= 5 && r < 0.42) out.push('ranged');
      else if (depth >= 3 && r < 0.65) out.push('fast');
      else out.push('normal');
    }
    return out;
  }

  spawn(pos: THREE.Vector3, depth: number, kind: ZombieKind): Zombie {
    const z = new Zombie(this.scene, pos, depth, kind);
    z.onShoot = (origin: THREE.Vector3) => {
      if (this.onRangedShoot) this.onRangedShoot(origin);
    };
    this.zombies.push(z);
    return z;
  }

  spawnWave(zFrom: number, zTo: number, width: number, depth: number, kinds: ZombieKind[]): void {
    for (const kind of kinds) {
      const x = (Math.random() - 0.5) * (width - 2.5);
      // 更靠近房间后方（zTo=出口侧），给玩家更多反应空间
      const z = zTo + Math.random() * (zFrom - zTo) * 0.3;
      this.spawn(new THREE.Vector3(x, 0, z), depth, kind);
    }
  }

  get aliveCount(): number {
    return this.zombies.filter((z) => !z.dead).length;
  }

  // 返回 {hpHits, sanityHits}
  update(dt: number, time: number, playerPos: THREE.Vector3, audio: AudioFX): { hpHits: number; sanityHits: number } {
    let hpHits = 0, sanityHits = 0;
    for (const z of this.zombies) {
      const r = z.update(dt, time, playerPos, audio);
      if (r === 1) hpHits++;
      else if (r === 2) sanityHits++;
    }
    const gone = this.zombies.filter((z) => z.removed);
    for (const z of gone) z.dispose(this.scene);
    this.zombies = this.zombies.filter((z) => !z.removed);
    return { hpHits, sanityHits };
  }

  targets(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const z of this.zombies) {
      if (z.dead) continue;
      out.push(z.head, z.body);
    }
    return out;
  }
}
