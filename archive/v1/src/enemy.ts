import * as THREE from 'three';
import { AudioFX } from './audio';

// V1敌人：丧尸（普通型，策划案敌人表第一行：低生命/慢速/多数量/爆头秒杀）
export class Zombie {
  mesh: THREE.Group;
  head: THREE.Mesh;
  body: THREE.Mesh;
  hp: number;
  maxHp: number;
  speed: number;
  dead: boolean = false;
  removed: boolean = false;
  private attackTimer: number = 0;
  private deathTimer: number = 0;
  private bobPhase: number = Math.random() * Math.PI * 2;
  private bodyMat: THREE.MeshStandardMaterial;
  private flashTimer: number = 0;

  constructor(scene: THREE.Scene, pos: THREE.Vector3, depth: number) {
    this.maxHp = 12 + depth * 3;
    this.hp = this.maxHp;
    this.speed = 1.5 + Math.random() * 0.6 + Math.min(1.2, depth * 0.06);

    this.mesh = new THREE.Group();
    const skin = new THREE.Color().setHSL(0.25 + Math.random() * 0.06, 0.35, 0.32);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: skin });

    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.4), this.bodyMat);
    this.body.position.y = 0.95;
    this.body.castShadow = true;
    this.body.userData.part = 'body';
    this.body.userData.zombie = this;
    this.mesh.add(this.body);

    this.head = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 10, 8),
      new THREE.MeshStandardMaterial({ color: skin.clone().offsetHSL(0, 0, 0.06) })
    );
    this.head.position.y = 1.72;
    this.head.userData.part = 'head';
    this.head.userData.zombie = this;
    this.mesh.add(this.head);

    // 红眼
    const eyeGeo = new THREE.SphereGeometry(0.035, 6, 5);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3322 });
    const eL = new THREE.Mesh(eyeGeo, eyeMat);
    eL.position.set(-0.07, 1.75, 0.18);
    const eR = eL.clone();
    eR.position.x = 0.07;
    this.mesh.add(eL, eR);

    // 前伸双臂（丧尸姿态）
    const armGeo = new THREE.BoxGeometry(0.13, 0.13, 0.62);
    const armL = new THREE.Mesh(armGeo, this.bodyMat);
    armL.position.set(-0.24, 1.25, 0.35);
    const armR = armL.clone();
    armR.position.x = 0.24;
    this.mesh.add(armL, armR);

    // 腿
    const legGeo = new THREE.BoxGeometry(0.2, 0.45, 0.22);
    const legL = new THREE.Mesh(legGeo, this.bodyMat);
    legL.position.set(-0.16, 0.22, 0);
    const legR = legL.clone();
    legR.position.x = 0.16;
    this.mesh.add(legL, legR);

    this.mesh.position.copy(pos);
    scene.add(this.mesh);
  }

  // 返回本帧是否对玩家造成攻击
  update(dt: number, time: number, playerPos: THREE.Vector3, audio: AudioFX): boolean {
    if (this.dead) {
      // 倒地淡出
      this.deathTimer += dt;
      this.mesh.rotation.x = Math.min(Math.PI / 2, this.deathTimer * 4);
      if (this.deathTimer > 1.1) this.removed = true;
      return false;
    }

    const to = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
    to.y = 0;
    const dist = to.length();
    if (dist > 1.1) {
      to.normalize();
      this.mesh.position.addScaledVector(to, this.speed * dt);
      this.mesh.rotation.y = Math.atan2(to.x, to.z);
      // 蹒跚摇晃
      this.mesh.rotation.z = Math.sin(time * 4 + this.bobPhase) * 0.08;
      this.mesh.position.y = Math.abs(Math.sin(time * 5 + this.bobPhase)) * 0.05;
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.bodyMat.emissive.setHex(0x000000);
    }

    // 近战攻击
    this.attackTimer -= dt;
    if (dist < 1.4 && this.attackTimer <= 0) {
      this.attackTimer = 1.4;
      audio.meleeHit();
      return true;
    }
    return false;
  }

  // 命中：part='head'爆头。返回实际伤害与是否致死
  takeDamage(amount: number, part: string): { dmg: number; killed: boolean; headshot: boolean } {
    if (this.dead) return { dmg: 0, killed: false, headshot: false };
    const headshot = part === 'head';
    const dmg = headshot ? amount * 3 : amount;
    this.hp -= dmg;
    this.bodyMat.emissive.setHex(0x661111);
    this.flashTimer = 0.07;
    if (this.hp <= 0) {
      this.dead = true;
      return { dmg, killed: true, headshot };
    }
    return { dmg, killed: false, headshot };
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

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // 在房间内生成一波
  spawnWave(zFrom: number, zTo: number, width: number, depth: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * (width - 2.5);
      const z = zTo + Math.random() * (zFrom - zTo) * 0.55; // 房间深处
      this.zombies.push(new Zombie(this.scene, new THREE.Vector3(x, 0, z), depth));
    }
  }

  get aliveCount(): number {
    return this.zombies.filter((z) => !z.dead).length;
  }

  // 返回本帧攻击次数
  update(dt: number, time: number, playerPos: THREE.Vector3, audio: AudioFX): number {
    let hits = 0;
    for (const z of this.zombies) {
      if (z.update(dt, time, playerPos, audio)) hits++;
    }
    const gone = this.zombies.filter((z) => z.removed);
    for (const z of gone) z.dispose(this.scene);
    this.zombies = this.zombies.filter((z) => !z.removed);
    return hits;
  }

  // 射线检测目标集合
  targets(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const z of this.zombies) {
      if (z.dead) continue;
      out.push(z.head, z.body);
    }
    return out;
  }

  clearAll(): void {
    for (const z of this.zombies) z.dispose(this.scene);
    this.zombies = [];
  }
}
