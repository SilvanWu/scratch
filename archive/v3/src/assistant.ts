import * as THREE from 'three';
import { AudioFX } from './audio';
import { Zombie } from './enemy';

// 助手"夜枭"（策划案"助手"：2被动+1主动）
// 被动1：搜索速度+35% ｜ 被动2：每进新房间回1神智 ｜ 主动(4键)：群体电击，每局3次
export class Assistant {
  mesh: THREE.Group;
  charges: number = 3;
  readonly searchSpeedMult: number = 1.35;
  readonly sanityPerRoom: number = 1;
  private wing: THREE.Mesh;
  private zapFx: { mesh: THREE.Mesh; age: number }[] = [];

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

  // 主动技能：电击10米内全部敌人。返回是否释放成功
  zapAll(zombies: Zombie[], scene: THREE.Scene, audio: AudioFX, onHit: (z: Zombie) => void): boolean {
    if (this.charges <= 0) return false;
    let any = false;
    for (const z of zombies) {
      if (z.dead) continue;
      if (z.mesh.position.distanceTo(this.mesh.position) < 12) {
        any = true;
        onHit(z);
        // 电弧
        const a = this.mesh.position;
        const b = z.mesh.position.clone().setY(z.mesh.position.y + 1);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const len = a.distanceTo(b);
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, len, 4),
          new THREE.MeshBasicMaterial({ color: 0xaaf0ff, transparent: true, opacity: 0.9 })
        );
        beam.position.copy(mid);
        beam.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()
        );
        scene.add(beam);
        this.zapFx.push({ mesh: beam, age: 0 });
      }
    }
    if (!any) return false;
    this.charges -= 1;
    audio.thunderLike();
    return true;
  }
}
