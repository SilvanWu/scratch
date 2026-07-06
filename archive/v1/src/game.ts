import * as THREE from 'three';
import { Input } from './input';
import { AudioFX } from './audio';
import { Meta } from './meta';
import { rollLoot } from './loot';
import { Dungeon, Room, RoomType, ROOM_INFO } from './rooms';
import { ZombieManager, Zombie } from './enemy';
import { PlayerRig } from './player';
import { HUD } from './hud';

// 单局状态机（策划案"通用规则"：移动/战斗/选择/搜索 4状态）
type GameState = 'moving' | 'combat' | 'search' | 'choice' | 'extract' | 'over';

const STATE_LABEL: Record<string, string> = {
  moving: '▶ 前进中…',
  combat: '⚔ 战斗！消灭所有敌人',
  search: '🔍 搜索中（点击箱子）',
  choice: '🚪 选择路线',
  extract: '🟢 撤离点',
  over: '',
};

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock = new THREE.Clock();
  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  private input: Input;
  private audio: AudioFX;
  private meta: Meta;
  private dungeon: Dungeon;
  private zombies: ZombieManager;
  private player: PlayerRig;
  private hud: HUD;

  private state: GameState = 'moving';
  private currentRoom: Room | null = null;
  private enteredDepth: number = 0;       // 已触发入场逻辑的最大深度
  private triggeredDepth: number = 0;     // 已触发中心事件的最大深度
  private pendingChoice: RoomType[] | null = null;
  private kills: number = 0;
  private searchTarget: THREE.Mesh | null = null;
  private searchProgress: number = 0;
  private tracers: { mesh: THREE.Mesh; age: number }[] = [];

  constructor(canvas: HTMLCanvasElement, meta: Meta, audio: AudioFX) {
    this.meta = meta;
    this.audio = audio;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false; // 微恐场景靠点光，省掉阴影开销

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07060a);
    this.scene.fog = new THREE.Fog(0x07060a, 8, 30);
    // 极弱环境光（黑暗为主）
    this.scene.add(new THREE.AmbientLight(0x44404a, 0.35));

    this.camera = new THREE.PerspectiveCamera(
      62, window.innerWidth / window.innerHeight, 0.05, 80
    );
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.input = new Input(canvas);
    this.dungeon = new Dungeon(this.scene);
    this.zombies = new ZombieManager(this.scene);
    this.player = new PlayerRig(this.scene, this.camera);
    this.hud = new HUD();

    this.hud.onSkipSearch = () => this.finishSearch();
    this.hud.onChoice = (t: RoomType) => {
      this.pendingChoice = null;
      const room = this.dungeon.append(t);
      this.audio.doorOpen();
      this.state = 'moving';
    };
    this.hud.onExtract = (leave: boolean) => {
      if (leave) {
        this.endRun(true, '撤离成功');
      } else {
        this.hud.showToast('继续深入……更危险，也更富有');
        this.state = 'moving';
      }
    };

    // 起始：一条回廊 + 第一间房
    this.dungeon.append('corridor');
    this.appendNext();
    this.meta.data.runs += 1;
    this.meta.save();
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // 生成下一个房间（单选直接放，双选挂起）
  private appendNext(): void {
    const options = this.dungeon.nextOptions();
    if (options.length === 1) {
      this.dungeon.append(options[0]);
    } else {
      this.pendingChoice = options;
    }
  }

  private roomAt(z: number): Room | null {
    for (const r of this.dungeon.rooms) {
      if (z <= r.zEntry && z > r.zExit) return r;
    }
    return null;
  }

  private endRun(extracted: boolean, title: string): void {
    this.state = 'over';
    const c = this.player.coins;
    const depth = this.dungeon.currentDepth;
    if (extracted) {
      this.meta.data.bank += c;
      this.meta.data.extracts += 1;
      this.audio.extractOk();
    } else {
      this.audio.death();
    }
    if (depth > this.meta.data.bestDepth) this.meta.data.bestDepth = depth;
    this.meta.save();
    const lines = extracted
      ? [`带出战利品：🪙 ${c}`, `探索深度：${depth} 个房间`, `击杀：${this.kills}`, `金库总额：🪙 ${this.meta.data.bank}`]
      : [`损失战利品：🪙 ${c}（搜打撤的代价）`, `探索深度：${depth} 个房间`, `击杀：${this.kills}`, `金库总额：🪙 ${this.meta.data.bank}`];
    this.hud.showEnd(extracted, title, lines);
  }

  // ===== 射击 =====
  private tryShoot(): void {
    if (!this.player.canFire()) {
      if (this.player.ammo <= 0 && this.player.reloading <= 0) this.player.fire(this.audio);
      return;
    }
    this.player.fire(this.audio);

    this.raycaster.setFromCamera(this.input.mouseNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.zombies.targets(), false);

    // 弹道光线
    const start = new THREE.Vector3(
      this.camera.position.x + 0.2, this.camera.position.y - 0.1, this.camera.position.z - 0.5
    );
    const end = hits.length > 0
      ? hits[0].point.clone()
      : this.raycaster.ray.at(30, new THREE.Vector3());
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const len = start.distanceTo(end);
    const tracer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, len, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85 })
    );
    tracer.position.copy(mid);
    tracer.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()
    );
    this.scene.add(tracer);
    this.tracers.push({ mesh: tracer, age: 0 });

    if (hits.length > 0) {
      const obj = hits[0].object;
      const z = obj.userData.zombie as Zombie;
      const part = obj.userData.part as string;
      const result = z.takeDamage(
        Math.round(this.player.baseDamage * this.player.damageMult), part
      );
      this.hud.showHitmarker(result.headshot);
      this.hud.floatText(
        hits[0].point, `${result.dmg}`, result.headshot ? 'head' : 'dmg'
      );
      if (result.headshot) this.audio.headshot();
      else this.audio.hit();
      if (result.killed) {
        this.audio.zombieDie();
        this.kills += 1;
        const c = 2 + Math.floor(Math.random() * 3);
        this.player.coins += c;
        this.hud.floatText(z.mesh.position.clone().setY(1.2), `+${c}🪙`, 'coin');
      }
    }
  }

  // ===== 搜索 =====
  private trySearchClick(): void {
    if (!this.currentRoom) return;
    this.raycaster.setFromCamera(this.input.mouseNDC, this.camera);
    const crates = this.currentRoom.crates.filter((c) => !c.userData.searched);
    const hits = this.raycaster.intersectObjects(crates, false);
    if (hits.length > 0) {
      this.searchTarget = hits[0].object as THREE.Mesh;
      this.searchProgress = 0;
      this.hud.showSearchPanel('搜索中…');
    }
  }

  private finishSearch(): void {
    this.hud.hideSearchPanel();
    this.searchTarget = null;
    this.state = 'moving';
    this.hud.setPrompt(null);
  }

  private applyLoot(): void {
    const loot = rollLoot(this.dungeon.currentDepth);
    this.audio.loot();
    if (loot.coins > 0) this.audio.coin();
    this.player.coins += loot.coins;
    if (loot.hp > 0) this.player.heal(loot.hp);
    if (loot.sanity > 0) this.player.addSanity(loot.sanity);
    if (loot.ammoBoost) this.player.damageMult += 0.1;
    this.hud.showToast(`${loot.icon} ${loot.name}`);
  }

  // ===== 房间事件 =====
  private onEnterRoom(room: Room): void {
    this.enteredDepth = room.depth;
    // 神智消耗（策划案"神智"节）
    const cost = 3 + Math.floor(room.depth / 5);
    this.player.sanity -= cost;
    this.audio.sanityHit();
    this.hud.floatText(
      new THREE.Vector3(this.player.position.x, 2.6, this.player.position.z - 2),
      `神智 -${cost}`, 'sanity'
    );
    if (this.player.sanity <= 0) {
      this.player.sanity = 0;
      this.endRun(true, '神智崩溃 — 强制撤离');
      return;
    }
    // 提前生成后续房间
    if (!this.pendingChoice && room.depth >= this.dungeon.currentDepth) {
      this.appendNext();
    }
  }

  private onRoomCenter(room: Room): void {
    this.triggeredDepth = room.depth;
    const w = room.type === 'corridor' ? 5 : 11;
    if (room.type === 'combat') {
      const count = 3 + Math.floor(room.depth / 3) + Math.floor(Math.random() * 2);
      this.zombies.spawnWave(room.zCenter, room.zExit + 1.5, w, room.depth, count);
      this.audio.zombieGroan(0.1);
      this.state = 'combat';
    } else if (room.type === 'corridor') {
      if (Math.random() < 0.35) {
        this.zombies.spawnWave(room.zCenter, room.zExit + 1, w, room.depth, 1 + Math.floor(Math.random() * 2));
        this.audio.zombieGroan(0.09);
        this.state = 'combat';
      }
    } else if (room.type === 'treasure') {
      this.state = 'search';
      this.hud.setPrompt('点击箱子搜索战利品，或点"继续前进"');
      this.hud.showSearchPanel('点击箱子开始搜索');
      this.hud.setSearchProgress(0);
    } else if (room.type === 'altar') {
      const r = Math.random();
      if (r < 0.4) {
        this.player.damageMult += 0.15;
        this.hud.showToast('🔮 祭坛赐福：伤害 +15%');
      } else if (r < 0.7) {
        this.player.heal(40);
        this.hud.showToast('🔮 祭坛赐福：生命 +40');
      } else {
        this.player.addSanity(18);
        this.hud.showToast('🔮 祭坛赐福：神智 +18');
      }
      this.audio.altar();
    } else if (room.type === 'extract') {
      this.state = 'extract';
      this.hud.showExtractDialog(this.player.coins);
    }
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;

    this.audio.updateAmbient(dt, this.player.sanity / this.player.maxSanity);
    this.dungeon.flicker(time);

    // 弹道衰减
    for (const t of this.tracers) {
      t.age += dt;
      (t.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - t.age / 0.09));
    }
    const oldT = this.tracers.filter((t) => t.age > 0.09);
    for (const t of oldT) {
      this.scene.remove(t.mesh);
      (t.mesh.material as THREE.Material).dispose();
      t.mesh.geometry.dispose();
    }
    this.tracers = this.tracers.filter((t) => t.age <= 0.09);

    if (this.state !== 'over') {
      // R 主动换弹
      if (this.input.wasPressed('KeyR')) this.player.startReload(this.audio);

      const moving = this.state === 'moving';
      this.player.update(dt, moving, this.input.mouseNDC, this.audio, time);

      // 房间检测
      const room = this.roomAt(this.player.position.z);
      if (room) {
        this.currentRoom = room;
        if (room.depth > this.enteredDepth) this.onEnterRoom(room);
        if (
          this.state === 'moving' &&
          room.depth > this.triggeredDepth &&
          this.player.position.z <= room.zCenter
        ) {
          this.onRoomCenter(room);
        }
        // 岔路：走到出口处弹选择
        if (
          this.state === 'moving' && this.pendingChoice &&
          room.depth >= this.dungeon.currentDepth &&
          this.player.position.z <= room.zExit + 1.6
        ) {
          this.state = 'choice';
          this.hud.showChoice(this.pendingChoice);
        }
      }

      // 战斗
      if (this.state === 'combat' || this.zombies.zombies.length > 0) {
        const attacks = this.zombies.update(dt, time, this.player.position, this.audio);
        for (let i = 0; i < attacks; i++) {
          this.player.takeDamage(8 + Math.floor(this.dungeon.currentDepth / 4));
        }
        if (this.state === 'combat' && this.zombies.aliveCount === 0 && this.zombies.zombies.length === 0) {
          this.state = 'moving';
          if (this.currentRoom) this.currentRoom.cleared = true;
          this.hud.showToast('✅ 区域安全，继续前进');
        }
      }

      // 射击（战斗/移动状态下点击）
      if ((this.state === 'combat' || this.state === 'moving') && this.input.isFiring()) {
        this.tryShoot();
      }

      // 搜索
      if (this.state === 'search') {
        if (this.input.consumeClick() && !this.searchTarget) {
          this.trySearchClick();
        }
        if (this.searchTarget) {
          this.searchProgress += dt / 1.3;
          this.hud.setSearchProgress(this.searchProgress);
          if (Math.floor(this.searchProgress * 10) !== Math.floor((this.searchProgress - dt / 1.3) * 10)) {
            this.audio.searchTick();
          }
          if (this.searchProgress >= 1) {
            this.searchTarget.userData.searched = true;
            (this.searchTarget.material as THREE.MeshStandardMaterial).color.setHex(0x3a3a3a);
            if (this.currentRoom) this.currentRoom.searched += 1;
            this.applyLoot();
            this.searchTarget = null;
            this.hud.showSearchPanel('点击下一个箱子，或继续前进');
            this.hud.setSearchProgress(0);
            // 全部搜完自动继续
            if (this.currentRoom && this.currentRoom.searched >= this.currentRoom.crates.length) {
              this.finishSearch();
              this.hud.showToast('箱子已搜空，继续前进');
            }
          }
        }
      }

      // 死亡
      if (!this.player.alive && this.state !== 'over') {
        this.endRun(false, 'YOU DIED — 战利品全部丢失');
      }
    }

    this.input.endFrame();

    this.hud.update(
      dt, this.player.hp, this.player.maxHp,
      this.player.sanity, this.player.maxSanity,
      this.player.ammo, this.player.magSize, this.player.reloading, this.player.reloadTime,
      this.player.coins, this.dungeon.currentDepth,
      STATE_LABEL[this.state], this.input.mousePx
    );
    this.hud.updateFloaters(dt, this.camera);

    this.renderer.render(this.scene, this.camera);
  }
}
