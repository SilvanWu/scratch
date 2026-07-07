import * as THREE from 'three';
import { AudioFX } from './audio';

export interface AssistantTarget {
  position: THREE.Vector3;
  hit: () => void;
}

// 助手"夜枭"（策划案"助手"：2被动+1主动）
// 被动1：搜索速度+35% ｜ 被动2：每进新房间回1神智 ｜ 自动普攻 ｜ 主动(E键)：群体电击，每局3次
export class Assistant {
  mesh: THREE.Group;
  readonly maxCharges: number = 3;
  charges: number = 3;
  readonly searchSpeedMult: number = 1.35;
  readonly sanityPerRoom: number = 1;
  readonly autoAttackInterval: number = 1.35;
  readonly autoAttackRange: number = 14;
  readonly skillRange: number = 13;
  private wing: THREE.Mesh;
  private zapFx: { mesh: THREE.Mesh; age: number }[] = [];
  private autoAttackTimer: number = 0.65;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a7adc, emissive: 0x2a2255 })
    );
    this.mesh.add(body);
    const eyeGeo = new THREE.SphereGeometry(0.045, 6, 5);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe34d });
    const eL = new THREE.Mesh(eyeGeo, eyeMat);
    eL.position.set(-0.06, 0.04, 0.13);
    const eR = eL.clone();
    eR.position.x = 0.06;
    this.mesh.add(eL, eR);
    this.wing = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.025, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0xb0a8ff, emissive: 0x3a3577 })
    );
    this.wing.rotation.x = Math.PI / 2;
    this.mesh.add(this.wing);
    const glow = new THREE.PointLight(0x8a7adc, 2, 4, 2);
    this.mesh.add(glow);
    scene.add(this.mesh);
  }

  update(dt: number, time: number, playerPos: THREE.Vector3, scene: THREE.Scene): void {
    // 悬浮在玩家左前上方
    const target = new THREE.Vector3(
      playerPos.x - 0.9, playerPos.y + 2.2 + Math.sin(time * 2.6) * 0.12, playerPos.z - 0.6
    );
    this.mesh.position.lerp(target, Math.min(1, dt * 5));
    this.wing.rotation.z += dt * 3;
    this.autoAttackTimer = Math.max(0, this.autoAttackTimer - dt);

    for (const fx of this.zapFx) {
      fx.age += dt;
      (fx.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - fx.age / 0.25));
    }
    const old = this.zapFx.filter((f) => f.age > 0.25);
    for (const f of old) {
      scene.remove(f.mesh);
      (f.mesh.material as THREE.Material).dispose();
      f.mesh.geometry.dispose();
    }
    this.zapFx = this.zapFx.filter((f) => f.age <= 0.25);
  }

  readyAutoAttack(): boolean {
    return this.autoAttackTimer <= 0;
  }

  recoverCharge(amount: number = 1): number {
    const before = this.charges;
    this.charges = Math.min(this.maxCharges, this.charges + Math.max(0, amount));
    return this.charges - before;
  }

  fireAutoAttack(scene: THREE.Scene, audio: AudioFX, targetPos: THREE.Vector3): void {
    this.autoAttackTimer = this.autoAttackInterval;
    this.drawBeam(scene, targetPos, 0.022, 0.72);
    audio.searchTick();
  }

  castAoe(targets: AssistantTarget[], scene: THREE.Scene, audio: AudioFX): boolean {
    if (this.charges <= 0) return false;
    const hits = targets.filter((target) => target.position.distanceTo(this.mesh.position) <= this.skillRange);
    if (hits.length === 0) return false;
    for (const target of hits) {
      target.hit();
      this.drawBeam(scene, target.position, 0.035, 0.95);
    }
    this.charges -= 1;
    audio.thunderLike();
    return true;
  }

  private drawBeam(scene: THREE.Scene, targetPos: THREE.Vector3, radius: number, opacity: number): void {
    const a = this.mesh.position;
    const b = targetPos.clone();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = Math.max(0.1, a.distanceTo(b));
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, len, 4),
      new THREE.MeshBasicMaterial({ color: 0xaaf0ff, transparent: true, opacity })
    );
    beam.position.copy(mid);
    beam.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()
    );
    scene.add(beam);
    this.zapFx.push({ mesh: beam, age: 0 });
  }
}
