import * as THREE from 'three';
import { Input } from './input';
import { AudioFX } from './audio';
import { Meta } from './meta';
import { Backpack, rollSearchDrop, TreasureItem, CONSUMABLE_INFO, ConsumableKind, RARITY_INFO, RELICS } from './items';
import { Dungeon, Room, RoomType, themeForDepth } from './rooms';
import { ZombieManager, Zombie } from './enemy';
import { PlayerRig, WeaponDef } from './player';
import { TombBoss } from './boss';
import { Assistant } from './assistant';
import { HUD } from './hud';

type GameState = 'moving' | 'combat' | 'search' | 'choice' | 'extract' | 'intel' | 'bagfull' | 'over';

const STATE_LABEL: Record<string, string> = {
  moving: '▶ 前进中…',
  combat: '⚔ 战斗！消灭所有敌人',
  search: '🔍 搜索中（点击箱子）',
  choice: '🚪 选择路线',
  extract: '🟢 撤离点',
  intel: '📋 情报',
  bagfull: '🎒 背包已满',
  over: '',
};

const KIND_NAMES: Record<string, string> = {
  normal: '食尸鬼', fast: '开膛手', ranged: '追踪者',
  heavy: '再生者', psychic: '无形之子', elite: '巨人',
};

interface EnemyShot {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  dead: boolean;
}

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
  private boss: TombBoss | null = null;
  private assistant: Assistant | null = null;
  private hud: HUD;
  private bag: Backpack = new Backpack();

  private state: GameState = 'moving';
  private currentRoom: Room | null = null;
  private enteredDepth: number;
  private triggeredDepth: number;
  private pendingChoice: RoomType[] | null = null;
  private pendingItem: TreasureItem | null = null;
  private kills: number = 0;
  private searchTarget: THREE.Mesh | null = null;
  private searchProgress: number = 0;
  private tracers: { mesh: THREE.Mesh; age: number }[] = [];
  private enemyShots: EnemyShot[] = [];
  private explosions: { mesh: THREE.Mesh; age: number }[] = [];
  private shownChapterIntro: number = -1;

  constructor(canvas: HTMLCanvasElement, meta: Meta, audio: AudioFX, startDepth: number) {
    this.meta = meta;
    this.audio = audio;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07060a);
    this.scene.fog = new THREE.Fog(0x07060a, 8, 30);
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
    this.dungeon = new Dungeon(this.scene, startDepth);
    this.enteredDepth = startDepth;
    this.triggeredDepth = startDepth;
    this.zombies = new ZombieManager(this.scene);
    this.zombies.onRangedShoot = (origin: THREE.Vector3) => this.spawnEnemyShot(origin);

    // 武器装配（军械库改装生效，策划案"武器"）
    const weapons: WeaponDef[] = [{
      name: '手枪', icon: '🔫',
      damage: 8 + meta.data.pistolDmgLv * 2,
      magSize: 12 + meta.data.magLv * 4,
      reloadTime: 1.15, fireInterval: 0.22, pellets: 1, spread: 0,
    }];
    if (meta.data.shotgunOwned) {
      weapons.push({
        name: '霰弹枪', icon: '💥',
        damage: 6 + meta.data.pistolDmgLv,
        magSize: 5 + meta.data.magLv,
        reloadTime: 1.8, fireInterval: 0.8, pellets: 6, spread: 0.05,
      });
    }
    this.player = new PlayerRig(this.scene, this.camera, weapons);

    if (meta.data.assistantOwned) {
      this.assistant = new Assistant(this.scene);
    }

    this.hud = new HUD();
    this.hud.updateWeapon(this.player.weapon.icon, this.player.weapon.name);
    this.hud.updateSkill(!!this.assistant, this.assistant ? this.assistant.charges : 0);

    this.hud.onSkipSearch = () => this.finishSearch();
    this.hud.onChoice = (t: RoomType) => {
      this.pendingChoice = null;
      this.dungeon.append(t);
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
    this.hud.onBagDecision = (replace: boolean) => {
      if (this.pendingItem) {
        if (replace) {
          const dropped = this.bag.replaceLowest(this.pendingItem);
          this.hud.showToast(`换入 ${this.pendingItem.icon}${this.pendingItem.name}，丢弃 ${dropped ? dropped.name : ''}`);
        } else {
          this.hud.showToast(`放弃了 ${this.pendingItem.icon}${this.pendingItem.name}`);
        }
        this.pendingItem = null;
      }
      this.state = 'search';
    };
    this.hud.onIntelContinue = () => {
      this.state = 'moving';
    };

    this.dungeon.append('corridor');
    this.appendNext();
    this.meta.data.runs += 1;
    this.meta.save();

    // 章节剧情引导（策划案"章节"：主题包装+简易剧情）
    const theme = themeForDepth(startDepth + 1);
    this.shownChapterIntro = Math.floor(startDepth / 30);
    this.state = 'intel';
    this.hud.showIntel(
      `<b style="color:#ffd24d; font-size:19px">${theme.name}</b><br><br>${theme.story}` +
      (startDepth > 0 ? `<br><br>🏕️ 从安全屋出发（深度 ${startDepth}）` : '')
    );
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.tick());
  }

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
    const v = this.bag.totalValue;
    const depth = this.dungeon.currentDepth;
    if (extracted) {
      this.meta.data.bank += v;
      this.meta.data.extracts += 1;
      this.audio.extractOk();
    } else {
      this.audio.death();
    }
    if (depth > this.meta.data.bestDepth) this.meta.data.bestDepth = depth;
    this.meta.save();
    const itemList = this.bag.items.map((i) => `${i.icon}`).join(' ') || '（空）';
    const lines = extracted
      ? [`带出战利品：${itemList}`, `总价值：💰 ${v}`, `探索深度：${depth} ｜ 击杀：${this.kills}`, `金库总额：💰 ${this.meta.data.bank}`]
      : [`损失战利品：${itemList}（价值 ${v}）`, `探索深度：${depth} ｜ 击杀：${this.kills}`, `金库总额：💰 ${this.meta.data.bank}`];
    this.hud.showEnd(extracted, title, lines);
  }

  private spawnEnemyShot(origin: THREE.Vector3): void {
    const target = new THREE.Vector3(
      this.player.position.x, this.player.position.y + 1.4, this.player.position.z
    );
    const dir = target.sub(origin).normalize();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x66ccff })
    );
    mesh.position.copy(origin);
    // 散布一点
    mesh.position.x += (Math.random() - 0.5) * 0.6;
    this.scene.add(mesh);
    this.enemyShots.push({ mesh, velocity: dir.multiplyScalar(9), life: 4, dead: false });
    this.audio.searchTick();
  }

  private useConsumable(kind: ConsumableKind): void {
    if (!this.bag.useConsumable(kind)) {
      this.hud.showToast(`${CONSUMABLE_INFO[kind].icon} 没有${CONSUMABLE_INFO[kind].name}了`);
      return;
    }
    if (kind === 'med') {
      this.player.heal(35);
      this.hud.showToast('🩹 +35 生命');
      this.audio.loot();
    } else if (kind === 'sedative') {
      this.player.addSanity(15);
      this.hud.showToast('💊 +15 神智');
      this.audio.loot();
    } else {
      this.throwGrenade();
    }
  }

  private throwGrenade(): void {
    this.raycaster.setFromCamera(this.input.mouseNDC, this.camera);
    const targets = this.allTargets();
    const hits = this.raycaster.intersectObjects(targets, false);
    const point = hits.length > 0
      ? hits[0].point.clone()
      : this.raycaster.ray.at(10, new THREE.Vector3()).setY(0.3);

    const boom = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.9 })
    );
    boom.position.copy(point);
    this.scene.add(boom);
    this.explosions.push({ mesh: boom, age: 0 });
    this.audio.gunshot();
    this.audio.zombieDie();

    for (const z of this.zombies.zombies) {
      if (z.dead) continue;
      if (z.mesh.position.distanceTo(point) < 4.5) {
        const result = z.takeDamage(50, 'body');
        this.hud.floatText(z.mesh.position.clone().setY(1.4), `${result.dmg}`, 'dmg');
        if (result.killed) this.onKill(z);
      }
    }
    if (this.boss && !this.boss.dead && this.boss.mesh.position.distanceTo(point) < 5) {
      const result = this.boss.takeDamage(60, 'body');
      this.hud.floatText(this.boss.mesh.position.clone().setY(3), `${result.dmg}`, 'dmg');
      if (result.killed) this.onBossKilled();
    }
  }

  private onKill(z: Zombie): void {
    this.audio.zombieDie();
    this.kills += 1;
    if (z.kind === 'elite') {
      this.hud.showToast('💀 精英已击破！掉落珍贵战利品');
      for (let i = 0; i < 2; i++) {
        const drop = rollSearchDrop(this.dungeon.currentDepth + 8);
        if (drop.kind === 'treasure') this.tryAddItem(drop.item);
      }
    }
  }

  private onBossKilled(): void {
    if (!this.boss) return;
    this.kills += 1;
    const chapter = Math.ceil(this.dungeon.currentDepth / 30);
    if (chapter > this.meta.data.chaptersCleared) {
      this.meta.data.chaptersCleared = chapter;
      this.meta.save();
    }
    const relic = RELICS[(chapter - 1) % RELICS.length];
    const item: TreasureItem = { name: relic.name, icon: relic.icon, rarity: 'legend', value: relic.value };
    this.hud.hideBossBar();
    this.hud.showToast(`👑 ${this.boss.name} 已陨落！获得圣物`);
    this.audio.extractOk();
    this.tryAddItem(item);
    // BOSS房后直接给撤离选择
    this.state = 'extract';
    this.hud.showExtractDialog(this.bag.totalValue);
  }

  private tryAddItem(item: TreasureItem): void {
    const isNew = this.meta.collect(item.name); // 图鉴记录
    if (this.bag.add(item)) {
      this.hud.showToast(
        `${item.icon} ${item.name}（${RARITY_INFO[item.rarity].name}）价值 ${item.value}` +
        (isNew ? ' ｜ 📖 图鉴+1' : '')
      );
      return;
    }
    const low = this.bag.lowestItem();
    if (low && item.value > low.value) {
      this.pendingItem = item;
      this.state = 'bagfull';
      this.hud.showBagFull(item, low);
    } else {
      this.hud.showToast(`🎒 背包已满，放弃了 ${item.name}（价值低于包内物品）`);
    }
  }

  private allTargets(): THREE.Object3D[] {
    const t = this.zombies.targets();
    if (this.boss) return t.concat(this.boss.targets());
    return t;
  }

  // ===== 射击（支持霰弹多弹丸）=====
  private tryShoot(): void {
    if (!this.player.canFire()) {
      if (this.player.ammo <= 0 && this.player.reloading <= 0) this.player.fire(this.audio);
      return;
    }
    this.player.fire(this.audio);
    const weapon = this.player.weapon;
    const targets = this.allTargets();

    for (let p = 0; p < weapon.pellets; p++) {
      const ndc = this.input.mouseNDC.clone();
      if (weapon.pellets > 1) {
        ndc.x += (Math.random() - 0.5) * weapon.spread * 2;
        ndc.y += (Math.random() - 0.5) * weapon.spread * 2;
      }
      this.raycaster.setFromCamera(ndc, this.camera);
      const hits = this.raycaster.intersectObjects(targets, false);

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
        const part = obj.userData.part as string;
        const dmg = Math.round(this.player.baseDamage * this.player.damageMult);
        if (obj.userData.boss) {
          const result = (obj.userData.boss as TombBoss).takeDamage(dmg, part);
          this.hud.showHitmarker(result.headshot);
          this.hud.floatText(hits[0].point, `${result.dmg}`, result.headshot ? 'head' : 'dmg');
          if (result.headshot) this.audio.headshot();
          else this.audio.hit();
          if (result.killed) this.onBossKilled();
        } else if (obj.userData.zombie) {
          const z = obj.userData.zombie as Zombie;
          const result = z.takeDamage(dmg, part);
          this.hud.showHitmarker(result.headshot);
          this.hud.floatText(hits[0].point, `${result.dmg}`, result.headshot ? 'head' : 'dmg');
          if (result.headshot) this.audio.headshot();
          else this.audio.hit();
          if (result.killed) this.onKill(z);
        }
      }
    }
  }

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

  private applySearchDrop(): void {
    const drop = rollSearchDrop(this.dungeon.currentDepth);
    this.audio.loot();
    if (drop.kind === 'treasure') {
      this.tryAddItem(drop.item);
    } else if (drop.kind === 'consumable') {
      const info = CONSUMABLE_INFO[drop.con];
      if (this.bag.addConsumable(drop.con)) {
        this.hud.showToast(`${info.icon} ${info.name} ×1（按 ${info.key} 使用）`);
      } else {
        this.hud.showToast(`${info.icon} ${info.name}槽已满，留在了原地`);
      }
    } else {
      this.player.damageMult += 0.1;
      this.hud.showToast('🔫 强化弹药！伤害 +10%');
    }
  }

  private onEnterRoom(room: Room): void {
    this.enteredDepth = room.depth;
    const cost = 3 + Math.floor(room.depth / 5);
    this.player.sanity -= cost;
    this.audio.sanityHit();
    this.hud.floatText(
      new THREE.Vector3(this.player.position.x, 2.6, this.player.position.z - 2),
      `神智 -${cost}`, 'sanity'
    );
    // 助手被动：回神智
    if (this.assistant) {
      this.player.addSanity(this.assistant.sanityPerRoom);
    }
    if (this.player.sanity <= 0) {
      this.player.sanity = 0;
      this.endRun(true, '神智崩溃 — 强制撤离');
      return;
    }
    // 章节切换剧情
    const chapterIdx = Math.floor((room.depth - 1) / 30);
    if (chapterIdx > this.shownChapterIntro) {
      this.shownChapterIntro = chapterIdx;
      const theme = themeForDepth(room.depth);
      this.state = 'intel';
      this.hud.showIntel(
        `<b style="color:#ffd24d; font-size:19px">${theme.name}</b><br><br>${theme.story}`
      );
    }
    if (room.type === 'elite') {
      this.state = 'intel';
      this.hud.showIntel(
        `<b style="color:#ff5c5c">⚠ 前方探测到强大的生命反应</b><br><br>` +
        `敌情：<b>巨人</b> ×1，护甲厚重（瞄准头部！）<br>随从：若干食尸鬼<br><br>` +
        `建议：检查弹药，备好手雷（按3使用）`
      );
    } else if (room.type === 'boss') {
      const theme = themeForDepth(room.depth);
      this.state = 'intel';
      this.hud.showIntel(
        `<b style="color:#ff5c5c; font-size:18px">👹 BOSS 房间</b><br><br>` +
        `${theme.name.split(' · ')[1]}的主宰就在前方。<br>` +
        `半血后进入暴怒状态：冲锋更频繁、吐出腐蚀弹、召唤随从。<br><br>` +
        `<b style="color:#ffd24d">击败它获得章节圣物，并解锁下一章。</b>`
      );
    }
    if (!this.pendingChoice && room.depth >= this.dungeon.currentDepth) {
      this.appendNext();
    }
  }

  private onRoomCenter(room: Room): void {
    this.triggeredDepth = room.depth;
    const w = room.type === 'corridor' ? 5 : room.type === 'boss' ? 15 : 11;
    if (room.type === 'combat') {
      const count = 3 + Math.floor(room.depth / 3) + Math.floor(Math.random() * 2);
      const kinds = this.zombies.composition(room.depth, count);
      this.zombies.spawnWave(room.zCenter, room.zExit + 1.5, w, room.depth, kinds);
      const summary: Record<string, number> = {};
      for (const k of kinds) summary[k] = (summary[k] || 0) + 1;
      const txt = Object.keys(summary).map((k) => `${KIND_NAMES[k]}×${summary[k]}`).join(' ');
      this.hud.showToast(`⚔ 遭遇：${txt}`);
      this.audio.zombieGroan(0.1);
      this.state = 'combat';
    } else if (room.type === 'elite') {
      this.zombies.spawnWave(room.zCenter, room.zExit + 1.5, w, room.depth, ['elite', 'normal', 'normal']);
      this.audio.zombieGroan(0.13);
      this.state = 'combat';
    } else if (room.type === 'boss') {
      const chapter = Math.ceil(room.depth / 30);
      this.boss = new TombBoss(
        this.scene,
        new THREE.Vector3(0, 0, room.zExit + 5),
        chapter
      );
      this.boss.onSpit = (origin: THREE.Vector3) => this.spawnEnemyShot(origin);
      this.boss.onSummon = (pos: THREE.Vector3) => {
        this.zombies.spawn(pos, room.depth, 'normal');
      };
      this.hud.showBossBar(`👹 ${this.boss.name}`);
      this.audio.bossRoar();
      this.state = 'combat';
    } else if (room.type === 'corridor') {
      if (Math.random() < 0.35) {
        this.zombies.spawnWave(
          room.zCenter, room.zExit + 1, w, room.depth,
          this.zombies.composition(room.depth, 1 + Math.floor(Math.random() * 2))
        );
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
    } else if (room.type === 'safehouse') {
      this.player.heal(25);
      this.player.addSanity(10);
      this.meta.data.checkpoint = room.depth;
      this.meta.save();
      this.hud.showToast(`🏕️ 安全屋：休整完毕，检查点已记录（深度 ${room.depth}）`);
      this.audio.altar();
    } else if (room.type === 'extract') {
      this.state = 'extract';
      this.hud.showExtractDialog(this.bag.totalValue);
    }
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;

    this.audio.updateAmbient(dt, this.player.sanity / this.player.maxSanity);
    this.dungeon.flicker(time);

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

    for (const ex of this.explosions) {
      ex.age += dt;
      const t2 = ex.age / 0.45;
      ex.mesh.scale.setScalar(0.5 + t2 * 4);
      (ex.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - t2));
    }
    const oldEx = this.explosions.filter((e) => e.age > 0.45);
    for (const e of oldEx) {
      this.scene.remove(e.mesh);
      (e.mesh.material as THREE.Material).dispose();
      e.mesh.geometry.dispose();
    }
    this.explosions = this.explosions.filter((e) => e.age <= 0.45);

    if (this.state !== 'over') {
      if (this.input.wasPressed('KeyR')) this.player.startReload(this.audio);
      if (this.input.wasPressed('KeyQ')) {
        this.player.switchWeapon(this.audio);
        this.hud.updateWeapon(this.player.weapon.icon, this.player.weapon.name);
      }
      if (this.input.wasPressed('Digit1')) this.useConsumable('med');
      if (this.input.wasPressed('Digit2')) this.useConsumable('sedative');
      if (this.input.wasPressed('Digit3')) this.useConsumable('grenade');
      if (this.input.wasPressed('Digit4') && this.assistant) {
        const ok = this.assistant.zapAll(this.zombies.zombies, this.scene, this.audio, (z: Zombie) => {
          const result = z.takeDamage(25, 'body');
          this.hud.floatText(z.mesh.position.clone().setY(1.4), `${result.dmg}`, 'dmg');
          if (result.killed) this.onKill(z);
        });
        if (ok) {
          this.hud.showToast('🦉 夜枭·群体电击！');
          this.hud.updateSkill(true, this.assistant.charges);
        } else if (this.assistant.charges <= 0) {
          this.hud.showToast('🦉 技能次数已用尽');
        }
      }

      const blocked = this.state === 'intel' || this.state === 'bagfull' || this.state === 'choice' || this.state === 'extract';
      const moving = this.state === 'moving';
      this.player.update(dt, moving, this.input.mouseNDC, this.audio, time);

      if (this.assistant) {
        this.assistant.update(dt, time, this.player.position, this.scene);
      }

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
        if (
          this.state === 'moving' && this.pendingChoice &&
          room.depth >= this.dungeon.currentDepth &&
          this.player.position.z <= room.zExit + 1.6
        ) {
          this.state = 'choice';
          this.hud.showChoice(this.pendingChoice);
        }
      }

      if (!blocked && (this.state === 'combat' || this.zombies.zombies.length > 0)) {
        const hits = this.zombies.update(dt, time, this.player.position, this.audio);
        for (let i = 0; i < hits.hpHits; i++) {
          this.player.takeDamage(8 + Math.floor(this.dungeon.currentDepth / 4));
        }
        for (let i = 0; i < hits.sanityHits; i++) {
          this.player.sanity = Math.max(0, this.player.sanity - 6);
          this.audio.sanityHit();
          this.hud.floatText(
            new THREE.Vector3(this.player.position.x, 2.4, this.player.position.z - 1),
            '神智 -6', 'sanity'
          );
          if (this.player.sanity <= 0) {
            this.endRun(true, '神智崩溃 — 强制撤离');
          }
        }

        // BOSS
        if (this.boss && !this.boss.removed) {
          const bossHits = this.boss.update(dt, time, this.player.position, this.audio);
          if (!this.boss.dead) {
            this.hud.updateBossBar(this.boss.hp, this.boss.maxHp, this.boss.phase);
          }
          for (let i = 0; i < bossHits; i++) {
            this.player.takeDamage(22);
          }
          if (this.boss.removed) {
            this.boss.dispose(this.scene);
            this.boss = null; // 释放引用，恢复常规战斗结算
          }
        }

        const bossAlive = this.boss && !this.boss.dead;
        if (this.state === 'combat' && this.zombies.aliveCount === 0 &&
            this.zombies.zombies.length === 0 && !bossAlive) {
          // BOSS死亡由 onBossKilled 切到 extract，不在这里覆盖
          if (!this.boss) {
            this.state = 'moving';
            if (this.currentRoom) this.currentRoom.cleared = true;
            this.hud.showToast('✅ 区域安全，继续前进');
          }
        }
      }

      for (const s of this.enemyShots) {
        s.life -= dt;
        if (s.life <= 0) s.dead = true;
        s.mesh.position.addScaledVector(s.velocity, dt);
        const d = s.mesh.position.distanceTo(
          new THREE.Vector3(this.player.position.x, this.player.position.y + 1.4, this.player.position.z)
        );
        if (d < 0.6) {
          s.dead = true;
          this.player.takeDamage(7 + Math.floor(this.dungeon.currentDepth / 5));
          this.audio.hit();
        }
      }
      const deadS = this.enemyShots.filter((s) => s.dead);
      for (const s of deadS) {
        this.scene.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        s.mesh.geometry.dispose();
      }
      this.enemyShots = this.enemyShots.filter((s) => !s.dead);

      if ((this.state === 'combat' || this.state === 'moving') && this.input.isFiring()) {
        this.tryShoot();
      }

      if (this.state === 'search') {
        if (this.input.consumeClick() && !this.searchTarget) {
          this.trySearchClick();
        }
        if (this.searchTarget) {
          const speed = this.assistant ? this.assistant.searchSpeedMult : 1;
          this.searchProgress += (dt / 1.3) * speed;
          this.hud.setSearchProgress(this.searchProgress);
          if (Math.floor(this.searchProgress * 10) !== Math.floor((this.searchProgress - dt / 1.3) * 10)) {
            this.audio.searchTick();
          }
          if (this.searchProgress >= 1) {
            this.searchTarget.userData.searched = true;
            (this.searchTarget.material as THREE.MeshStandardMaterial).color.setHex(0x3a3a3a);
            if (this.currentRoom) this.currentRoom.searched += 1;
            this.applySearchDrop();
            this.searchTarget = null;
            if (this.state === 'search') {
              this.hud.showSearchPanel('点击下一个箱子，或继续前进');
              this.hud.setSearchProgress(0);
              if (this.currentRoom && this.currentRoom.searched >= this.currentRoom.crates.length) {
                this.finishSearch();
                this.hud.showToast('箱子已搜空，继续前进');
              }
            } else {
              this.hud.hideSearchPanel();
            }
          }
        }
      }

      if (!this.player.alive && this.state !== 'over') {
        this.endRun(false, 'YOU DIED — 战利品全部丢失');
      }
    }

    this.input.endFrame();

    this.hud.update(
      dt, this.player.hp, this.player.maxHp,
      this.player.sanity, this.player.maxSanity,
      this.player.ammo, this.player.magSize, this.player.reloading, this.player.reloadTime,
      this.bag.totalValue, this.dungeon.currentDepth,
      STATE_LABEL[this.state], this.input.mousePx
    );
    this.hud.updateBackpack(this.bag);
    this.hud.updateFloaters(dt, this.camera);

    this.renderer.render(this.scene, this.camera);
  }
}
