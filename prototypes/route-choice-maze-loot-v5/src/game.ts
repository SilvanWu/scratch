import * as THREE from 'three';
import { Input } from './input';
import { AudioFX } from './audio';
import { Meta, BACKPACK_UPGRADES, HP_TRAINING_STEP, SANITY_TRAINING_STEP, WEAPON_CALIBRATION_STEP, reloadTrainingMultiplier } from './meta';
import { Backpack, InvItem, WeaponDef, makeWeaponItem, makeTreasureItem, makeSpecialCollectionItem, makeConsumableItem, makeAmmoItem, TreasureItem, CONSUMABLE_INFO, ConsumableKind, RARITY_INFO, RELICS, SPECIAL_COLLECTIONS, rollCrateContent, rollLowQualityTreasure } from './items';
import { Dungeon, Room, RouteNode, RouteMapSnapshot, ROOM_INFO, themeForDepth, sanityCostFor } from './rooms';
import { ZombieManager, Zombie } from './enemy';
import { PlayerRig } from './player';
import { TombBoss } from './boss';
import { Assistant, AssistantTarget } from './assistant';
import { Pact, rollPacts, rollBlessing, BLESSINGS, rollCurses } from './pacts';
import { HUD } from './hud';

type GameState = 'moving' | 'combat' | 'search' | 'loot' | 'choice' | 'extract' | 'intel' | 'interact' | 'shop' | 'over';

const STATE_LABEL: Record<string, string> = {
  moving: '▶ 前进中…',
  combat: '⚔ 战斗！消灭所有敌人',
  search: '🔍 搜索中（点击箱子）',
  loot: '💰 拾取掉落',
  choice: '🗺 选择路线',
  extract: '🟢 撤离点',
  intel: '📋 情报',
  interact: '✋ 点击交互',
  shop: '🛒 商店',
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

interface PendingLootRequest {
  item: InvItem;
  reason: string;
  triggerBonuses: boolean;
}

type SpecialCollectionSource = 'storage' | 'treasure' | 'curse' | 'elite' | 'deep-treasure' | 'flawless' | 'boss';

type RunShopKind =
  'med' | 'sedative' | 'grenade' | 'honey' | 'adren' | 'osiris' |
  'ammoR' | 'ammoS' | 'shield' | 'shieldBig' | 'blessing';

interface RunShopItem {
  kind: RunShopKind;
  icon: string;
  name: string;
  desc: string;
  price: number;
  sold?: boolean;
  payload?: Pact | ConsumableKind;
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
  private bag!: Backpack;
  private pistolDef!: WeaponDef;     // 默认武器（无装备时兜底）
  private paused: boolean = false;   // 打开背包时暂停
  private userPaused: boolean = false; // 暂停按钮
  private routePaused: boolean = false; // 展开路线图时暂停
  private developerPaused: boolean = false;
  private mapVisibilityMode: 'progression' | 'fog' | 'surveyed' | 'full';
  private aimAssistRangePx: number = 20;
  private readonly surveyedChaptersAtRunStart: Set<number>;
  private transitioning: boolean = false;
  private transitionPhase: 'door' | 'fadeIn' | 'fadeOut' = 'fadeIn';
  private transitionNode: RouteNode | null = null;
  private transitionDebugJump: boolean = false;
  private transitionTimer: number = 0;
  private readonly transitionDoorOpen: number = 0.9;
  private readonly transitionFadeIn: number = 0.14;
  private readonly transitionFadeOut: number = 0.26;

  private state: GameState = 'moving';
  private currentRoom: Room | null = null;
  private enteredDepth: number;
  private triggeredDepth: number;
  private pendingRoomStart: Room | null = null;
  private kills: number = 0;
  private searchTarget: THREE.Mesh | null = null;
  private searchProgress: number = 0;
  private tracers: { mesh: THREE.Mesh; age: number }[] = [];
  private enemyShots: EnemyShot[] = [];
  private explosions: { mesh: THREE.Mesh; age: number }[] = [];
  private lootOrbs: { mesh: THREE.Mesh; gold: number; bob: number }[] = [];  // 击杀掉落金币光点
  private pendingRouteMessage: string | null = null;
  private lockedZombie: Zombie | null = null;  // 锁定的索敌目标
  private wasManualAim: boolean = false;        // 上一帧是否在手动瞄准（检测进入瞄准的边沿）
  private sanityReduce: number = 0;       // 头脑冷静：每层进房理智消耗 -1
  private reaperLayers: number = 0;       // 死神之力：首层 30%/10，后续每层 +5%/+10
  private luckyStarLayers: number = 0;    // 幸运星：首层 20%，后续每层 +5%
  private healingPowerLayers: number = 0;// 愈合神力：每层进房恢复 3 生命
  private dodgeChance: number = 0;        // 残躯之誓：每层 5% 闪避
  private shieldOnClear: boolean = false; // 神盾契约：清房获得最多 10 点临时护盾
  private greedRoomsRemaining: number = 0;
  private thirstRoomsRemaining: number = 0;
  private slayerRoomsRemaining: number = 0;
  private greedRoomActive: boolean = false;
  private thirstRoomActive: boolean = false;
  private slayerRoomActive: boolean = false;
  private adrenalineRooms: number = 0; // 肾上腺素剩余衰减房间数
  private shownChapterIntro: number = -1;
  private lootValueMult: number = 1;       // V5 契约：撤离结算价值加成
  private assistantDamageMult: number = 1; // 夜枭祝福：宠物伤害倍率
  private activePacts: string[] = [];      // V5 已结契约
  private incomingLootQueue: PendingLootRequest[] = [];
  private activePendingLoot: PendingLootRequest | null = null;
  private processingLootQueue: boolean = false;
  private lootQueueDrainedCallbacks: (() => void)[] = [];
  private currentRoomTookDamage: boolean = false;

  constructor(
    canvas: HTMLCanvasElement, meta: Meta, audio: AudioFX, startDepth: number,
    mapVisibilityMode: 'progression' | 'fog' | 'surveyed' | 'full' = 'progression'
  ) {
    this.meta = meta;
    this.audio = audio;
    this.mapVisibilityMode = mapVisibilityMode;
    this.surveyedChaptersAtRunStart = new Set(meta.data.surveyedMapChapters);
    for (let chapter = 1; chapter <= meta.data.chaptersCleared; chapter++) {
      this.surveyedChaptersAtRunStart.add(chapter);
    }
    const backpackConfig = BACKPACK_UPGRADES[meta.data.backpackLv] || BACKPACK_UPGRADES[0];
    this.bag = new Backpack(backpackConfig.cols, backpackConfig.rows);

    const stage = document.getElementById('stage')!;
    const stageSize = (): { w: number; h: number } => ({
      w: stage.clientWidth, h: stage.clientHeight,
    });

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(stageSize().w, stageSize().h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    // 提亮：更亮的环境光与更远的雾
    this.scene.background = new THREE.Color(0x0c0a10);
    this.scene.fog = new THREE.Fog(0x0c0a10, 13, 46);
    this.scene.add(new THREE.AmbientLight(0x6a6272, 0.85));
    const fillHemi = new THREE.HemisphereLight(0x554f60, 0x2a2018, 0.5);
    this.scene.add(fillHemi);

    this.camera = new THREE.PerspectiveCamera(
      68, stageSize().w / stageSize().h, 0.05, 80
    );
    window.addEventListener('resize', () => {
      const s = stageSize();
      this.camera.aspect = s.w / s.h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(s.w, s.h);
      if (this.hud) this.hud.setAimAssistRadius(this.aimAssistRadiusPx());
    });

    this.input = new Input(canvas);
    this.dungeon = new Dungeon(this.scene, startDepth);
    this.enteredDepth = startDepth;
    this.triggeredDepth = startDepth;
    this.zombies = new ZombieManager(this.scene);
    this.zombies.onRangedShoot = (origin: THREE.Vector3) => this.spawnEnemyShot(origin);

    const nonPistolReloadMult = reloadTrainingMultiplier(meta.data.reloadLv);
    const weaponDamageMult = 1 + meta.data.weaponCalibrationLv * WEAPON_CALIBRATION_STEP;

    // 武器定义（占格：手枪 1×2，AK/霰弹 2×2）
    const pistol: WeaponDef = {
      name: '手枪', icon: '🔫',
      damage: Math.round(8 * weaponDamageMult * 10) / 10,
      magSize: 12 + meta.data.magLv * 4,
      reloadTime: 1.15, fireInterval: 0.22, pellets: 1, spread: 0,
      cellsW: 1, cellsH: 2, ammoType: 'pistol',
    };
    this.pistolDef = pistol;
    const ak: WeaponDef = {
      name: 'AK', icon: 'AK',
      damage: Math.round(9 * weaponDamageMult * 10) / 10,
      magSize: 30 + meta.data.magLv * 4,
      reloadTime: 2.1 * nonPistolReloadMult, fireInterval: 0.09, pellets: 1, spread: 0,
      cellsW: 2, cellsH: 2, ammoType: 'rifle',
    };
    // 初始：手枪、AK 直接装入两个武器栏
    const pistolItem = makeWeaponItem(pistol);
    pistolItem.equipped = true; pistolItem.slot = 0;
    this.bag.weaponSlots[0] = pistolItem;
    const akItem = makeWeaponItem(ak);
    akItem.equipped = true; akItem.slot = 1;
    this.bag.weaponSlots[1] = akItem;
    if (meta.data.shotgunOwned) {
      this.bag.addItem(makeWeaponItem({
        name: '霰弹枪', icon: '💥',
        damage: Math.round(6 * weaponDamageMult * 10) / 10,
        magSize: 5 + meta.data.magLv,
        reloadTime: 1.8 * nonPistolReloadMult, fireInterval: 0.8, pellets: 6, spread: 0.05,
        cellsW: 2, cellsH: 2, ammoType: 'shell',
      }));
    }
    // 初始消耗品 / 子弹（按弹药种类分别存放）
    this.bag.addConsumable('med');
    this.bag.addConsumable('grenade');
    this.bag.addBulletsOf('rifle', 30);   // 手枪弹无限，不再发放手枪弹

    this.player = new PlayerRig(this.scene, this.camera, this.bag.equippedWeaponDefs());
    this.player.maxHp += meta.data.hpLv * HP_TRAINING_STEP;
    this.player.hp = this.player.maxHp;
    this.player.maxSanity += meta.data.sanityLv * SANITY_TRAINING_STEP;
    this.player.sanity = this.player.maxSanity;
    this.player.configureShieldSlots(2 + meta.data.shieldCapLv, true);

    if (meta.data.assistantOwned) {
      this.assistant = new Assistant(this.scene);
    }

    this.hud = new HUD();
    this.hud.bindBag(this.bag);
    this.hud.setupWeapons(this.player.weapons.map((w) => ({ icon: w.icon, name: w.name })), this.player.weaponIndex);
    this.hud.updateSkill(!!this.assistant, this.assistant ? this.assistant.charges : 0);

    // 触屏底部按钮接线
    this.hud.onWeaponTap = (i: number) => {
      if (i === this.player.weaponIndex) {
        this.tryReload();                          // 点击当前武器 → 换弹
      } else {
        this.player.equipWeapon(i, this.audio);    // 点击另一把 → 切换
        this.hud.setWeaponSelected(this.player.weaponIndex);
      }
    };
    this.hud.onUseConsumable = (k) => this.useConsumable(k);
    this.hud.onUseConsumableItem = (k) => this.useConsumable(k);
    this.hud.onUseSkill = () => this.useSkill();
    this.hud.onInventoryDirty = () => this.syncEquipment();
    this.hud.onBagToggle = (open) => {
      this.paused = open;
    };
    this.hud.onPauseToggle = (p) => {
      this.userPaused = p;
      this.syncMusicPause();
    };
    this.hud.onRouteMapToggle = (open) => {
      this.routePaused = open;
      this.wasManualAim = false;
      this.input.cancelPointer();
    };
    this.hud.onSensitivity = (v) => { this.player.aimSensitivity = v; };
    this.hud.onAimAssistRange = (v) => this.setAimAssistRange(v);
    this.hud.setAimAssistRadius(this.aimAssistRadiusPx());

    this.hud.onChoice = (node: RouteNode) => {
      this.beginRouteTransition(node, false);
    };
    this.hud.onExtract = (leave: boolean) => {
      if (leave) {
        this.endRun(true, '撤离成功', true);
      } else {
        this.offerPact();
      }
    };
    this.hud.onExitConfirm = (leave: boolean) => {
      if (leave) {
        this.endRun(true, '撤离成功', true);
      } else {
        this.state = 'interact';
        this.enableRouteChoiceFromMap();
        this.hud.setPrompt('点击绿色撤离环可再次确认；也可打开地图离开撤离点');
      }
    };
    this.hud.onIntelContinue = () => {
      if (this.pendingRoomStart) {
        const room = this.pendingRoomStart;
        this.pendingRoomStart = null;
        this.onRoomCenter(room);
      } else {
        this.openRouteChoice();
      }
    };

    // 起点也是实际房间：只保留基础空间与路线门，首次选择和返回时都不会面对空场景。
    const entrance = this.dungeon.appendEntrance();
    this.currentRoom = entrance;
    this.player.teleportTo(new THREE.Vector3(0, 0, entrance.zEntry - 6));

    this.prepareRouteChoices();
    this.refreshRouteMap();
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

  previewRouteChoicePanel(): void {
    this.hud.dismissBlockingOverlays();
    this.openRouteChoice('原型预览：选择下一关');
  }

  setMapVisibilityMode(mode: 'progression' | 'fog' | 'surveyed' | 'full'): void {
    if (this.mapVisibilityMode === mode) return;
    this.mapVisibilityMode = mode;
    this.refreshRouteMap();
    const label = mode === 'full' ? '全解锁' : mode === 'surveyed' ? '问号地图' :
      mode === 'fog' ? '战争迷雾' : '自动探索规则';
    this.hud.showToast(`开发者地图：${label}`);
  }

  getEffectiveMapVisibilityMode(): 'fog' | 'surveyed' | 'full' {
    return this.visibleRouteSnapshot().visibilityMode;
  }

  private setAimAssistRange(value: number): void {
    this.aimAssistRangePx = Math.max(0, Math.min(30, value));
    this.hud.setAimAssistRadius(this.aimAssistRadiusPx());
  }

  private aimAssistRadiusPx(): number {
    return this.aimAssistRangePx;
  }

  setDeveloperModalOpen(open: boolean): void {
    this.developerPaused = open;
    this.wasManualAim = false;
    this.input.cancelPointer();
  }

  private syncMusicPause(): void {
    // 只把明确的暂停菜单视为音乐暂停。路线图/背包会冻结模拟，但仍属于游戏流程。
    if (this.userPaused) {
      this.audio.pauseAmbient();
    } else {
      this.audio.resumeAmbient();
    }
  }

  private prepareRouteChoices(): void {
    this.dungeon.nextChoices();
    this.refreshRouteMap();
  }

  private visibleRouteSnapshot(): RouteMapSnapshot {
    const snapshot = this.dungeon.routeSnapshot();
    const allIds = snapshot.nodes.map((node) => node.id);
    if (this.mapVisibilityMode === 'full') {
      return { ...snapshot, visibilityMode: 'full', visibleIds: allIds, revealedTypeIds: allIds };
    }

    const chapter = Math.floor(snapshot.segmentStartDepth / 30) + 1;
    const surveyed = this.mapVisibilityMode === 'progression' && this.surveyedChaptersAtRunStart.has(chapter);
    const revealedTypeIds = new Set<string>();
    for (const node of snapshot.nodes) {
      if (node.visited || node.id === snapshot.currentId || snapshot.choiceIds.includes(node.id)) {
        revealedTypeIds.add(node.id);
      }
      if (node.type === 'boss' || node.type === 'exit') {
        revealedTypeIds.add(node.id);
      }
    }

    if (surveyed) {
      return {
        ...snapshot,
        visibilityMode: 'full',
        visibleIds: allIds,
        revealedTypeIds: allIds,
      };
    }

    if (this.mapVisibilityMode === 'surveyed') {
      return {
        ...snapshot,
        visibilityMode: 'surveyed',
        visibleIds: allIds,
        revealedTypeIds: Array.from(revealedTypeIds),
      };
    }

    const visibleIds = new Set<string>();
    for (const node of snapshot.nodes) {
      if (node.visited || node.id === snapshot.currentId) visibleIds.add(node.id);
    }
    const currentNode = snapshot.currentId
      ? snapshot.nodes.find((node) => node.id === snapshot.currentId)
      : null;
    if (currentNode) {
      for (const linkedId of currentNode.links) visibleIds.add(linkedId);
    }
    for (const node of snapshot.nodes) {
      if (node.type === 'boss' || node.type === 'exit') visibleIds.add(node.id);
    }
    for (const choiceId of snapshot.choiceIds) visibleIds.add(choiceId);

    return {
      ...snapshot,
      visibilityMode: 'fog',
      visibleIds: Array.from(visibleIds),
      revealedTypeIds: Array.from(revealedTypeIds),
    };
  }

  private refreshRouteMap(): void {
    this.hud.renderRouteMap(this.visibleRouteSnapshot());
  }

  private openRouteChoice(message?: string): void {
    this.prepareRouteChoices();
    this.state = 'choice';
    this.hud.setStateLabel(STATE_LABEL.choice);
    this.hud.setPrompt(null);
    if (message) this.hud.showToast(message);
    this.hud.showRouteChoice(this.visibleRouteSnapshot());
  }

  private enableRouteChoiceFromMap(): void {
    this.dungeon.nextChoices();
    this.hud.setRouteChoiceReady(this.visibleRouteSnapshot());
  }

  private startRouteNode(node: RouteNode, debugJump: boolean = false): void {
    this.paused = false;
    this.userPaused = false;
    this.routePaused = false;
    this.syncMusicPause();
    this.pendingRouteMessage = null;
    this.searchTarget = null;
    this.searchProgress = 0;
    this.hud.dismissBlockingOverlays();
    this.clearTransientObjects();
    const room = this.dungeon.appendRouteNode(node, debugJump);
    this.refreshRouteMap();
    this.currentRoom = room;
    this.enteredDepth = room.depth - 1;
    this.triggeredDepth = room.depth - 1;
    this.player.teleportTo(new THREE.Vector3(0, 0, room.zEntry - 6));
    this.hud.setPrompt(null);
    this.hud.hideSearchPanel();
    this.hud.hideSearchRing();
    if (!room.revisited) this.recoverAssistantSkillCharge();
    if (debugJump) this.hud.showToast(`DEBUG 跳转：${ROOM_INFO[node.type].name}`);
    this.state = 'moving';
    if (!this.onEnterRoom(room)) {
      this.pendingRoomStart = room;
      this.hud.setStateLabel(STATE_LABEL[this.state]);
      return;
    }
    this.onRoomCenter(room);
    this.hud.setStateLabel(STATE_LABEL[this.state]);
  }

  private recoverAssistantSkillCharge(): void {
    if (!this.assistant) return;
    const gained = this.assistant.recoverCharge(1);
    if (gained > 0) this.hud.updateSkill(true, this.assistant.charges);
  }

  private beginRouteTransition(node: RouteNode, debugJump: boolean = false): void {
    if (this.transitioning) return;
    this.paused = false;
    this.userPaused = false;
    this.routePaused = false;
    this.syncMusicPause();
    this.wasManualAim = false;
    this.input.cancelPointer();
    this.hud.closeRouteMap();
    this.hud.dismissBlockingOverlays();
    this.hud.setPrompt(null);
    this.transitioning = true;
    this.transitionNode = node;
    this.transitionDebugJump = debugJump;
    this.transitionTimer = 0;
    const doorFound = !debugJump && this.dungeon.beginRouteDoorOpen(this.currentRoom, node.id);
    this.transitionPhase = doorFound ? 'door' : 'fadeIn';
    this.hud.setRoomTransition(0, false);
    if (doorFound) {
      this.focusRouteDoorCamera(node.id, 0.2);
      this.audio.doorOpen();
    }
  }

  private focusRouteDoorCamera(nodeId: string, dt: number): void {
    const view = this.dungeon.routeDoorView(this.currentRoom, nodeId);
    if (!view) return;
    const sideX = view.direction === 'left' ? 1.35 : view.direction === 'right' ? -1.35 : 0.9;
    const camPos = new THREE.Vector3(
      this.player.position.x + sideX,
      this.player.position.y + 2.75,
      this.player.position.z + 4.2
    );
    const lookAt = view.center.clone();
    lookAt.y = Math.max(1.8, lookAt.y);
    this.camera.position.lerp(camPos, Math.min(1, dt * 8));
    this.camera.lookAt(lookAt);
    const targetFov = view.direction === 'center' ? this.player.hipFov : 76;
    if (Math.abs(this.camera.fov - targetFov) > 0.2) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();
    }
  }

  private updateRouteTransition(dt: number): void {
    const node = this.transitionNode;
    if (!node) {
      this.transitioning = false;
      this.hud.setRoomTransition(0, false);
      return;
    }

    this.transitionTimer += dt;

    if (this.transitionPhase === 'door') {
      this.focusRouteDoorCamera(node.id, dt);
      const done = this.dungeon.updateRouteDoorOpen(this.currentRoom, node.id, dt, this.transitionDoorOpen);
      this.hud.setRoomTransition(0, false);
      if (done) {
        this.transitionPhase = 'fadeIn';
        this.transitionTimer = 0;
      }
      return;
    }

    if (this.transitionPhase === 'fadeIn') {
      const alpha = Math.min(1, this.transitionTimer / this.transitionFadeIn);
      this.hud.setRoomTransition(alpha, true);
      if (alpha >= 1) {
        this.startRouteNode(node, this.transitionDebugJump);
        this.transitionPhase = 'fadeOut';
        this.transitionTimer = 0;
      }
      return;
    }

    const alpha = 1 - Math.min(1, this.transitionTimer / this.transitionFadeOut);
    if (alpha <= 0) {
      this.transitioning = false;
      this.transitionNode = null;
      this.transitionDebugJump = false;
      this.hud.setRoomTransition(0, false);
      return;
    }
    this.hud.setRoomTransition(alpha, true);
  }

  private completeNode(message?: string): void {
    if (this.state === 'over' || this.state === 'extract') return;
    this.searchTarget = null;
    this.hud.hideSearchPanel();
    this.hud.hideSearchRing();
    this.hud.setPrompt(null);
    if (this.lootOrbs.length > 0) {
      this.pendingRouteMessage = message || '打开地图选择下一关';
      this.state = 'loot';
      this.enableRouteChoiceFromMap();
      this.hud.setStateLabel(STATE_LABEL.loot);
      this.hud.setPrompt('点击场景内金币光点拾取掉落；也可打开地图直接前往下一关');
      this.hud.showToast('还有怪物掉落物未拾取');
      return;
    }
    this.openRouteChoice(message);
  }

  private clearTransientObjects(): void {
    if (this.boss) {
      this.boss.dispose(this.scene);
      this.boss = null;
      this.hud.hideBossBar();
    }
    for (const s of this.enemyShots) {
      this.scene.remove(s.mesh);
      (s.mesh.material as THREE.Material).dispose();
      s.mesh.geometry.dispose();
    }
    this.enemyShots = [];
    for (const t of this.tracers) {
      this.scene.remove(t.mesh);
      (t.mesh.material as THREE.Material).dispose();
      t.mesh.geometry.dispose();
    }
    this.tracers = [];
    for (const e of this.explosions) {
      this.scene.remove(e.mesh);
      (e.mesh.material as THREE.Material).dispose();
      e.mesh.geometry.dispose();
    }
    this.explosions = [];
    for (const o of this.lootOrbs) this.scene.remove(o.mesh);
    this.lootOrbs = [];
    for (const z of this.zombies.zombies) z.dispose(this.scene);
    this.zombies.zombies = [];
    this.lockedZombie = null;
  }

  // V5：继续深入时提供高风险契约选择（搜打撤赌注）
  private offerPact(): void {
    const choices = rollPacts();
    this.hud.showPactChoice(choices, (p: Pact | null) => {
      if (p) {
        this.applyBuff(p);
        this.hud.showToast(`${p.icon} 已结「${p.name}」：${p.boon}（代价 ${p.curse}）`);
      } else {
        this.hud.showToast('继续深入……更危险，也更富有');
      }
      this.dungeon.startNextSegment();
      this.openRouteChoice('继续深入……新的迷宫已经生成');
    }, true, '🩸 深入契约', '强力增益+永久代价，可婉拒');
  }

  private chapterForDepth(depth: number): number {
    return Math.floor(Math.max(0, depth) / 30) + 1;
  }

  private endRun(extracted: boolean, title: string, surveyChapter: boolean = false): void {
    this.state = 'over';
    const v = this.bag.totalValue;
    const payout = Math.round(v * this.lootValueMult) + this.bag.coins;  // 战利品价值 + 局内金币
    const depth = this.dungeon.currentDepth;
    if (extracted) {
      if (surveyChapter) {
        const chapter = this.chapterForDepth(depth);
        if (!this.meta.data.surveyedMapChapters.includes(chapter)) {
          this.meta.data.surveyedMapChapters.push(chapter);
          this.meta.data.surveyedMapChapters.sort((a, b) => a - b);
        }
      }
      this.meta.data.bank += payout;
      this.meta.data.extracts += 1;
      for (const item of this.bag.items) {
        if (item.kind !== 'treasure' || (item.rarity !== 'legend' && item.rarity !== 'mythic')) continue;
        const markEligible = item.rarity === 'legend' || item.rarity === 'mythic';
        if (markEligible && !this.meta.data.relicMarkCollections.includes(item.name)) {
          this.meta.data.relicMarks += 1;
          this.meta.data.relicMarkCollections.push(item.name);
        }
        this.meta.collect(item.name);
      }
      this.audio.extractOk();
    } else {
      this.audio.death();
    }
    if (depth > this.meta.data.bestDepth) this.meta.data.bestDepth = depth;
    this.meta.save();
    const itemList = this.bag.items.filter((i) => i.kind === 'treasure').map((i) => `${i.icon}`).join(' ') || '（空）';
    const valueLine = `战利品价值：💰 ${v}${this.lootValueMult > 1 ? ` ×${this.lootValueMult.toFixed(2)}` : ''}  ｜  局内金币：💰 ${this.bag.coins}`;
    const lines = extracted
      ? [`带出战利品：${itemList}`, valueLine, `本次入账：💰 ${payout}`, `探索深度：${depth} ｜ 击杀：${this.kills}`, `金库总额：💰 ${this.meta.data.bank}`]
      : [`损失战利品：${itemList}（价值 ${v}）｜ 损失金币 ${this.bag.coins}`, `探索深度：${depth} ｜ 击杀：${this.kills}`, `金库总额：💰 ${this.meta.data.bank}`];
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
    const info = CONSUMABLE_INFO[kind];
    if (info.special === 'grenade') {
      this.throwGrenade();
      return;
    }
    if (info.special === 'adren') {
      this.player.changeHp(30);
      this.player.addSanity(30);
      this.adrenalineRooms = 3;
      this.hud.showToast('💉 肾上腺素：血量/理智临时 +30');
      this.audio.loot();
      return;
    }
    if (info.hp !== 0) this.player.changeHp(info.hp);
    if (info.san !== 0) this.player.addSanity(info.san);
    this.hud.showToast(`${info.icon} ${info.desc}`);
    this.audio.loot();
  }

  // 换弹（消耗当前武器对应弹药；无对应弹药则提示）
  private tryReload(): void {
    const type = this.player.weapon.ammoType;
    if (type !== 'pistol' && this.bag.bulletsOf(type) <= 0) {
      this.hud.showToast('🔫 没有对应弹药了');
      return;
    }
    this.player.startReload(this.audio);
  }

  // 背包武器栏变更 → 同步到玩家与底部武器HUD（无装备则用手枪兜底）
  private syncEquipment(): void {
    const defs = this.bag.equippedWeaponDefs();
    const list = defs.length ? defs : [this.pistolDef];
    this.player.setWeapons(list);
    this.hud.setupWeapons(list.map((w) => ({ icon: w.icon, name: w.name })), this.player.weaponIndex);
  }

  // 助手·夜枭：主动 AOE 电击（触屏按钮 / E 键共用）
  private useSkill(): void {
    if (!this.assistant) return;
    const dmg = this.assistantSkillDamage();
    const ok = this.assistant.castAoe(this.assistantAoeTargets(dmg), this.scene, this.audio);
    if (ok) {
      this.hud.showToast(`🦉 夜枭·雷暴！范围伤害 ${dmg}`);
      this.hud.updateSkill(true, this.assistant.charges);
    } else if (this.assistant.charges <= 0) {
      this.hud.showToast('🦉 技能次数已用尽');
    } else {
      this.hud.showToast('🦉 范围内没有目标');
    }
  }

  private assistantAutoDamage(): number {
    return Math.round(Math.min(18, 8 + Math.floor(this.dungeon.currentDepth / 8)) * this.assistantDamageMult);
  }

  private assistantSkillDamage(): number {
    return Math.round(Math.min(60, 32 + Math.floor(this.dungeon.currentDepth / 4)) * this.assistantDamageMult);
  }

  private assistantAoeTargets(dmg: number): AssistantTarget[] {
    const targets: AssistantTarget[] = [];
    for (const z of this.zombies.zombies) {
      if (z.dead) continue;
      const pos = z.mesh.position.clone().setY(z.mesh.position.y + 1.1);
      targets.push({
        position: pos,
        hit: () => {
          const result = z.takeDamage(dmg, 'body');
          this.hud.floatText(pos.clone(), `${result.dmg}`, 'dmg');
          if (result.killed) this.onKill(z);
        },
      });
    }
    if (this.boss && !this.boss.dead) {
      const pos = this.boss.mesh.position.clone().setY(this.boss.mesh.position.y + 3);
      targets.push({
        position: pos,
        hit: () => {
          const result = this.boss!.takeDamage(dmg, 'body');
          this.syncBossBar();
          this.hud.floatText(pos.clone(), `${result.dmg}`, 'dmg');
          if (result.killed) this.onBossKilled();
        },
      });
    }
    return targets;
  }

  private updateAssistantAutoAttack(): void {
    if (!this.assistant || this.state !== 'combat' || !this.assistant.readyAutoAttack()) return;
    let targetZombie: Zombie | null = null;
    let targetBoss: TombBoss | null = null;
    let targetPos: THREE.Vector3 | null = null;
    let best = Infinity;
    const origin = this.assistant.mesh.position;

    for (const z of this.zombies.zombies) {
      if (z.dead) continue;
      const pos = z.mesh.position.clone().setY(z.mesh.position.y + 1.1);
      const d = pos.distanceTo(origin);
      if (d <= this.assistant.autoAttackRange && d < best) {
        best = d;
        targetZombie = z;
        targetBoss = null;
        targetPos = pos;
      }
    }

    if (this.boss && !this.boss.dead) {
      const pos = this.boss.mesh.position.clone().setY(this.boss.mesh.position.y + 3);
      const d = pos.distanceTo(origin);
      if (d <= this.assistant.autoAttackRange && d < best) {
        best = d;
        targetZombie = null;
        targetBoss = this.boss;
        targetPos = pos;
      }
    }

    if (!targetPos) return;
    const dmg = this.assistantAutoDamage();
    this.assistant.fireAutoAttack(this.scene, this.audio, targetPos);
    if (targetZombie) {
      const result = targetZombie.takeDamage(dmg, 'body');
      this.hud.floatText(targetPos.clone(), `${result.dmg}`, 'dmg');
      if (result.killed) this.onKill(targetZombie);
    } else if (targetBoss) {
      const result = targetBoss.takeDamage(dmg, 'body');
      this.syncBossBar();
      this.hud.floatText(targetPos.clone(), `${result.dmg}`, 'dmg');
      if (result.killed) this.onBossKilled();
    }
  }

  // 找出怪物最密集处（手雷自动投掷目标）
  private bestGrenadeTarget(): THREE.Vector3 | null {
    const live = this.zombies.zombies.filter((z) => !z.dead);
    let best: THREE.Vector3 | null = null;
    let bestCount = 0;
    for (const z of live) {
      let c = 0;
      for (const o of live) {
        if (o.mesh.position.distanceTo(z.mesh.position) < 4.5) c++;
      }
      if (c > bestCount) { bestCount = c; best = z.mesh.position.clone(); }
    }
    if (!best && this.boss && !this.boss.dead) best = this.boss.mesh.position.clone();
    return best;
  }

  private throwGrenade(): void {
    // 投向怪物最密集处；无怪物则丢向身前
    const tgt = this.bestGrenadeTarget();
    const point = tgt
      ? tgt.setY(0.4)
      : new THREE.Vector3(this.player.position.x, 0.4, this.player.position.z - 8);

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
        z.applyKnockback(point, 1.2);   // 手雷击退
        this.hud.floatText(z.mesh.position.clone().setY(1.4), `${result.dmg}`, 'dmg');
        if (result.killed) this.onKill(z);
      }
    }
    if (this.boss && !this.boss.dead && this.boss.mesh.position.distanceTo(point) < 5) {
      const result = this.boss.takeDamage(60, 'body');
      this.syncBossBar();
      this.hud.floatText(this.boss.mesh.position.clone().setY(3), `${result.dmg}`, 'dmg');
      if (result.killed) this.onBossKilled();
    }
  }

  private syncBossBar(): void {
    if (!this.boss) return;
    this.hud.updateBossBar(this.boss.hp, this.boss.maxHp, this.boss.phase);
  }

  private applyMonsterDamage(amount: number): { hpLost: number; shieldLost: number } {
    if (this.dodgeChance > 0 && Math.random() < this.dodgeChance) {
      this.hud.floatText(this.player.position.clone().setY(2.0), '闪避', 'coin');
      return { hpLost: 0, shieldLost: 0 };
    }
    const result = this.player.takeMonsterDamage(amount);
    if (result.hpLost > 0 || result.shieldLost > 0) this.currentRoomTookDamage = true;
    this.hud.floatText(
      this.player.position.clone().setY(2.0),
      result.shieldLost > 0 ? `🛡 -${result.shieldLost}` : `-${result.hpLost || Math.ceil(amount)}`,
      result.shieldLost > 0 ? 'sanity' : 'head'
    );
    return result;
  }

  private onKill(z: Zombie): void {
    this.audio.zombieDie();
    this.kills += 1;
    if (this.reaperLayers > 0) {
      const chance = 0.30 + (this.reaperLayers - 1) * 0.05;
      const healing = this.reaperLayers * 10;
      if (Math.random() < chance) {
        this.player.heal(healing);
        this.hud.floatText(this.player.position.clone().setY(1.8), `+${healing} ❤️`, 'coin');
      }
    }
    if (this.thirstRoomActive) {
      this.player.heal(8);
      this.hud.floatText(this.player.position.clone().setY(1.8), '+8 ❤️', 'coin');
    }
    if (this.slayerRoomActive) {
      this.player.addSanity(3);
      this.hud.floatText(this.player.position.clone().setY(2.15), '+3 理智', 'sanity');
    }
    const depth = this.dungeon.currentDepth;
    // 随机掉落金币光点（金色，数量随机；点击拾取飞入背包）
    const dropChance = z.kind === 'elite' ? 1 : 0.45;
    if (Math.random() < dropChance) {
      const gold = z.kind === 'elite'
        ? 40 + depth * 2 + Math.floor(Math.random() * 20)
        : 4 + Math.floor(depth * 0.6) + Math.floor(Math.random() * 5);
      this.spawnCoinOrb(z.mesh.position.clone(), gold);
    }
  }

  // 金币光点：点击拾取后金币入背包
  private spawnCoinOrb(pos: THREE.Vector3, gold: number): void {
    const col = new THREE.Color(0xffd24d);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 8),
      new THREE.MeshBasicMaterial({ color: col })
    );
    mesh.position.set(pos.x, 1.0, pos.z);
    mesh.userData.coinOrb = true;
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 10, 8),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35 })
    );
    mesh.add(glow);
    this.scene.add(mesh);
    this.lootOrbs.push({ mesh, gold, bob: Math.random() * Math.PI * 2 });
  }

  private tryCollectOrb(): boolean {
    if (this.lootOrbs.length === 0) return false;
    this.raycaster.setFromCamera(this.input.mouseNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.lootOrbs.map((o) => o.mesh), true);
    if (hits.length === 0) return false;
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && !obj.userData.coinOrb) obj = obj.parent;
    if (!obj) return false;
    const idx = this.lootOrbs.findIndex((o) => o.mesh === obj);
    if (idx < 0) return false;
    const orb = this.lootOrbs[idx];
    this.audio.loot();
    this.bag.coins += orb.gold;
    const fp = new THREE.Vector3();
    orb.mesh.getWorldPosition(fp);
    this.hud.flyItemToBag(fp, '💰', '#ffd24d', this.camera);  // 与物品一致：图标飞入背包
    this.hud.logPickup('💰', '金币', orb.gold, '#ffd24d');
    this.scene.remove(orb.mesh);
    this.lootOrbs.splice(idx, 1);
    this.maybeFinishPendingLoot();
    return true;
  }

  private maybeFinishPendingLoot(): void {
    if (!this.pendingRouteMessage || this.lootOrbs.length > 0) return;
    const message = this.pendingRouteMessage;
    this.pendingRouteMessage = null;
    this.completeNode(message);
  }

  // 点击祭坛/篝火交互（门口停下，点完再继续）
  private tryCollectPickup(): boolean {
    if (!this.currentRoom) return false;
    this.raycaster.setFromCamera(this.input.mouseNDC, this.camera);
    const ps = this.currentRoom.pickups.filter((p) => !p.userData.taken && p.userData.active !== false);
    if (ps.length === 0) return false;
    const hits = this.raycaster.intersectObjects(ps, false);
    if (hits.length === 0) return false;
    const obj = hits[0].object as THREE.Mesh;
    const kind = obj.userData.pickup as string;
    if (kind === 'exit') {
      this.state = 'extract';
      this.hud.showExitConfirm(this.bag.totalValue);
      return true;
    }
    obj.userData.taken = true;
    this.dungeon.markPickupTaken(this.currentRoom);
    const halo = obj.userData.halo as THREE.Mesh | undefined;
    if (halo) halo.visible = false;
    if (kind === 'curse') this.offerCurse();
    else if (kind === 'safehouse') this.applySafehouse();
    else if (kind === 'blessing') { obj.visible = false; this.grantBlessing(); }
    return true;
  }

  // 清场后激活祝福特效（变为可点击）
  private revealBlessing(room: Room): void {
    for (const p of room.pickups) {
      if (p.userData.pickup === 'blessing' && !p.userData.taken) {
        p.userData.active = true;
        p.visible = true;
        const halo = p.userData.halo as THREE.Mesh | undefined;
        if (halo) halo.visible = true;
      }
    }
  }

  // 安全屋篝火：仅回理智 + 记录检查点（补给已在进房时揭示，可同时搜刮）
  private applySafehouse(): void {
    this.player.addSanity(25);
    this.audio.altar();
    if (this.currentRoom) {
      this.meta.data.checkpoint = this.currentRoom.depth;
      this.meta.save();
    }
    this.hud.showToast('🏕️ 篝火休整：理智回复');
    this.maybeFinishSafehouse();
  }

  // 安全屋：搜完全部补给且点过篝火后，自动前往下一房间
  private maybeFinishSafehouse(): void {
    const room = this.currentRoom;
    if (!room || room.type !== 'safehouse') return;
    const cratesDone = room.crates.every((c) => c.userData.searched);
    const fireDone = room.pickups.every((p) => p.userData.taken);
    if (cratesDone && fireDone) {
      this.dungeon.markRoomResolved(room);
      this.completeNode('🏕️ 休整完毕，打开地图选择下一关');
    } else if (!fireDone) {
      this.enableRouteChoiceFromMap();
      this.hud.setPrompt('补给已搜完，可点击篝火休整；也可打开地图直接前往下一关');
    }
  }

  // 神之诅咒：祭坛抉择（2 个交换 + 婉拒）
  private offerCurse(): void {
    this.state = 'choice';
    const curses = rollCurses();
    this.hud.showPactChoice(curses, (p: Pact | null) => {
      if (p) this.applyBuff(p);
      else this.hud.showToast('你拒绝了祭坛的低语');
      if (this.currentRoom) {
        if (Math.ceil(this.currentRoom.depth / 30) === 2) {
          this.tryGrantSpecialCollection(2, 'curse', false);
        }
        this.dungeon.markRoomResolved(this.currentRoom);
      }
      this.completeNode('祭坛低语散去，打开地图选择下一关');
    }, true, '😈 诅咒祭坛', '以代价换强力增益，或婉拒');
  }

  // 神明祭坛：三选一获得一项增益（必选其一）
  private grantBlessing(): void {
    this.state = 'choice';
    let pool = BLESSINGS.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const opts = pool.slice(0, 3);
    this.hud.showPactChoice(opts, (p: Pact | null) => {
      if (p) {
        this.applyBuff(p);
        this.hud.showToast(`😇 祝福祭坛「${p.name}」：${p.boon}`);
      }
      if (this.currentRoom) this.dungeon.markRoomResolved(this.currentRoom);
      this.completeNode('祝福已生效，打开地图选择下一关');
    }, false, '😇 祝福祭坛', '三选一，获得纯增益');  // 不可婉拒，必选其一
  }

  // 统一增益/代价结算（契约 / 祝福 / 诅咒）
  private applyBuff(p: Pact): void {
    this.activePacts.push(p.id);
    switch (p.id) {
      case 'blood': this.player.damageMult += 0.30; this.player.maxHp = Math.max(20, this.player.maxHp - 25); break;
      case 'greed': this.lootValueMult += 0.35; this.player.maxSanity = Math.max(10, this.player.maxSanity - 18); break;
      case 'reckless': this.player.walkSpeed *= 1.35; this.player.dmgTakenMult += 0.20; this.bag.addConsumable('grenade'); break;
      case 'bless_might': this.player.damageMult += 0.25; break;
      case 'bless_vital': this.player.maxHp += 35; this.player.heal(35); break;
      case 'bless_will': this.player.maxSanity += 30; this.player.addSanity(30); break;
      case 'bless_calm': this.sanityReduce += 1; break;
      case 'bless_reaper': this.reaperLayers += 1; break;
      case 'bless_marksman': this.player.headshotMult += 0.20; break;
      case 'bless_lucky': this.luckyStarLayers += 1; break;
      case 'bless_healing': this.healingPowerLayers += 1; break;
      case 'curse_san': this.player.damageMult += 0.35; this.player.sanity = Math.max(0, this.player.sanity - 20); break;
      case 'curse_hp': this.lootValueMult += 0.30; this.player.spendHp(25); break;
      case 'curse_sancap': this.player.dmgTakenMult = Math.max(0.5, this.player.dmgTakenMult - 0.15); this.player.maxSanity = Math.max(10, this.player.maxSanity - 15); break;
      case 'curse_dodge': this.dodgeChance = Math.min(0.95, this.dodgeChance + 0.05); this.player.maxHp = Math.max(20, this.player.maxHp - 20); break;
      case 'curse_greed': this.greedRoomsRemaining += 3; this.player.maxHp = Math.max(20, this.player.maxHp - 10); break;
      case 'curse_shield': this.shieldOnClear = true; this.player.dmgTakenMult += 0.15; break;
      case 'curse_thirst': this.thirstRoomsRemaining += 3; this.player.dmgTakenMult += 0.20; break;
      case 'curse_slayer': this.slayerRoomsRemaining += 3; this.player.sanity = Math.max(0, this.player.sanity - 10); break;
    }
    this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    this.player.sanity = Math.min(this.player.sanity, this.player.maxSanity);
    this.audio.altar();
  }

  // ===== 商店（用局内金币结算）=====
  private shopItems: RunShopItem[] = [];

  private openShop(): void {
    this.shopItems = this.rollShopItems();
    this.hud.onShopBuy = (i: number) => this.buyShopItem(i);
    this.hud.onShopClose = () => {
      if (this.currentRoom) this.dungeon.markRoomResolved(this.currentRoom);
      this.completeNode('离开商店，打开地图选择下一关');
    };
    this.hud.onShopRefresh = () => this.refreshShop();
    this.hud.showShop(this.shopItems, this.bag.coins);
  }

  private refreshShop(): void {
    const cost = 30;
    if (this.bag.coins < cost) { this.hud.showToast('💰 金币不足，无法刷新'); return; }
    this.bag.coins -= cost;
    this.shopItems = this.rollShopItems();
    this.audio.loot();
    this.hud.showShop(this.shopItems, this.bag.coins);
  }

  private rollShopItems(): RunShopItem[] {
    const bless = rollBlessing();
    const shieldItem: RunShopItem = Math.random() < 0.68
      ? { kind: 'shield', icon: '🛡️', name: '护盾电池', desc: '补充 1 格本局护盾', price: 75 }
      : { kind: 'shieldBig', icon: '🛡️', name: '重型护盾包', desc: '补充 2 格本局护盾', price: 130 };
    const pool: RunShopItem[] = [
      { kind: 'med', icon: '🩹', name: '医疗包', desc: '+35 生命（入包）', price: 60, payload: 'med' },
      { kind: 'sedative', icon: '💊', name: '镇静剂', desc: '+15 神智（入包）', price: 50, payload: 'sedative' },
      { kind: 'honey', icon: '🍯', name: '野蜂蜜', desc: '生命+10 / 神智+15（入包）', price: 65, payload: 'honey' },
      { kind: 'adren', icon: '💉', name: '肾上腺素', desc: '临时续航，3房后衰减（入包）', price: 110, payload: 'adren' },
      { kind: 'osiris', icon: '🫙', name: '奥西里斯之脂', desc: '生命+35 / 神智-20（入包）', price: 85, payload: 'osiris' },
      { kind: 'grenade', icon: '💣', name: '手雷', desc: '范围爆炸（入包）', price: 70, payload: 'grenade' },
      { kind: 'ammoR', icon: '🔹', name: '步枪弹 ×60', desc: '补充步枪弹', price: 50 },
      { kind: 'blessing', icon: '😇', name: `祝福·${bless.name}`, desc: `${bless.boon}${bless.curse ? '（代价 ' + bless.curse + '）' : ''}`, price: 200, payload: bless },
    ];
    if (this.player.weapons.some((w) => w.ammoType === 'shell')) {
      pool.push({ kind: 'ammoS', icon: '🔴', name: '霰弹 ×24', desc: '补充霰弹弹药', price: 70 });
    }
    // 固定 1 个防御商品 + 随机 3 个局内补给/临时增益
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return [shieldItem, ...pool.slice(0, 3)];
  }

  private buyShopItem(i: number): void {
    const it = this.shopItems[i];
    if (!it || it.sold) return;
    if (this.bag.coins < it.price) { this.hud.showToast('💰 局内金币不足'); return; }
    let ok = true;
    if (it.kind === 'med' || it.kind === 'sedative' || it.kind === 'grenade' ||
        it.kind === 'honey' || it.kind === 'adren' || it.kind === 'osiris') {
      ok = this.bag.addConsumable(it.payload as ConsumableKind);
    } else if (it.kind === 'ammoR') {
      this.bag.addBulletsOf('rifle', 60);
    } else if (it.kind === 'ammoS') {
      this.bag.addBulletsOf('shell', 24);
    } else if (it.kind === 'shield') {
      if (this.player.addShieldUnits(1) <= 0) {
        this.hud.showToast('🛡️ 护盾已满');
        return;
      }
    } else if (it.kind === 'shieldBig') {
      if (this.player.addShieldUnits(2) <= 0) {
        this.hud.showToast('🛡️ 护盾已满');
        return;
      }
    } else if (it.kind === 'blessing') {
      this.applyBuff(it.payload as Pact);
    }
    if (!ok) { this.hud.showToast('🎒 背包空间不足'); return; }
    this.bag.coins -= it.price;
    it.sold = true;
    this.hud.showToast(`已购买 ${it.icon}${it.name}`);
    this.hud.refreshShop(this.shopItems, this.bag.coins);
  }

  private onBossKilled(): void {
    if (!this.boss) return;
    this.kills += 1;
    const chapter = this.chapterForDepth(this.dungeon.currentDepth);
    const firstChapterClear = chapter > this.meta.data.chaptersCleared;
    const firstChapterMark = !this.meta.data.bossMarkChapters.includes(chapter);
    if (firstChapterClear) {
      this.meta.data.chaptersCleared = chapter;
    }
    if (firstChapterMark) {
      this.meta.data.relicMarks += 1;
      this.meta.data.bossMarkChapters.push(chapter);
    }
    if (firstChapterClear || firstChapterMark) this.meta.save();
    const relic = RELICS[(chapter - 1) % RELICS.length];
    const relicData: TreasureItem = { name: relic.name, icon: relic.icon, rarity: 'legend', value: relic.value };
    this.hud.hideBossBar();
    this.hud.showToast(firstChapterMark
      ? `👑 ${this.boss.name} 已陨落！获得圣物，遗迹印记 +1`
      : `👑 ${this.boss.name} 已陨落！获得圣物`);
    this.audio.extractOk();
    if (this.currentRoom) this.markRoomClearedWithBuffs(this.currentRoom);
    this.tryGrantSpecialCollection(chapter, 'boss', false);
    this.tryAddItem(makeTreasureItem(relicData), () => {
      this.state = 'extract';
      this.hud.showToast('BOSS 已击败：可在此直接撤离，或继续深入');
      this.hud.showExtractDialog(this.bag.totalValue);
    });
  }

  private rollSpecialCollection(
    chapter: number, source: SpecialCollectionSource, countsForPity: boolean,
  ): InvItem | null {
    const rates: Record<SpecialCollectionSource, { gold: number; red: number }> = {
      storage: { gold: 0.003, red: 0.0003 },
      treasure: { gold: 0.006, red: 0.0006 },
      curse: { gold: 0.003, red: 0.0003 },
      elite: { gold: 0.006, red: 0.0006 },
      'deep-treasure': { gold: 0.008, red: 0.0010 },
      flawless: { gold: 0.005, red: 0.0006 },
      boss: { gold: 0.008, red: 0.0012 },
    };
    const pool = SPECIAL_COLLECTIONS.filter((item) => item.chapter === chapter);
    if (pool.length === 0) return null;
    const goldPool = pool.filter((item) => item.rarity === 'legend');
    const redPool = pool.filter((item) => item.rarity === 'mythic');
    const pityBonus = Math.min(0.04, Math.max(0, this.meta.data.specialGoldPity - 19) * 0.0015);
    const rate = rates[source];
    let found = null as (typeof SPECIAL_COLLECTIONS)[number] | null;

    if (redPool.length > 0 && Math.random() < rate.red) {
      found = redPool[Math.floor(Math.random() * redPool.length)];
      if (countsForPity) this.meta.data.specialGoldPity += 1;
    } else if (goldPool.length > 0 && Math.random() < rate.gold + pityBonus) {
      found = goldPool[Math.floor(Math.random() * goldPool.length)];
      this.meta.data.specialGoldPity = 0;
    } else if (countsForPity) {
      this.meta.data.specialGoldPity += 1;
    }

    if (countsForPity || found?.rarity === 'legend') this.meta.save();
    return found ? makeSpecialCollectionItem(found) : null;
  }

  private rollSearchSpecialCollection(room: Room): InvItem | null {
    const chapter = Math.max(1, Math.ceil(room.depth / 30));
    if (chapter === 1 && room.type === 'storage') {
      return this.rollSpecialCollection(chapter, 'storage', true);
    }
    if (chapter === 1 && room.type === 'gem') {
      return this.rollSpecialCollection(chapter, 'treasure', true);
    }
    const depthInChapter = ((Math.max(1, room.depth) - 1) % 30) + 1;
    if (chapter === 3 && room.type === 'gem' && depthInChapter >= 16) {
      return this.rollSpecialCollection(chapter, 'deep-treasure', true);
    }
    return null;
  }

  private tryGrantSpecialCollection(
    chapter: number, source: SpecialCollectionSource, countsForPity: boolean,
  ): boolean {
    const item = this.rollSpecialCollection(chapter, source, countsForPity);
    if (!item) return false;
    this.addConfiguredBonusItem(item, '章节特殊收藏');
    return true;
  }

  private tryAddItem(item: InvItem, onFlowResolved?: () => void): void {
    if (onFlowResolved) {
      this.lootQueueDrainedCallbacks.push(() => onFlowResolved());
    }
    this.enqueueIncomingLoot({
      item,
      reason: '新发现物品',
      triggerBonuses: true,
    });
  }

  private addConfiguredBonusItem(item: InvItem, reason: string): void {
    this.enqueueIncomingLoot({ item, reason, triggerBonuses: false });
  }

  private enqueueIncomingLoot(request: PendingLootRequest): void {
    this.incomingLootQueue.push(request);
    this.processIncomingLootQueue();
  }

  private processIncomingLootQueue(): void {
    if (this.processingLootQueue || this.activePendingLoot) return;
    this.processingLootQueue = true;
    try {
      while (!this.activePendingLoot && this.incomingLootQueue.length > 0) {
        const request = this.incomingLootQueue.shift()!;
        if (this.bag.addItem(request.item)) {
          this.completeIncomingLoot(request);
          continue;
        }
        this.activePendingLoot = request;
        this.hud.showPendingLoot(
          request.item,
          request.reason,
          (discarded) => {
            if (this.activePendingLoot !== request) return;
            this.activePendingLoot = null;
            if (discarded.length > 0) {
              this.hud.showToast(`已确认丢弃 ${discarded.length} 件物品`);
            }
            this.completeIncomingLoot(request);
            this.processIncomingLootQueue();
          },
          () => {
            if (this.activePendingLoot !== request) return;
            this.activePendingLoot = null;
            this.hud.showToast(`已放弃 ${request.item.name}`);
            this.processIncomingLootQueue();
          },
        );
      }
    } finally {
      this.processingLootQueue = false;
    }
    this.flushLootQueueDrainedCallbacks();
  }

  private completeIncomingLoot(request: PendingLootRequest): void {
    const item = request.item;
    const qty = item.kind === 'ammo' ? (item.stack || 1) : 1;
    const pickupName = request.reason === '新发现物品'
      ? item.name
      : `${item.name}（${request.reason}）`;
    this.hud.logPickup(item.icon, pickupName, qty, item.color);
    if (!request.triggerBonuses || item.kind !== 'treasure') return;
    if (this.greedRoomActive) {
      const duplicate = makeTreasureItem({
        name: item.name, icon: item.icon, rarity: item.rarity!, value: item.value || 0,
        w: item.w, h: item.h, description: item.description,
      });
      this.addConfiguredBonusItem(duplicate, '贪婪诅咒额外获得');
    }
    if (this.luckyStarLayers > 0) {
      const chance = 0.20 + (this.luckyStarLayers - 1) * 0.05;
      if (Math.random() < chance) {
        this.addConfiguredBonusItem(rollLowQualityTreasure(this.dungeon.currentDepth), '幸运星额外发现');
      }
    }
  }

  private flushLootQueueDrainedCallbacks(): void {
    if (this.processingLootQueue || this.activePendingLoot || this.incomingLootQueue.length > 0) return;
    const callbacks = this.lootQueueDrainedCallbacks.splice(0);
    for (const callback of callbacks) callback();
  }

  private markRoomClearedWithBuffs(room: Room): void {
    this.dungeon.markRoomCleared(room);
    if (!this.shieldOnClear) return;
    const gained = this.player.addTemporaryShield(10, 10);
    if (gained > 0) {
      this.hud.floatText(this.player.position.clone().setY(2.1), `临时护盾 +${Math.round(gained)}`, 'sanity');
    }
  }

  private allTargets(): THREE.Object3D[] {
    const t = this.zombies.targets();
    if (this.boss) return t.concat(this.boss.targets());
    return t;
  }

  // 曳光弹（枪口 → 命中点）
  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3): void {
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const len = Math.max(0.1, start.distanceTo(end));
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
  }

  // 最近的存活敌人（含 BOSS），用于自动瞄准（瞄身体）
  private nearestEnemy(): { z: Zombie | null; boss: TombBoss | null; pos: THREE.Vector3 } | null {
    let bz: Zombie | null = null;
    let best = Infinity;
    for (const z of this.zombies.zombies) {
      if (z.dead) continue;
      const d = z.mesh.position.distanceTo(this.player.position);
      if (d < best) { best = d; bz = z; }
    }
    if (this.boss && !this.boss.dead) {
      const d = this.boss.mesh.position.distanceTo(this.player.position);
      if (d < best) {
        const m = this.boss.mesh;
        return { z: null, boss: this.boss, pos: new THREE.Vector3(m.position.x, m.position.y + this.boss.body.position.y, m.position.z) };
      }
    }
    if (bz) {
      const m = bz.mesh;
      return { z: bz, boss: null, pos: new THREE.Vector3(m.position.x, m.position.y + bz.body.position.y, m.position.z) };
    }
    return null;
  }

  // 当前索敌目标：锁定一个目标直到其死亡；否则取最近并锁定
  private currentTarget(): { z: Zombie | null; boss: TombBoss | null; pos: THREE.Vector3 } | null {
    if (this.lockedZombie && !this.lockedZombie.dead) {
      const m = this.lockedZombie.mesh;
      return { z: this.lockedZombie, boss: null, pos: new THREE.Vector3(m.position.x, m.position.y + this.lockedZombie.body.position.y, m.position.z) };
    }
    this.lockedZombie = null;
    const near = this.nearestEnemy();
    if (near && near.z) this.lockedZombie = near.z;  // 锁定最近的丧尸
    return near;
  }

  // 点击丧尸手动切换索敌目标
  private tryRetarget(): boolean {
    this.raycaster.setFromCamera(this.input.mouseNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.zombies.targets(), false);
    if (hits.length === 0) return false;
    const z = hits[0].object.userData.zombie as Zombie | undefined;
    if (z && !z.dead) { this.lockedZombie = z; this.hud.showToast('🎯 切换索敌目标'); return true; }
    return false;
  }

  // 由屏幕NDC在当前(俯瞰)相机下求世界瞄准点：
  // 命中真实几何(敌人/地面/墙/箱子等)→用命中点；都没命中→落到躯干高度水平面
  private aimWorldFromNDC(ndc: THREE.Vector2): THREE.Vector3 {
    this.raycaster.setFromCamera(ndc, this.camera);
    // 递归射线检测整个场景，取离相机最近、且不属于玩家自身的可见网格命中点
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      const o = h.object as THREE.Object3D;
      if (!(o as THREE.Mesh).isMesh) continue;
      if (o.visible === false) continue;
      if (this.isUnderPlayer(o)) continue;   // 跳过玩家自身模型
      return h.point.clone();
    }
    // 没命中任何几何：落到躯干高度水平面
    const ray = this.raycaster.ray;
    const planeY = this.player.position.y + 1.0;
    if (Math.abs(ray.direction.y) > 1e-4) {
      const t = (planeY - ray.origin.y) / ray.direction.y;
      if (t > 0) return ray.origin.clone().addScaledVector(ray.direction, t);
    }
    return ray.origin.clone().addScaledVector(ray.direction, 12);
  }

  // 判断物体是否属于玩家模型（避免瞄准射线打到自己身上）
  private isUnderPlayer(o: THREE.Object3D): boolean {
    let p: THREE.Object3D | null = o;
    while (p) {
      if (p === this.player.rig) return true;
      p = p.parent;
    }
    return false;
  }

  // 角色是否大致面向目标（±45°）——自动射击的朝向闸门，避免转身前/朝背后开枪致曳光反向
  private facingTarget(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.player.position.x;
    const dz = pos.z - this.player.position.z;
    const desired = Math.atan2(-dx, -dz);
    let d = desired - this.player.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) < 0.79;   // ~45°
  }

  // ===== 自动射击：瞄准敌人身体，固定不暴击 =====
  private autoShoot(target: { z: Zombie | null; boss: TombBoss | null; pos: THREE.Vector3 }): void {
    if (!this.player.canFire()) {
      if (this.player.ammo <= 0 && this.player.reloading <= 0) this.player.fire(this.audio);
      return;
    }
    this.player.fire(this.audio);
    const weapon = this.player.weapon;
    const end = target.z ? new THREE.Vector3(target.z.mesh.position.x, target.z.mesh.position.y + target.z.body.position.y, target.z.mesh.position.z) : target.pos.clone();
    this.spawnTracer(this.player.muzzlePos.clone(), end);
    const dmg = Math.round(this.player.baseDamage * this.player.damageMult);
    for (let p = 0; p < weapon.pellets; p++) {
      if (target.z && !target.z.dead) {
        const result = target.z.takeDamage(dmg, 'body');  // 身体：不触发暴击
        this.hud.showHitmarker(false);
        this.hud.floatText(end, `${result.dmg}`, 'dmg');
        this.audio.hit();
        if (result.killed) { this.onKill(target.z); break; }
      } else if (target.boss && !target.boss.dead) {
        const result = target.boss.takeDamage(dmg, 'body');
        this.syncBossBar();
        this.hud.showHitmarker(false);
        this.hud.floatText(end, `${result.dmg}`, 'dmg');
        this.audio.hit();
        if (result.killed) { this.onBossKilled(); break; }
      }
    }
  }

  private aimAssistHeadNDC(): THREE.Vector2 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const radiusPx = this.aimAssistRadiusPx();
    if (radiusPx <= 0) return null;
    let best: { ndc: THREE.Vector2; screenDistance: number; worldDistance: number } | null = null;
    const world = new THREE.Vector3();
    const consider = (head: THREE.Object3D): void => {
      head.getWorldPosition(world);
      const projected = world.clone().project(this.camera);
      if (projected.z < -1 || projected.z > 1) return;
      const screenDistance = Math.hypot(projected.x * rect.width * 0.5, projected.y * rect.height * 0.5);
      if (screenDistance > radiusPx) return;
      const worldDistance = world.distanceTo(this.camera.position);
      if (!best || screenDistance < best.screenDistance - 0.5 ||
          (Math.abs(screenDistance - best.screenDistance) <= 0.5 && worldDistance < best.worldDistance)) {
        best = { ndc: new THREE.Vector2(projected.x, projected.y), screenDistance, worldDistance };
      }
    };
    for (const zombie of this.zombies.zombies) {
      if (!zombie.dead) consider(zombie.head);
    }
    if (this.boss && !this.boss.dead) consider(this.boss.head);
    return best ? best.ndc : null;
  }

  // ADS 时准星直接命中敌人，或头部进入吸附范围，都会持续开火。
  private crosshairOnEnemy(): boolean {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    return this.raycaster.intersectObjects(this.allTargets(), false).length > 0 || this.aimAssistHeadNDC() !== null;
  }

  // ===== 手动射击（ADS）：从画面中心射出，落点为摄像机中心 =====
  private tryShoot(): void {
    if (!this.player.canFire()) {
      if (this.player.ammo <= 0 && this.player.reloading <= 0) this.player.fire(this.audio);
      return;
    }
    this.player.fire(this.audio);
    const weapon = this.player.weapon;
    const targets = this.allTargets();
    const assistedHeadNDC = this.aimAssistHeadNDC();

    for (let p = 0; p < weapon.pellets; p++) {
      const ndc = assistedHeadNDC ? assistedHeadNDC.clone() : new THREE.Vector2(0, 0);
      if (weapon.pellets > 1) {
        ndc.x += (Math.random() - 0.5) * weapon.spread * 2;
        ndc.y += (Math.random() - 0.5) * weapon.spread * 2;
      }
      this.raycaster.setFromCamera(ndc, this.camera);
      const hits = this.raycaster.intersectObjects(targets, false);

      const start = this.player.muzzlePos.clone();
      const end = hits.length > 0
        ? hits[0].point.clone()
        : this.raycaster.ray.at(30, new THREE.Vector3());
      this.spawnTracer(start, end);

      if (hits.length > 0) {
        const obj = hits[0].object;
        const part = obj.userData.part as string;
        // 神枪手：爆头额外加成
        const hsMult = part === 'head' ? this.player.headshotMult : 1;
        const dmg = Math.round(this.player.baseDamage * this.player.damageMult * hsMult);
        if (obj.userData.boss) {
          const result = (obj.userData.boss as TombBoss).takeDamage(dmg, part);
          this.syncBossBar();
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
      const content = this.searchTarget.userData.content as InvItem | undefined;
      this.hud.showSearchPanel('搜索中…');
      this.hud.showSearchRing(content ? content.color : '#ffffff');  // 搜索进度环仍显示当前物品品质色
    }
  }

  private finishSearch(): void {
    this.hud.hideSearchPanel();
    this.hud.hideSearchRing();
    this.searchTarget = null;
    this.completeNode('搜刮结束，打开地图选择下一关');
  }

  // 战斗房清场后激活战利品箱高亮（变为可搜索）
  private activateRoomLoot(room: Room): void {
    for (const c of room.crates) {
      if (c.userData.searched) continue;
      const halo = c.userData.halo as THREE.Mesh | undefined;
      if (halo) halo.visible = true;
    }
  }

  private onEnterRoom(room: Room): boolean {
    this.enteredDepth = room.depth;
    this.greedRoomActive = this.greedRoomsRemaining > 0;
    this.thirstRoomActive = this.thirstRoomsRemaining > 0;
    this.slayerRoomActive = this.slayerRoomsRemaining > 0;
    if (this.greedRoomActive) this.greedRoomsRemaining -= 1;
    if (this.thirstRoomActive) this.thirstRoomsRemaining -= 1;
    if (this.slayerRoomActive) this.slayerRoomsRemaining -= 1;
    if (this.healingPowerLayers > 0) {
      const healing = this.healingPowerLayers * 3;
      const before = this.player.hp;
      this.player.heal(healing);
      const gained = Math.round(this.player.hp - before);
      if (gained > 0) this.hud.floatText(this.player.position.clone().setY(2.0), `+${gained} ❤️`, 'coin');
    }
    // 肾上腺素衰减：之后3个房间各 -10 生命/理智
    if (!room.revisited && this.adrenalineRooms > 0) {
      this.adrenalineRooms -= 1;
      this.player.changeHp(-10);
      this.player.addSanity(-10);
      this.hud.floatText(new THREE.Vector3(this.player.position.x, 2.6, this.player.position.z - 2), '肾上腺素 -10', 'sanity');
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
      return false;
    }
    return true;
  }

  private onRoomCenter(room: Room): void {
    this.triggeredDepth = room.depth;
    if (!room.revisited) this.currentRoomTookDamage = false;
    const w = room.type === 'boss' ? 15 : 11;
    const nodeState = this.dungeon.roomNodeState(room);
    if (room.revisited) this.hud.showToast('已返回探索过的房间：怪物与资源状态保持不变');
    // 进入会刷怪的房间：一次性扣除神智（头脑冷静减免，不再持续消耗）
    const sanCost = Math.max(0, sanityCostFor(room.type, room.depth) - this.sanityReduce);
    if (!nodeState?.sanityPaid && sanCost > 0) {
      this.player.sanity = Math.max(0, this.player.sanity - sanCost);
      this.hud.floatText(new THREE.Vector3(this.player.position.x, 2.6, this.player.position.z - 2), `神智 -${sanCost}`, 'sanity');
      this.audio.sanityHit();
      if (this.player.sanity <= 0) { this.endRun(true, '神智崩溃 — 强制撤离'); return; }
    }
    if (!nodeState?.sanityPaid) this.dungeon.markSanityPaid(room);

    // 已清理的战斗房永久保持安全；未拿完的箱子/祝福仍按原状态留在房间里。
    if (nodeState?.cleared && (room.type === 'supply' || room.type === 'gem' || room.type === 'blessing' || room.type === 'boss')) {
      if ((room.type === 'supply' || room.type === 'gem') && room.crates.some((c) => !c.userData.searched)) {
        this.activateRoomLoot(room);
        this.state = 'search';
        this.enableRouteChoiceFromMap();
        this.hud.showSearchPanel('已清空房间：可继续搜刮，或打开地图离开');
      } else if (room.type === 'blessing' && !nodeState.pickupTaken) {
        this.revealBlessing(room);
        this.state = 'interact';
        this.enableRouteChoiceFromMap();
        this.hud.setPrompt('未领取的祝福仍在祭坛上；也可打开地图离开');
      } else {
        this.completeNode('这里已经探索完成，可选择相邻房间');
      }
      return;
    }
    if (room.type === 'supply' || room.type === 'gem') {
      const chapter = Math.max(1, Math.ceil(room.depth / 30));
      const depthInChapter = Math.max(0, (room.depth - 1) % 30);
      const count = 3 + Math.floor(depthInChapter / 7)
        + Math.min(2, chapter - 1) + Math.floor(Math.random() * 2);
      const kinds = this.zombies.composition(room.depth, count);
      this.zombies.spawnWave(room.zCenter, room.zExit + 1.5, w, room.depth, kinds);
      const summary: Record<string, number> = {};
      for (const k of kinds) summary[k] = (summary[k] || 0) + 1;
      const txt = Object.keys(summary).map((k) => `${KIND_NAMES[k]}×${summary[k]}`).join(' ');
      this.hud.showToast(`⚔ 遭遇：${txt}`);
      this.audio.zombieGroan(0.1);
      this.state = 'combat';
    } else if (room.type === 'blessing') {
      this.zombies.spawnWave(room.zCenter, room.zExit + 1.5, w, room.depth, ['elite', 'normal', 'normal']);
      this.hud.showToast('😇 祝福祭坛：击败精英后于祭坛三选一');
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
      this.hud.showBossBar(`👹 ${this.boss.name}`);
      this.state = 'combat';
      this.audio.bossRoar();
    } else if (room.type === 'exit') {
      this.state = 'interact';
      this.enableRouteChoiceFromMap();
      this.hud.showToast('已抵达撤离点：点击绿色撤离环确认撤离');
      this.hud.setPrompt('点击房间中央的绿色撤离环；也可打开地图离开撤离点');
    } else if (room.type === 'storage') {
      if (room.crates.some((crate) => !crate.userData.searched)) {
        this.activateRoomLoot(room);
        this.state = 'search';
        this.enableRouteChoiceFromMap();
        this.hud.showToast('📦 储物间：无怪物，可直接搜索箱子');
        this.hud.setPrompt('搜索白色高亮箱子；进度环颜色代表当前物品品质');
        this.hud.showSearchPanel('储物间：搜索箱子或打开地图前进');
      } else {
        this.completeNode('储物间已经搜空，可选择相邻房间');
      }
    } else if (room.type === 'corridor') {
      this.completeNode('已返回起点，可选择相邻房间');
    } else if (room.type === 'curse') {
      if (nodeState?.resolved || nodeState?.pickupTaken) {
        this.completeNode('祭坛已经沉寂，可选择相邻房间');
        return;
      }
      // 门口停下，点击恶魔祭坛抉择后再继续
      this.state = 'interact';
      this.enableRouteChoiceFromMap();
      this.hud.setPrompt('点击发光的诅咒祭坛抉择；也可打开地图直接前往下一关');
    } else if (room.type === 'safehouse') {
      if (nodeState?.resolved) {
        this.completeNode('篝火已经使用过，可选择相邻房间');
        return;
      }
      // 无怪：篝火与补给立即可交互，完成后打开地图选择下一关
      if (room.crates.length) this.activateRoomLoot(room);
      this.state = 'search';
      this.enableRouteChoiceFromMap();
      this.hud.setPrompt('点击篝火回理智、搜刮补给；也可打开地图直接前往下一关');
      this.hud.showSearchPanel('安全屋：搜刮或打开地图前进');
    } else if (room.type === 'shop') {
      if (nodeState?.resolved) {
        this.completeNode('商人已经离开，可选择相邻房间');
        return;
      }
      this.state = 'shop';
      this.openShop();
    }
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;

    if (this.developerPaused) {
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      return;
    }

    if (this.transitioning) {
      this.updateRouteTransition(dt);
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      return;
    }

    // 打开背包 / 暂停按钮 / 路线图：仅渲染，冻结一切模拟
    if (this.paused || this.userPaused || this.routePaused) {
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      return;
    }

    this.audio.updateAmbient(dt, this.player.sanity / this.player.maxSanity);
    this.dungeon.flicker(time);
    // 仪式感开门
    this.dungeon.updateDoors(dt, this.player.position.z, () => this.audio.doorRumble());

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

    // 掉落光点：漂浮 + 自转；玩家走远后回收
    for (const o of this.lootOrbs) {
      o.mesh.position.y = 1.0 + Math.sin(time * 3 + o.bob) * 0.12;
      o.mesh.rotation.y += dt * 2;
    }
    const goneOrbs = this.lootOrbs.filter((o) => o.mesh.position.z > this.player.position.z + 7);
    for (const o of goneOrbs) this.scene.remove(o.mesh);
    this.lootOrbs = this.lootOrbs.filter((o) => o.mesh.position.z <= this.player.position.z + 7);
    this.maybeFinishPendingLoot();

    if (this.state !== 'over') {
      const blocked = this.state === 'intel' || this.state === 'shop' || this.state === 'choice' || this.state === 'extract';
      if (this.input.wasPressed('KeyR')) this.tryReload();
      if (this.input.wasPressed('KeyE') && this.assistant && !blocked) this.useSkill();
      if (this.input.wasPressed('KeyQ')) {
        this.player.switchWeapon(this.audio);
        this.hud.setWeaponSelected(this.player.weaponIndex);
      }
      if (this.input.wasPressed('Digit1')) this.useConsumable(this.hud.getQuickConsumable(0));
      if (this.input.wasPressed('Digit2')) this.useConsumable(this.hud.getQuickConsumable(1));
      if (this.input.wasPressed('Digit3')) this.useConsumable('grenade');

      // V6：长按进入手动 ADS（含搜索房；短按仍用于点击箱子，靠 0.15s 阈值区分）
      const manualAim = !blocked && this.player.alive && this.input.isAiming();
      // 瞄准时暂停自动前进，避免操控/旋转时角色仍向前漂移
      const moving = this.state === 'moving' && !manualAim;
      const aimEnemy = this.currentTarget();
      this.player.setAimTarget(
        (this.state === 'combat' && !manualAim && aimEnemy) ? aimEnemy.pos : null
      );
      this.hud.setAds(manualAim);
      // 进入瞄准的边沿：把准星对准“按下点击的位置”，并以该光标NDC为基准做相对偏移
      if (manualAim && !this.wasManualAim) {
        // 用“触发瞄准这一帧的光标位置”作为目标与相对基准，二者一致→进入后零漂移
        const anchor = this.input.mouseNDC.clone();
        const aim = this.aimWorldFromNDC(anchor);   // 点击处的世界点
        // 相机中心射线经过“支点 pivot = 肩高 + 右肩偏移”，而非玩家身体；
        // 令 fwd = 归一化(目标 - pivot) 才能让准星精确落在点击点。pivot 的右肩偏移依赖 yaw，迭代求解。
        const pp = this.player.position;
        let yaw = Math.atan2(-(aim.x - pp.x), -(aim.z - pp.z));
        let pitch = 0;
        for (let i = 0; i < 4; i++) {
          const rx = Math.cos(yaw), rz = -Math.sin(yaw);   // 角色右方
          const pivX = pp.x + rx * 0.5, pivY = pp.y + 1.5, pivZ = pp.z + rz * 0.5;
          const fx = aim.x - pivX, fy = aim.y - pivY, fz = aim.z - pivZ;
          yaw = Math.atan2(-fx, -fz);
          pitch = Math.atan2(fy, Math.max(0.3, Math.hypot(fx, fz)));
        }
        const basePitch = Math.max(-0.7, Math.min(1.0, pitch));
        this.player.enterAim(yaw, basePitch, anchor);
      }
      this.wasManualAim = manualAim;
      const ammoType = this.player.weapon.ammoType;
      const reserve = ammoType === 'pistol' ? 9999 : this.bag.bulletsOf(ammoType);  // 手枪无限
      this.player.update(dt, moving, this.input.mouseNDC, this.audio, time, manualAim, reserve);
      this.hud.setAimAssistLocked(manualAim && this.aimAssistHeadNDC() !== null);
      if (ammoType !== 'pistol' && this.player.reloadDrew > 0) this.bag.takeBulletsOf(ammoType, this.player.reloadDrew);

      if (this.assistant) {
        this.assistant.update(dt, time, this.player.position, this.scene);
        if (!blocked) this.updateAssistantAutoAttack();
      }

      if (!blocked && (this.state === 'combat' || this.zombies.zombies.length > 0)) {
        const hits = this.zombies.update(dt, time, this.player.position, this.audio);
        for (let i = 0; i < hits.hpHits; i++) {
          this.applyMonsterDamage(8 + Math.floor(this.dungeon.currentDepth / 4));
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
            const dmg = 22;
            this.applyMonsterDamage(dmg);
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
            const room = this.currentRoom;
            if (room && Math.ceil(room.depth / 30) === 3 && !this.currentRoomTookDamage) {
              this.tryGrantSpecialCollection(3, 'flawless', false);
            }
            if (room && room.type === 'blessing' && Math.ceil(room.depth / 30) === 2) {
              this.tryGrantSpecialCollection(2, 'elite', false);
            }
            if (room) this.markRoomClearedWithBuffs(room);
            if (room && room.type === 'blessing') {
              // 神之祝福：清场后在前方圆台激活可点击特效，点击领取
              this.revealBlessing(room);
              this.state = 'interact';
              this.enableRouteChoiceFromMap();
              this.hud.showToast('😇 精英已伏诛！点击圆台上的祝福光环领取');
              this.hud.setPrompt('点击圆台上的金色光环领取祝福；也可打开地图直接前往下一关');
            } else if (room && room.crates.some((c) => !c.userData.searched)) {
              // 补给/宝石：清场后揭示战利品箱可搜
              this.activateRoomLoot(room);
              this.state = 'search';
              this.enableRouteChoiceFromMap();
              this.hud.showToast('✅ 区域已清空，可搜刮发光的战利品箱');
              this.hud.setPrompt('点击发光的箱子搜刮；也可打开地图直接前往下一关');
              this.hud.showSearchPanel('搜刮箱子，或打开地图前进');
            } else {
              this.completeNode('✅ 区域安全，打开地图选择下一关');
            }
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
          const dmg = 7 + Math.floor(this.dungeon.currentDepth / 5);
          this.applyMonsterDamage(dmg);
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

      if (!blocked && this.player.alive) {
        if (manualAim) {
          // 手动：长按只进入瞄准状态，仅当准星(画面中心)指向敌人时才开火
          if (this.crosshairOnEnemy()) this.tryShoot();
        } else if (this.state === 'combat' && aimEnemy && this.facingTarget(aimEnemy.pos)) {
          this.autoShoot(aimEnemy);     // 自动：面向目标后再开火，瞄准身体不暴击
        }
      }

      // 统一点击：金币光点 > 战斗中点丧尸切换索敌 > 祭坛/篝火 > 搜索箱子
      if (!blocked && this.input.consumeClick()) {
        if (!this.tryCollectOrb()) {
          if (this.state === 'combat' && this.tryRetarget()) {
            // 已切换索敌目标
          } else if (!this.tryCollectPickup()) {
            if (this.state === 'search' && !this.searchTarget) this.trySearchClick();
          }
        }
      }
      if (this.state === 'search' && this.searchTarget) {
          const speed = this.assistant ? this.assistant.searchSpeedMult : 1;
          this.searchProgress += (dt / 1.3) * speed;
          // 圆环跟随箱子顶部并显示进度
          const wp = new THREE.Vector3();
          this.searchTarget.getWorldPosition(wp);
          wp.y += 1.1;
          this.hud.updateSearchRing(this.searchProgress, wp, this.camera);
          if (Math.floor(this.searchProgress * 10) !== Math.floor((this.searchProgress - dt / 1.3) * 10)) {
            this.audio.searchTick();
          }
          if (this.searchProgress >= 1) {
            const contents = (this.searchTarget.userData.contents || []) as InvItem[];
            const searchCount = Number(this.searchTarget.userData.searchCount || 0);
            const content = contents[searchCount] as InvItem | undefined;
            const crateIndex = Number(this.searchTarget.userData.routeCrateIndex || 0);
            const nextSearchCount = Math.min(contents.length, searchCount + 1);
            const emptied = nextSearchCount >= contents.length;
            this.searchTarget.userData.searchCount = nextSearchCount;
            this.searchTarget.userData.searched = emptied;
            this.searchTarget.userData.content = contents[nextSearchCount];
            const mat = this.searchTarget.material as THREE.MeshStandardMaterial;
            mat.color.setHex(emptied ? 0x3a3a3a : 0x7a5a30);
            mat.emissive.setHex(emptied ? 0x000000 : 0xffffff);
            mat.emissiveIntensity = 0;
            const halo = this.searchTarget.userData.halo as THREE.Mesh | undefined;
            if (halo) halo.visible = !emptied;
            if (this.currentRoom) {
              if (emptied) this.currentRoom.searched += 1;
              this.dungeon.markCrateSearch(this.currentRoom, crateIndex, nextSearchCount);
            }
            this.audio.loot();
            const specialCollection = this.currentRoom
              ? this.rollSearchSpecialCollection(this.currentRoom)
              : null;
            const foundItem = specialCollection || content;
            if (foundItem) {
              const fp = new THREE.Vector3();
              this.searchTarget.getWorldPosition(fp);
              fp.y += 1.0;
              this.hud.flyItemToBag(fp, foundItem.icon, foundItem.color, this.camera);
              if (specialCollection) {
                this.addConfiguredBonusItem(specialCollection, '章节特殊收藏');
              } else {
                this.tryAddItem(foundItem);
              }
            }
            this.searchTarget = null;
            this.hud.hideSearchRing();
            if (this.state === 'search') {
              const room = this.currentRoom;
              if (room && room.crates.every((crate) => crate.userData.searched)) {
                if (room.type === 'safehouse') {
                  this.maybeFinishSafehouse();   // 安全屋需搜完且点过篝火
                } else {
                  this.finishSearch();
                }
              } else {
                this.enableRouteChoiceFromMap();
                this.hud.showSearchPanel(emptied
                  ? '箱子已空，搜索其他白色高亮箱子或打开地图前进'
                  : '箱内仍有物品，可继续搜索当前箱子');
              }
            } else {
              this.hud.hideSearchPanel();
            }
          }
        }

      if (!this.player.alive && this.state !== 'over') {
        this.endRun(false, 'YOU DIED — 战利品全部丢失');
      }
    }

    this.input.endFrame();

    this.hud.update(
      dt, this.player.hp, this.player.maxHp, this.player.shieldCount, this.player.maxShieldCount,
      this.player.sanity, this.player.maxSanity,
      this.player.ammo, this.player.magSize, this.player.reloading, this.player.reloadTime,
      this.bag.totalValue, this.dungeon.currentDepth,
      STATE_LABEL[this.state], this.input.mousePx, this.player.weapon.ammoType === 'pistol' ? -1 : this.bag.bulletsOf(this.player.weapon.ammoType), this.bag.coins
    );
    this.hud.updateFloaters(dt, this.camera);

    this.renderer.render(this.scene, this.camera);
  }
}
