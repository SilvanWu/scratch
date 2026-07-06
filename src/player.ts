import * as THREE from 'three';
import { AudioFX } from './audio';
import { WeaponDef } from './items';

// 玩家载具：第三人称全身角色 + 越肩相机（自动前进，策划案"通用规则"）
// V6：第三人称可见全身；hip 模式纵览，ADS（按住）模式收紧 FOV 中心瞄准。
export class PlayerRig {
  position: THREE.Vector3 = new THREE.Vector3(0, 0, 2);
  hp: number = 100;
  maxHp: number = 100;
  sanity: number = 60;
  maxSanity: number = 60;
  coins: number = 0;       // 本局战利品
  damageMult: number = 1;  // 强化弹药加成
  dmgTakenMult: number = 1; // 受伤倍率（契约代价）
  headshotMult: number = 1; // 爆头额外倍率（神枪手祝福）
  alive: boolean = true;

  // 双武器（Q切换）
  weapons: WeaponDef[] = [];
  weaponIndex: number = 0;
  private ammoBy: number[] = [];
  reloading: number = 0;
  private fireCooldown: number = 0;
  private reserveCache: number = 0;   // 当前帧的备用子弹（由 update 传入）
  reloadDrew: number = 0;             // 本帧换弹从储备实际取出的数量（由 game 扣除）

  camera: THREE.PerspectiveCamera;
  rig: THREE.Group;                       // 角色全身（世界坐标，整体旋转=调整水平瞄准）
  private upperBody!: THREE.Group;        // 上半身（绕腰部俯仰=调整垂直瞄准/弯腰）
  private readonly waistY: number = 0.95; // 上半身旋转支点高度
  muzzlePos: THREE.Vector3 = new THREE.Vector3();  // 枪口世界坐标（曳光起点）
  aiming: boolean = false;                // 当前是否处于 ADS
  readonly hipFov: number = 68;
  readonly adsFov: number = 58;   // 瞄准时收缩更少，保留更多视野
  private aimTarget: THREE.Vector3 | null = null;  // 自动瞄准目标（身体）
  private faceYaw: number = 0;            // 整体朝向（水平）
  private facePitch: number = 0;          // 上半身俯仰（垂直瞄准）
  // 相对瞄准：进入瞄准时把准星对准点击方向作为基准，之后按相对位移偏转
  private aimBaseYaw: number = 0;
  private aimBasePitch: number = 0;
  private aimAnchor: THREE.Vector2 = new THREE.Vector2();  // 进入瞄准时的光标NDC基准
  private aimJustEntered: boolean = false;                 // 进入瞄准首帧（相机瞬切，不滑动）
  aimSensitivity: number = 0.8;            // 瞄准灵敏度（默认为原来的80%，暂停界面可调）

  private gun: THREE.Group;
  private muzzleFlash: THREE.PointLight;
  private flashlight: THREE.SpotLight;
  private recoil: number = 0;
  walkSpeed: number = 3.2;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, weapons: WeaponDef[]) {
    this.camera = camera;
    this.weapons = weapons;
    this.ammoBy = weapons.map((w) => w.magSize);

    // 手电筒（核心微恐光源）
    this.flashlight = new THREE.SpotLight(0xfff2d9, 28, 26, 0.42, 0.45, 1.4);
    scene.add(this.flashlight);
    scene.add(this.flashlight.target);

    // ===== 第三人称角色（朝向 -Z 为正面）=====
    // rig = 整体（脚/髋 + 上半身），rig.rotation.y 控制整体水平朝向
    // upperBody = 上半身（绕腰部支点），upperBody.rotation.x 控制弯腰/俯仰瞄准
    this.rig = new THREE.Group();
    this.upperBody = new THREE.Group();
    this.upperBody.position.y = this.waistY;   // 腰部支点
    const u = this.waistY;                       // 上半身内部坐标 = 世界局部高度 - 支点

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8b48c, roughness: 0.8 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x3a241a, roughness: 0.9 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0xe9e3d6, roughness: 0.75 });
    const pantMat = new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.85 });
    const gearMat = new THREE.MeshStandardMaterial({ color: 0x4a4636, roughness: 0.7, metalness: 0.2 });

    // 躯干（上半身）
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.2), topMat);
    torso.position.y = 1.18 - u;
    this.upperBody.add(torso);
    // 髋（下半身，留在 rig）
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.2), pantMat);
    hips.position.y = 0.86;
    this.rig.add(hips);
    // 头 + 马尾（上半身）
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skinMat);
    head.position.y = 1.6 - u;
    this.upperBody.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 8), hairMat);
    hair.position.set(0, 1.63 - u, 0.02);
    hair.scale.set(1, 1, 1.05);
    this.upperBody.add(hair);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.02, 0.35, 6), hairMat);
    tail.position.set(0, 1.5 - u, 0.16);
    tail.rotation.x = 0.5;
    this.upperBody.add(tail);
    // 背包（上半身）
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.14), gearMat);
    pack.position.set(0, 1.2 - u, 0.17);
    this.upperBody.add(pack);
    // 腿（下半身，留在 rig）
    const legGeo = new THREE.BoxGeometry(0.12, 0.6, 0.14);
    const legL = new THREE.Mesh(legGeo, pantMat);
    legL.position.set(-0.09, 0.45, 0);
    const legR = legL.clone();
    legR.position.x = 0.09;
    this.rig.add(legL, legR);
    // 左臂（扶枪，上半身）
    const armGeo = new THREE.BoxGeometry(0.1, 0.34, 0.1);
    const armL = new THREE.Mesh(armGeo, skinMat);
    armL.position.set(-0.2, 1.2 - u, -0.16);
    armL.rotation.x = -1.1;
    this.upperBody.add(armL);
    // 右臂（持枪，上半身）
    const armR = new THREE.Mesh(armGeo, skinMat);
    armR.position.set(0.2, 1.2 - u, -0.14);
    armR.rotation.x = -1.0;
    this.upperBody.add(armR);

    // 枪（挂在上半身，枪口朝 -Z）
    this.gun = new THREE.Group();
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x2c2c33, metalness: 0.7, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.34), gunMat);
    this.gun.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.26);
    this.gun.add(barrel);
    this.gun.position.set(0.16, 1.2 - u, -0.28);
    this.upperBody.add(this.gun);

    this.muzzleFlash = new THREE.PointLight(0xffcc66, 0, 4, 2);
    this.muzzleFlash.position.set(0, 0.03, -0.4);
    this.gun.add(this.muzzleFlash);

    this.rig.add(this.upperBody);
    this.rig.position.copy(this.position);
    scene.add(this.rig);
    scene.add(camera);
  }

  get weapon(): WeaponDef {
    return this.weapons[this.weaponIndex];
  }
  get ammo(): number {
    return this.ammoBy[this.weaponIndex];
  }
  set ammo(v: number) {
    this.ammoBy[this.weaponIndex] = v;
  }
  get magSize(): number {
    return this.weapon.magSize;
  }
  get reloadTime(): number {
    return this.weapon.reloadTime;
  }
  get baseDamage(): number {
    return this.weapon.damage;
  }

  // 自动瞄准目标（身体世界坐标），null 表示无目标
  setAimTarget(p: THREE.Vector3 | null): void {
    this.aimTarget = p;
  }

  // 当前整体水平朝向（供自动射击的朝向闸门判断）
  get yaw(): number {
    return this.faceYaw;
  }

  // 进入瞄准：准星(屏幕中心)立即对准点击方向(baseYaw/basePitch)，并以光标NDC为基准做相对偏移
  enterAim(baseYaw: number, basePitch: number, anchorNDC: THREE.Vector2): void {
    this.aimBaseYaw = baseYaw;
    this.aimBasePitch = basePitch;
    this.aimAnchor.copy(anchorNDC);
    this.faceYaw = baseYaw;     // 瞬时对准点击位置，无跳变
    this.facePitch = basePitch;
    this.aimJustEntered = true;
  }

  switchWeapon(audio: AudioFX): void {
    if (this.weapons.length < 2) return;
    this.weaponIndex = (this.weaponIndex + 1) % this.weapons.length;
    this.reloading = 0;
    this.fireCooldown = 0.25;
    audio.reloadEnd();
  }

  // 直接切换到指定武器（触屏按钮）
  equipWeapon(i: number, audio: AudioFX): void {
    if (i < 0 || i >= this.weapons.length || i === this.weaponIndex) return;
    this.weaponIndex = i;
    this.reloading = 0;
    this.fireCooldown = 0.25;
    audio.reloadEnd();
  }

  // 背包武器栏变更时，重设当前可用武器（弹匣按容量补满；空则由调用方传入手枪兜底）
  setWeapons(defs: WeaponDef[]): void {
    this.weapons = defs.slice();
    this.ammoBy = this.weapons.map((w) => w.magSize);
    if (this.weaponIndex >= this.weapons.length) this.weaponIndex = 0;
    this.reloading = 0;
    this.fireCooldown = 0;
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
    this.fireCooldown = this.weapon.fireInterval;
    this.recoil = this.weapon.pellets > 1 ? 1.6 : 1;
    this.muzzleFlash.intensity = 8;
    audio.gunshot();
    if (this.weapon.pellets > 1) audio.gunshot();
    if (this.ammo <= 0) this.startReload(audio);
    return true;
  }

  startReload(audio: AudioFX): void {
    if (this.reloading > 0 || this.ammo >= this.magSize) return;
    if (this.reserveCache <= 0) return;   // 没有备用子弹则无法换弹
    this.reloading = this.reloadTime;
    audio.reloadStart();
  }

  // 是否还有备用子弹（供 UI/提示判断）
  get hasReserve(): boolean {
    return this.reserveCache > 0;
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.hp -= amount * this.dmgTakenMult;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  heal(v: number): void {
    this.hp = Math.min(this.maxHp, this.hp + v);
  }
  addSanity(v: number): void {
    this.sanity = Math.max(0, Math.min(this.maxSanity, this.sanity + v));
  }
  // 消耗品造成的生命变化：下限保到 1（喝药不会致死），上限为 maxHp
  changeHp(v: number): void {
    this.hp = Math.max(1, Math.min(this.maxHp, this.hp + v));
  }

  update(
    dt: number, moving: boolean, mouseNDC: THREE.Vector2,
    audio: AudioFX, time: number, aiming: boolean, reserve: number
  ): void {
    this.aiming = aiming;
    this.reserveCache = reserve;
    this.reloadDrew = 0;

    if (moving && this.alive) {
      this.position.z -= this.walkSpeed * dt;
    }

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        // 从备用子弹库存中补充弹匣（消耗背包子弹，而非无限）
        const need = this.magSize - this.ammo;
        const take = Math.max(0, Math.min(need, reserve));
        this.ammoBy[this.weaponIndex] += take;
        this.reloadDrew = take;
        audio.reloadEnd();
      }
    }
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.muzzleFlash.intensity = Math.max(0, this.muzzleFlash.intensity - dt * 60);

    // ===== 朝向：整体水平旋转(faceYaw) + 上半身俯仰(facePitch) =====
    // 模型正面为 -Z，绕 Y 旋转 φ 时 -Z 轴 → (-sinφ, 0, -cosφ)，
    // 要让正面指向 (dx,dz) 需 φ = atan2(-dx, -dz)。
    let targetYaw = 0;
    let targetPitch = 0;
    if (aiming) {
      // 相对瞄准：以进入瞄准时的点击方向(aimBase*)为基准，光标相对位移产生视角偏移
      const dxn = mouseNDC.x - this.aimAnchor.x;
      const dyn = mouseNDC.y - this.aimAnchor.y;
      const s = this.aimSensitivity;
      targetYaw = this.aimBaseYaw - dxn * 1.5 * s;            // 左右相对偏转（按灵敏度）
      targetPitch = this.aimBasePitch + (dyn >= 0 ? dyn * 1.05 : dyn * 0.5) * s;  // 上下相对偏转
      targetPitch = Math.max(-0.7, Math.min(1.0, targetPitch));
    } else if (this.aimTarget) {
      // 自动瞄准：整体转身正对目标，上半身俯仰对准目标高度
      const dx = this.aimTarget.x - this.position.x;
      const dz = this.aimTarget.z - this.position.z;
      targetYaw = Math.atan2(-dx, -dz);
      const horiz = Math.max(0.5, Math.hypot(dx, dz));
      const dy = this.aimTarget.y - (this.position.y + 1.2); // 相对枪口高度
      targetPitch = Math.max(-0.5, Math.min(0.5, Math.atan2(dy, horiz)));
    }
    // 平滑转身（取最短弧）
    let dyaw = targetYaw - this.faceYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.faceYaw += dyaw * Math.min(1, dt * 12);
    // 平滑俯仰（弯腰瞄准）
    this.facePitch += (targetPitch - this.facePitch) * Math.min(1, dt * 12);

    const bob = moving ? Math.abs(Math.sin(time * 8)) * 0.03 : 0;
    this.rig.position.set(this.position.x, this.position.y + bob, this.position.z);
    this.rig.rotation.y = this.faceYaw;
    this.upperBody.rotation.x = this.facePitch;
    this.rig.updateMatrixWorld(true);
    this.gun.getWorldPosition(this.muzzlePos);

    // ===== 相机 =====
    let camPos: THREE.Vector3;
    let lookAt: THREE.Vector3;
    if (aiming) {
      // 操控中：相机沿“瞄准方向(含俯仰)”环绕角色——相机俯仰角=上半身俯仰(facePitch)，
      // 相机始终在支点(肩部)后方固定距离，抬头/低头只改变环绕角度，玩家恒在画面内；
      // 相机视口中心射线与枪口指向(同为 fwd)重合。
      const yaw = this.faceYaw;
      const pitch = this.facePitch;                 // 与枪口共用同一俯仰
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      // 瞄准前向（含俯仰）：上抬时 y 为正
      const fwd = new THREE.Vector3(-Math.sin(yaw) * cp, sp, -Math.cos(yaw) * cp);
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));  // 角色右方
      // 支点：肩部高度，偏右肩 → 角色显示在画面左侧
      const pivot = new THREE.Vector3(this.position.x, this.position.y + 1.5, this.position.z)
        .addScaledVector(right, 0.5);
      camPos = pivot.clone().addScaledVector(fwd, -3.5);   // 沿瞄准方向退到角色身后（拉远，看见更多场景）
      camPos.y = Math.max(camPos.y, this.position.y + 0.3); // 防止极端抬头时相机入地
      lookAt = pivot.clone().addScaledVector(fwd, 12);     // 沿瞄准方向看出去
    } else {
      // 未操控：固定俯瞰，角色恒定位于画面左下角
      // （镜头偏到角色右侧 → 角色靠左；镜头抬高且视线前移上抬 → 角色靠下）
      camPos = new THREE.Vector3(
        this.position.x + 0.9,
        this.position.y + 2.85,
        this.position.z + 4.4
      );
      lookAt = new THREE.Vector3(
        this.position.x + 0.9,
        this.position.y + 2.35,
        this.position.z - 10
      );
    }
    // 瞄准时相机更紧地跟随角色朝向（与角色旋转同步，减少旋转时的相对抖动/漂移感）
    // 进入瞄准首帧瞬切到位（不滑动），之后平滑跟随
    this.camera.position.lerp(camPos, this.aimJustEntered ? 1 : (aiming ? 0.4 : 0.18));
    this.aimJustEntered = false;
    this.camera.lookAt(lookAt);

    // FOV 平滑过渡（ADS 拉近）
    const targetFov = aiming ? this.adsFov : this.hipFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.2) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();
    }

    // 枪械后座微动
    this.gun.position.set(0.16, 1.2 - this.waistY, -0.28 + this.recoil * 0.04);

    // 手电跟随视线
    this.flashlight.position.set(camPos.x, camPos.y, camPos.z);
    this.flashlight.target.position.copy(lookAt);
  }
}
