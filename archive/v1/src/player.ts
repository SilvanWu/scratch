import * as THREE from 'three';
import { AudioFX } from './audio';

// 玩家载具：越肩相机 + 手电 + 枪械（自动前进，策划案"通用规则"）
export class PlayerRig {
  position: THREE.Vector3 = new THREE.Vector3(0, 0, 2);
  hp: number = 100;
  maxHp: number = 100;
  sanity: number = 60;
  maxSanity: number = 60;
  coins: number = 0;       // 本局战利品
  damageMult: number = 1;  // 强化弹药加成
  alive: boolean = true;

  // 枪械
  readonly magSize: number = 12;
  ammo: number = 12;
  reloading: number = 0;   // >0 换弹中（剩余秒）
  readonly reloadTime: number = 1.15;
  private fireCooldown: number = 0;
  readonly fireInterval: number = 0.22;
  baseDamage: number = 8;

  camera: THREE.PerspectiveCamera;
  private gun: THREE.Group;
  private muzzleFlash: THREE.PointLight;
  private flashlight: THREE.SpotLight;
  private recoil: number = 0;
  walkSpeed: number = 3.2;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.camera = camera;

    // 手电筒（核心微恐光源）
    this.flashlight = new THREE.SpotLight(0xfff2d9, 28, 26, 0.42, 0.45, 1.4);
    scene.add(this.flashlight);
    scene.add(this.flashlight.target);

    // 枪模型挂相机（屏幕右下）
    this.gun = new THREE.Group();
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x2c2c33, metalness: 0.7, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.34), gunMat);
    this.gun.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.035, -0.25);
    this.gun.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.07), gunMat);
    grip.position.set(0, -0.1, 0.1);
    grip.rotation.x = 0.3;
    this.gun.add(grip);
    // 持枪的手
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8bd9a })
    );
    hand.position.set(0, -0.09, 0.08);
    this.gun.add(hand);
    camera.add(this.gun);
    this.gun.position.set(0.22, -0.18, -0.55);
    scene.add(camera);

    this.muzzleFlash = new THREE.PointLight(0xffcc66, 0, 4, 2);
    this.muzzleFlash.position.set(0.22, -0.12, -0.85);
    camera.add(this.muzzleFlash);
  }

  // 是否可开火
  canFire(): boolean {
    return this.alive && this.reloading <= 0 && this.fireCooldown <= 0 && this.ammo > 0;
  }

  fire(audio: AudioFX): boolean {
    if (this.reloading > 0 || this.fireCooldown > 0) return false;
    if (this.ammo <= 0) {
      audio.dryFire();
      this.startReload(audio);
      return false;
    }
    this.ammo -= 1;
    this.fireCooldown = this.fireInterval;
    this.recoil = 1;
    this.muzzleFlash.intensity = 8;
    audio.gunshot();
    if (this.ammo <= 0) this.startReload(audio);
    return true;
  }

  startReload(audio: AudioFX): void {
    if (this.reloading > 0 || this.ammo >= this.magSize) return;
    this.reloading = this.reloadTime;
    audio.reloadStart();
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  heal(v: number): void {
    this.hp = Math.min(this.maxHp, this.hp + v);
  }
  addSanity(v: number): void {
    this.sanity = Math.min(this.maxSanity, this.sanity + v);
  }

  update(dt: number, moving: boolean, mouseNDC: THREE.Vector2, audio: AudioFX, time: number): void {
    if (moving && this.alive) {
      this.position.z -= this.walkSpeed * dt;
    }

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.ammo = this.magSize;
        audio.reloadEnd();
      }
    }
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.muzzleFlash.intensity = Math.max(0, this.muzzleFlash.intensity - dt * 60);

    // 越肩相机：右肩后上方，鼠标提供视差转动
    const yawOff = mouseNDC.x * 0.34;
    const pitchOff = mouseNDC.y * 0.22;
    const camPos = new THREE.Vector3(
      this.position.x + 0.55 + Math.sin(yawOff) * 0.3,
      this.position.y + 1.72 + (moving ? Math.sin(time * 8) * 0.025 : 0),
      this.position.z + 2.1
    );
    this.camera.position.lerp(camPos, 0.25);
    const lookAt = new THREE.Vector3(
      this.position.x + Math.sin(yawOff) * 14,
      this.position.y + 1.55 + Math.sin(pitchOff) * 9 + this.recoil * 0.5,
      this.position.z - 14
    );
    this.camera.lookAt(lookAt);

    // 枪口微动 + 换弹下沉
    const reloadDip = this.reloading > 0 ? 0.16 : 0;
    this.gun.position.set(
      0.22,
      -0.18 - reloadDip + Math.sin(time * 7.7) * 0.004 + this.recoil * 0.03,
      -0.55 + this.recoil * 0.07
    );
    this.gun.rotation.x = this.recoil * 0.22 - reloadDip * 1.6;

    // 手电跟随准星
    this.flashlight.position.copy(this.camera.position);
    this.flashlight.target.position.copy(lookAt);
  }
}
