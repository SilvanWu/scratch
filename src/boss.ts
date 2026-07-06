import * as THREE from 'three';
import { AudioFX } from './audio';

// 章节BOSS：双阶段（策划案敌人表：超高生命/复杂机制/分阶段）
export class TombBoss {
  mesh: THREE.Group;
  head: THREE.Mesh;
  body: THREE.Mesh;
  name: string;
  hp: number;
  maxHp: number;
  dead: boolean = false;
  removed: boolean = false;
  phase: number = 1;

  private speed: number = 1.1;
  private chargeTimer: number = 4;
  private charging: number = 0;
  private chargeDir: THREE.Vector3 = new THREE.Vector3();
  private spitTimer: number = 2.5;
  private summonTimer: number = 6;
  private attackTimer: number = 0;
  private deathTimer: number = 0;
  private bodyMat: THREE.MeshStandardMaterial;
  private flashTimer: number = 0;

  onSpit: ((origin: THREE.Vector3) => void) | null = null;
  onSummon: ((pos: THREE.Vector3) => void) | null = null;

  constructor(scene: THREE.Scene, pos: THREE.Vector3, chapter: number) {
    const names = ['沙之暴君', '羽蛇祭司', '青铜俑将'];
    this.name = names[(chapter - 1) % names.length];
    this.maxHp = 500 + chapter * 350;
    this.hp = this.maxHp;

    this.mesh = new THREE.Group();
    const hues = [0.08, 0.35, 0.6];
    const skin = new THREE.Color().setHSL(hues[(chapter - 1) % 3], 0.45, 0.3);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: skin });

    const s = 2.6;
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.7 * s, 1.1 * s, 0.45 * s), this.bodyMat);
    this.body.position.y = 1.0 * s;
    this.body.userData.part = 'body';
    this.body.userData.boss = this;
    this.mesh.add(this.body);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.24 * s, 12, 10), this.bodyMat);
    this.head.position.y = 1.82 * s;
    this.head.userData.part = 'head';
    this.head.userData.boss = this;
    this.mesh.add(this.head);

    // 巨角
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xddddcc });
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1 * s, 0.5 * s, 6), hornMat);
      horn.position.set(sx * 0.22 * s, 2.05 * s, 0);
      horn.rotation.z = -sx * 0.4;
      this.mesh.add(horn);
    }
    // 燃眼
    const eyeGeo = new THREE.SphereGeometry(0.05 * s, 6, 5);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffee44 });
    const eL = new THREE.Mesh(eyeGeo, eyeMat);
    eL.position.set(-0.09 * s, 1.85 * s, 0.2 * s);
    const eR = eL.clone();
    eR.position.x = 0.09 * s;
    this.mesh.add(eL, eR);

    const armGeo = new THREE.BoxGeometry(0.18 * s, 0.18 * s, 0.8 * s);
    const armL = new THREE.Mesh(armGeo, this.bodyMat);
    armL.position.set(-0.42 * s, 1.3 * s, 0.3 * s);
    const armR = armL.clone();
    armR.position.x = 0.42 * s;
    this.mesh.add(armL, armR);

    const legGeo = new THREE.BoxGeometry(0.24 * s, 0.5 * s, 0.26 * s);
    const legL = new THREE.Mesh(legGeo, this.bodyMat);
    legL.position.set(-0.2 * s, 0.25 * s, 0);
    const legR = legL.clone();
    legR.position.x = 0.2 * s;
    this.mesh.add(legL, legR);

    this.mesh.position.copy(pos);
    scene.add(this.mesh);
  }

  // 返回本帧近战命中次数
  update(dt: number, time: number, playerPos: THREE.Vector3, audio: AudioFX): number {
    if (this.dead) {
      this.deathTimer += dt;
      this.mesh.rotation.x = Math.min(Math.PI / 2, this.deathTimer * 2.5);
      if (this.deathTimer > 1.6) this.removed = true;
      return 0;
    }

    // 阶段切换
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
      this.phase = 2;
      this.speed = 1.5;
      this.bodyMat.emissive.setHex(0x441111);
      audio.zombieGroan(0.16);
    }

    const to = new THREE.Vector3().subVectors(playerPos, this.mesh.position);
    to.y = 0;
    const dist = to.length();
    to.normalize();

    if (this.charging > 0) {
      this.charging -= dt;
      this.mesh.position.addScaledVector(this.chargeDir, 7.5 * dt);
    } else {
      this.chargeTimer -= dt;
      if (this.chargeTimer <= 0) {
        this.chargeTimer = this.phase === 2 ? 4.5 : 6;
        this.charging = 0.9;
        this.chargeDir.copy(to);
        audio.zombieGroan(0.14);
      } else {
        this.mesh.position.addScaledVector(to, this.speed * dt);
      }
    }
    this.mesh.rotation.y = Math.atan2(to.x, to.z);
    this.mesh.position.y = Math.abs(Math.sin(time * 3)) * 0.06;

    // 二阶段：吐弹 + 召唤
    if (this.phase === 2) {
      this.spitTimer -= dt;
      if (this.spitTimer <= 0 && this.onSpit) {
        this.spitTimer = 2.8;
        for (let i = 0; i < 3; i++) {
          this.onSpit(this.mesh.position.clone().setY(this.mesh.position.y + 4));
        }
      }
      this.summonTimer -= dt;
      if (this.summonTimer <= 0 && this.onSummon) {
        this.summonTimer = 9;
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          this.onSummon(this.mesh.position.clone().add(
            new THREE.Vector3(Math.cos(a) * 3, 0, Math.sin(a) * 3)
          ));
        }
      }
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.bodyMat.emissive.setHex(this.phase === 2 ? 0x441111 : 0x000000);
      }
    }

    this.attackTimer -= dt;
    if (dist < 2.6 && this.attackTimer <= 0) {
      this.attackTimer = 1.6;
      audio.meleeHit();
      return 1;
    }
    return 0;
  }

  takeDamage(amount: number, part: string): { dmg: number; killed: boolean; headshot: boolean } {
    if (this.dead) return { dmg: 0, killed: false, headshot: false };
    const headshot = part === 'head';
    const dmg = Math.max(1, Math.round(headshot ? amount * 2 : amount * 0.8));
    this.hp -= dmg;
    this.bodyMat.emissive.setHex(0x882222);
    this.flashTimer = 0.07;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return { dmg, killed: true, headshot };
    }
    return { dmg, killed: false, headshot };
  }

  targets(): THREE.Object3D[] {
    return this.dead ? [] : [this.head, this.body];
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.traverse((o: THREE.Object3D) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}
