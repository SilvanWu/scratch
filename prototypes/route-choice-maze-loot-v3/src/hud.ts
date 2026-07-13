import * as THREE from 'three';
import { RouteNode, RouteMapSnapshot, RouteDoorDirection, ROOM_INFO, sanityCostFor } from './rooms';
import { Backpack, InvItem, RARITY_INFO, ConsumableKind, CONSUMABLE_INFO } from './items';
import { Pact } from './pacts';

interface Floater {
  el: HTMLElement;
  worldPos: THREE.Vector3;
  age: number;
  life: number;
}

const CELL = 44;
const QUICK_SLOT_KEY = 'tomb_quick_slots_v1';
const QUICK_SLOT_DEFAULTS: ConsumableKind[] = ['med', 'sedative'];

const ROOM_ART: Record<string, string> = {
  corridor: 'assets/art/route/route-start-256.webp',
  storage: 'assets/art/route/route-storage-256.webp',
  supply: 'assets/art/route/route-supply-256.webp',
  gem: 'assets/art/route/route-gem-256.webp',
  blessing: 'assets/art/route/route-blessing-256.webp',
  curse: 'assets/art/route/route-curse-256.webp',
  safehouse: 'assets/art/route/route-campfire-256.webp',
  shop: 'assets/art/route/route-shop-256.webp',
  boss: 'assets/art/route/route-boss-256.webp',
};

const ROOM_LABEL: Record<string, string> = {
  corridor: '起点',
  storage: '储物',
  supply: '补给',
  gem: '宝藏',
  blessing: '祝福',
  curse: '献祭',
  safehouse: '篝火',
  shop: '商店',
  exit: '撤离点',
  boss: 'BOSS',
};

function hasRoomArt(type: string): boolean {
  return ROOM_ART[type] !== undefined;
}

function roomArtHtml(type: string, fallbackIcon: string, className: string): string {
  const src = ROOM_ART[type];
  if (!src) return fallbackIcon;
  return `<img class="${className}" src="${src}" alt="" loading="lazy" decoding="async" ` +
    `onerror="this.style.display='none';this.nextElementSibling.style.display='inline'">` +
    `<span class="${className}-fallback">${fallbackIcon}</span>`;
}

export class HUD {
  private hpFill: HTMLElement;
  private hpText: HTMLElement;
  private sanFill: HTMLElement;
  private sanText: HTMLElement;
  private shieldText: HTMLElement;
  private pickupLog!: HTMLElement;
  private depthText: HTMLElement;
  private stateText: HTMLElement;
  private crosshair: HTMLElement;
  private hitmarker: HTMLElement;
  private toastEl: HTMLElement;
  private promptEl: HTMLElement;
  private vignette: HTMLElement;
  private sanVignette!: HTMLElement;
  private roomTransition: HTMLElement;
  private routeMap: HTMLElement;
  private floaterLayer: HTMLElement;
  private searchPanel: HTMLElement;
  private searchLabel: HTMLElement;
  private choiceOverlay: HTMLElement;
  private choiceCards: HTMLElement;
  private choiceRoutePreview: HTMLElement;
  private choiceRouteDepth: HTMLElement;
  private choiceRouteClose: HTMLElement;
  private routeChoiceSelected: HTMLElement;
  private routeChoiceConfirm: HTMLElement;
  private extractOverlay: HTMLElement;
  private extractDialogMode: 'boss' | 'exit' = 'boss';
  private endOverlay: HTMLElement;
  private endTitle: HTMLElement;
  private endStats: HTMLElement;
  private intelOverlay: HTMLElement;
  private intelText: HTMLElement;
  private bossBar: HTMLElement;
  private bossName: HTMLElement;
  private bossFill: HTMLElement;

  // 底部触屏 HUD
  private bagBtn: HTMLElement;
  private bagBtnVal: HTMLElement;
  private weaponSlotsEl: HTMLElement;
  private weaponBtns: HTMLElement[] = [];
  private nadeBtn: HTMLElement;
  private itemBtn: HTMLElement;
  private itemExpand: HTMLElement;
  private itemDropdown: HTMLElement;
  private skillBtn: HTMLElement;
  private selIndex: number = 0;
  private quickSlots: ConsumableKind[] = QUICK_SLOT_DEFAULTS.slice();
  private quickSlotMenu: HTMLElement | null = null;

  // 网格背包
  private bagOverlay: HTMLElement;
  private bagValue: HTMLElement;
  private bagBullets: HTMLElement;
  private invGrid: HTMLElement;
  private wslotEls: HTMLElement[] = [];
  private bag: Backpack | null = null;
  private popupEl: HTMLElement | null = null;
  private drag: { item: InvItem; ghost: HTMLElement; el: HTMLElement; offX: number; offY: number; downX: number; downY: number; moved: boolean } | null = null;

  // 搜索圆环
  private searchRing: HTMLElement;
  private srFg: HTMLElement;

  // 商店
  private shopOverlay: HTMLElement;
  private shopItemsEl: HTMLElement;
  private shopBank: HTMLElement;
  onShopBuy: ((index: number) => void) | null = null;
  onShopClose: (() => void) | null = null;
  onShopRefresh: (() => void) | null = null;

  private toastTimer: number = 0;
  private hitTimer: number = 0;
  private adsMode: boolean = false;
  private floaters: Floater[] = [];
  private stage: HTMLElement;
  private routeMapExpanded: boolean = false;
  private routeChoiceMode: boolean = false;
  private routeSnapshot: RouteMapSnapshot | null = null;
  private routeMapDragViewport: HTMLElement | null = null;
  private routeMapDragPointerId: number = -1;
  private routeMapDragStartX: number = 0;
  private routeMapDragStartY: number = 0;
  private routeMapDragStartScrollLeft: number = 0;
  private routeMapDragStartScrollTop: number = 0;
  private routeMapDragMoved: boolean = false;
  private routeMapSuppressClickUntil: number = 0;
  private routeMapZoom: number = 1;
  private routeChoiceZoom: number = 1;
  private routeChoiceOptions: RouteNode[] = [];
  private routeChoiceSelectedId: string | null = null;
  private routeChoicePanelClosable: boolean = false;
  private routeChoicePreviewFocusX: number = 0;
  private routeChoicePreviewFocusY: number = 0;

  onChoice: ((node: RouteNode) => void) | null = null;
  onExtract: ((leave: boolean) => void) | null = null;
  onExitConfirm: ((leave: boolean) => void) | null = null;
  onIntelContinue: (() => void) | null = null;
  onWeaponTap: ((index: number) => void) | null = null;
  onUseConsumable: ((kind: ConsumableKind) => void) | null = null;
  onUseSkill: (() => void) | null = null;
  // 背包相关回调（game 端）
  onInventoryDirty: (() => void) | null = null;            // 装备/库存变化 → 同步武器与底部HUD
  onUseConsumableItem: ((kind: ConsumableKind) => void) | null = null; // 在背包内使用消耗品
  onBagToggle: ((open: boolean) => void) | null = null;    // 打开/关闭背包（暂停）
  onPauseToggle: ((paused: boolean) => void) | null = null; // 暂停按钮
  onRouteMapToggle: ((open: boolean) => void) | null = null; // 展开路线图（暂停）
  onSensitivity: ((v: number) => void) | null = null;       // 瞄准灵敏度滑块

  constructor() {
    const $ = (id: string): HTMLElement => document.getElementById(id)!;
    this.quickSlots = this.loadQuickSlots();
    this.stage = $('stage');
    this.hpFill = $('hp-fill'); this.hpText = $('hp-text');
    this.sanFill = $('san-fill'); this.sanText = $('san-text');
    this.shieldText = $('shield-text');
    this.pickupLog = $('pickup-log'); this.depthText = $('depth-text');
    this.stateText = $('state-text');
    this.crosshair = $('crosshair'); this.hitmarker = $('hitmarker');
    this.toastEl = $('toast'); this.promptEl = $('prompt');
    this.vignette = $('vignette');
    this.sanVignette = $('vignette-san');
    this.roomTransition = $('room-transition');
    this.routeMap = $('route-map');
    this.routeMap.addEventListener('click', (e) => this.onRouteMapClick(e));
    this.routeMap.addEventListener('pointerdown', (e) => this.onRouteMapDragStart(e));
    this.routeMap.addEventListener('wheel', (e) => this.onRouteMapWheel(e), { passive: false });
    window.addEventListener('pointerdown', (e) => this.onRouteMapOutsidePointer(e), true);
    window.addEventListener('pointermove', (e) => this.onRouteMapDragMove(e), true);
    window.addEventListener('pointerup', (e) => this.onRouteMapDragEnd(e), true);
    window.addEventListener('pointercancel', (e) => this.onRouteMapDragEnd(e), true);
    window.addEventListener('keydown', (e) => this.onRouteMapKeyDown(e), true);
    window.addEventListener('keydown', (e) => this.onBagKeyDown(e), true);
    window.addEventListener('keydown', (e) => this.onItemExpandKeyDown(e), true);
    this.floaterLayer = $('floater-layer');
    this.searchPanel = $('search-panel');
    this.searchLabel = $('search-label');
    this.choiceOverlay = $('choice-overlay');
    this.choiceCards = $('choice-cards');
    this.choiceRoutePreview = $('choice-route-preview');
    this.choiceRoutePreview.addEventListener('wheel', (e) => this.onRouteChoiceWheel(e), { passive: false });
    this.choiceRouteDepth = $('choice-route-depth');
    this.choiceRouteClose = $('choice-route-close');
    this.routeChoiceSelected = $('route-choice-selected');
    this.routeChoiceConfirm = $('route-choice-confirm');
    this.extractOverlay = $('extract-overlay');
    this.endOverlay = $('end-overlay');
    this.endTitle = $('end-title');
    this.endStats = $('end-stats');
    this.intelOverlay = $('intel-overlay');
    this.intelText = $('intel-text');
    this.bossBar = $('boss-bar');
    this.bossName = $('boss-name');
    this.bossFill = $('boss-fill');

    this.bagBtn = $('bag-btn');
    this.bagBtnVal = $('bag-btn-val');
    this.weaponSlotsEl = $('weapon-slots');
    this.nadeBtn = $('nade-btn');
    this.itemBtn = $('item-btn');
    this.itemExpand = $('item-expand');
    this.itemDropdown = $('item-dropdown');
    this.skillBtn = $('skill-btn');

    this.bagOverlay = $('bag-overlay');
    this.bagValue = $('bag-value');
    this.bagBullets = $('bag-bullets');
    this.invGrid = $('inv-grid');
    this.wslotEls = [$('wslot-0'), $('wslot-1')];

    this.searchRing = $('search-ring');
    this.srFg = this.searchRing.querySelector('.sr-fg') as HTMLElement;

    this.shopOverlay = $('shop-overlay');
    this.shopItemsEl = $('shop-items');
    this.shopBank = $('shop-bank');
    $('shop-close').addEventListener('click', () => {
      this.shopOverlay.style.display = 'none';
      if (this.onShopClose) this.onShopClose();
    });
    $('shop-refresh').addEventListener('click', () => { if (this.onShopRefresh) this.onShopRefresh(); });

    $('extract-yes').addEventListener('click', () => {
      this.extractOverlay.style.display = 'none';
      if (this.extractDialogMode === 'exit') {
        if (this.onExitConfirm) this.onExitConfirm(true);
      } else if (this.onExtract) this.onExtract(true);
    });
    $('extract-no').addEventListener('click', () => {
      this.extractOverlay.style.display = 'none';
      if (this.extractDialogMode === 'exit') {
        if (this.onExitConfirm) this.onExitConfirm(false);
      } else if (this.onExtract) this.onExtract(false);
    });
    this.choiceRoutePreview.addEventListener('pointerdown', (e) => this.onRouteChoicePreviewDragStart(e));
    this.choiceRouteClose.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hideRouteChoicePanel(true);
    });
    this.routeChoiceConfirm.addEventListener('click', () => this.confirmRouteChoice());
    $('intel-continue').addEventListener('click', () => {
      this.intelOverlay.style.display = 'none';
      if (this.onIntelContinue) this.onIntelContinue();
    });
    $('restart-btn').addEventListener('click', () => location.reload());

    // 背包开关
    this.bagBtn.addEventListener('click', () => this.openBag());
    $('bag-close').addEventListener('click', () => this.closeBag());
    $('pause-btn').addEventListener('click', () => {
      $('pause-overlay').style.display = 'flex';
      if (this.onPauseToggle) this.onPauseToggle(true);
    });
    $('resume-btn').addEventListener('click', () => {
      $('pause-overlay').style.display = 'none';
      if (this.onPauseToggle) this.onPauseToggle(false);
    });
    // 瞄准灵敏度滑块
    const sensSlider = $('sens-slider') as HTMLInputElement;
    const sensVal = $('sens-val');
    sensSlider.addEventListener('input', () => {
      const v = parseFloat(sensSlider.value);
      sensVal.textContent = v.toFixed(2) + '×';
      if (this.onSensitivity) this.onSensitivity(v);
    });
    // 武器栏：点击卸下
    this.wslotEls.forEach((el, slot) => {
      el.addEventListener('click', () => this.onSlotClick(slot));
    });

    // 快捷消耗品槽：1/2 使用当前绑定道具；TAB 展开背包道具并替换绑定。
    this.nadeBtn.addEventListener('click', () => this.useQuickSlot(0));
    this.itemBtn.addEventListener('click', () => this.useQuickSlot(1));
    this.wireQuickSlotDrop(this.nadeBtn, 0);
    this.wireQuickSlotDrop(this.itemBtn, 1);
    this.itemExpand.addEventListener('click', (e) => { e.stopPropagation(); this.toggleItemDropdown(); });
    this.itemDropdown.addEventListener('click', (e) => {
      if (e.target === this.itemDropdown) this.closeItemDropdown();
    });
    this.skillBtn.addEventListener('click', () => { if (this.onUseSkill) this.onUseSkill(); });

    // 拖拽全局监听
    window.addEventListener('pointerdown', (e) => this.onItemDropdownOutsidePointer(e), true);
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
  }

  bindBag(bag: Backpack): void {
    this.bag = bag;
    this.renderQuickSlot(0);
    this.renderQuickSlot(1);
  }

  update(
    dt: number, hp: number, maxHp: number, shieldCount: number, maxShieldCount: number, sanity: number, maxSanity: number,
    ammo: number, magSize: number, reloading: number, reloadTime: number,
    bagValue: number, depth: number, stateLabel: string, mousePx: { x: number; y: number },
    reserve: number, coins: number
  ): void {
    const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    const sanPct = Math.max(0, Math.min(100, (sanity / maxSanity) * 100));
    this.hpFill.style.strokeDasharray = `${hpPct} 100`;
    this.sanFill.style.strokeDasharray = `${sanPct} 100`;
    this.hpText.textContent = `${Math.ceil(hp)}`;
    this.sanText.textContent = `${Math.ceil(sanity)}`;
    this.shieldText.textContent = `🛡 ${shieldCount}/${Math.max(0, maxShieldCount)}`;
    this.depthText.textContent = `${depth}`;
    this.stateText.textContent = stateLabel;
    this.bagBtnVal.textContent = `${bagValue}`;

    // 弹药/储备显示在选中武器按钮上
    this.weaponBtns.forEach((b, i) => {
      const a = b.querySelector('.w-ammo') as HTMLElement | null;
      if (!a) return;
      a.textContent = i === this.selIndex
        ? (reloading > 0 ? `↻${Math.round((1 - reloading / reloadTime) * 100)}%` : `${ammo}/${reserve < 0 ? '∞' : reserve}`)
        : '';
    });

    // 底部消耗品余量（来自背包库存）
    if (this.bag) {
      this.renderQuickSlot(0);
      this.renderQuickSlot(1);
    }

    const cx = this.adsMode ? this.stage.clientWidth / 2 : mousePx.x;
    const cy = this.adsMode ? this.stage.clientHeight / 2 : mousePx.y;
    this.crosshair.style.transform = `translate(${cx}px, ${cy}px)`;
    this.crosshair.style.color = this.adsMode ? '#ff5c5c' : '';
    this.crosshair.style.opacity = this.adsMode ? '1' : '0.7';

    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      this.hitmarker.style.transform = `translate(${cx}px, ${cy}px)`;
      if (this.hitTimer <= 0) this.hitmarker.style.opacity = '0';
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.style.opacity = '0';
    }

    // 低血→红色暗角；低神智→蓝色暗角（崩溃前明显提示）
    const hpDanger = Math.max(0, 1 - hp / maxHp);
    this.vignette.style.opacity = `${Math.min(0.85, hpDanger * 0.9)}`;
    const sanRatio = sanity / maxSanity;
    const sanDanger = sanRatio < 0.5 ? (0.5 - sanRatio) / 0.5 : 0;  // 神智<50%开始变蓝
    this.sanVignette.style.opacity = `${Math.min(0.85, sanDanger)}`;
  }

  // ===== 底部武器按钮 =====
  setupWeapons(list: { icon: string; name: string }[], index: number): void {
    this.weaponSlotsEl.innerHTML = '';
    this.weaponBtns = [];
    list.forEach((w, i) => {
      const btn = document.createElement('button');
      btn.className = 'wbtn';
      btn.innerHTML = `<span class="w-key">Q</span><span class="w-icon">${w.icon}</span><span class="w-ammo"></span>`;
      btn.title = `${w.name}${list.length > 1 ? '（Q 切换）' : ''}`;
      btn.addEventListener('click', () => { if (this.onWeaponTap) this.onWeaponTap(i); });
      this.weaponSlotsEl.appendChild(btn);
      this.weaponBtns.push(btn);
    });
    this.setWeaponSelected(index);
  }
  setWeaponSelected(index: number): void {
    this.selIndex = index;
    const canSwap = this.weaponBtns.length > 1;
    this.weaponBtns.forEach((b, i) => {
      b.classList.toggle('selected', i === index);
      b.classList.toggle('swap-ready', canSwap && i !== index);
    });
  }
  updateSkill(owned: boolean, charges: number): void {
    if (!owned) { this.skillBtn.style.display = 'none'; return; }
    this.skillBtn.style.display = 'flex';
    this.skillBtn.classList.toggle('empty', charges <= 0);
    this.skillBtn.title = 'E：夜枭雷暴';
    const el = this.skillBtn.querySelector('.a-n') as HTMLElement | null;
    if (el) el.textContent = `×${charges}`;
  }
  // 物品栏下拉：列出背包中所有消耗品，支持点击选择槽位或拖到槽位。
  private toggleItemDropdown(): void {
    if (this.itemDropdown.classList.contains('open')) {
      this.closeItemDropdown();
      return;
    }
    this.closeQuickSlotMenu();
    this.renderItemDropdown();
    this.itemDropdown.classList.add('open');
  }

  private closeItemDropdown(): void {
    this.closeQuickSlotMenu();
    this.itemDropdown.classList.remove('open');
  }

  private renderItemDropdown(): void {
    this.itemDropdown.innerHTML = '';
    const kinds = (Object.keys(CONSUMABLE_INFO) as ConsumableKind[])
      .filter((k) => this.bag !== null && this.bag.countKind(k) > 0);
    if (kinds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'item-row';
      empty.textContent = '（无可用道具）';
      this.itemDropdown.appendChild(empty);
    }
    for (const k of kinds) {
      const info = CONSUMABLE_INFO[k];
      const row = document.createElement('div');
      row.className = 'item-row';
      row.draggable = true;
      row.dataset.kind = k;
      row.innerHTML =
        `<span class="ir-icon">${info.icon}</span>` +
        `<span>${info.name}<span class="ir-desc"> ${info.desc}</span></span>` +
        `<span class="ir-n">×${this.bag!.countKind(k)}</span>`;
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('application/x-consumable', k);
        e.dataTransfer?.setData('text/plain', k);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeQuickSlotMenu();
        if (this.onUseConsumable) {
          this.onUseConsumable(k);
          this.renderQuickSlot(0);
          this.renderQuickSlot(1);
          this.renderItemDropdown();
        }
      });
      this.itemDropdown.appendChild(row);
    }
  }

  getQuickConsumable(slot: number): ConsumableKind {
    return this.quickSlots[slot] || QUICK_SLOT_DEFAULTS[slot] || 'med';
  }

  private loadQuickSlots(): ConsumableKind[] {
    try {
      const raw = localStorage.getItem(QUICK_SLOT_KEY);
      if (!raw) return QUICK_SLOT_DEFAULTS.slice();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return QUICK_SLOT_DEFAULTS.slice();
      const loaded = [0, 1].map((slot) => {
        const value = parsed[slot];
        return this.isConsumableKind(value) ? value : QUICK_SLOT_DEFAULTS[slot];
      });
      return this.normalizeQuickSlots(loaded);
    } catch (e) {
      return QUICK_SLOT_DEFAULTS.slice();
    }
  }

  private normalizeQuickSlots(slots: ConsumableKind[]): ConsumableKind[] {
    const normalized = [slots[0] || QUICK_SLOT_DEFAULTS[0], slots[1] || QUICK_SLOT_DEFAULTS[1]];
    if (normalized[0] === normalized[1]) {
      const fallback = QUICK_SLOT_DEFAULTS.find((kind) => kind !== normalized[0]) ||
        (Object.keys(CONSUMABLE_INFO) as ConsumableKind[]).find((kind) => kind !== normalized[0]);
      if (fallback) normalized[1] = fallback;
    }
    return normalized;
  }

  private saveQuickSlots(): void {
    try {
      localStorage.setItem(QUICK_SLOT_KEY, JSON.stringify(this.quickSlots.slice(0, 2)));
    } catch (e) { /* ignore */ }
  }

  private useQuickSlot(slot: number): void {
    if (this.onUseConsumable) this.onUseConsumable(this.getQuickConsumable(slot));
  }

  private renderQuickSlot(slot: number): void {
    const btn = slot === 0 ? this.nadeBtn : this.itemBtn;
    const kind = this.getQuickConsumable(slot);
    const info = CONSUMABLE_INFO[kind];
    const icon = btn.querySelector('.a-icon') as HTMLElement | null;
    const count = btn.querySelector('.a-n') as HTMLElement | null;
    const n = this.bag ? this.bag.countKind(kind) : 0;
    if (icon) icon.textContent = info.icon;
    if (count) count.textContent = `×${n}`;
    btn.classList.toggle('empty', n <= 0);
    btn.title = `${slot + 1}: ${info.name}`;
  }

  private assignQuickSlot(slot: number, kind: ConsumableKind): void {
    const otherSlot = slot === 0 ? 1 : 0;
    const previous = this.getQuickConsumable(slot);
    const swapped = this.quickSlots[otherSlot] === kind && previous !== kind;
    this.quickSlots[slot] = kind;
    if (swapped) this.quickSlots[otherSlot] = previous;
    this.quickSlots = this.normalizeQuickSlots(this.quickSlots);
    this.saveQuickSlots();
    this.renderQuickSlot(slot);
    this.renderQuickSlot(otherSlot);
    this.closeItemDropdown();
    this.showToast(swapped
      ? `${CONSUMABLE_INFO[kind].icon} 已与槽位 ${otherSlot + 1} 交换`
      : `${CONSUMABLE_INFO[kind].icon} 已绑定到槽位 ${slot + 1}`);
  }

  private showQuickSlotMenu(row: HTMLElement, kind: ConsumableKind): void {
    this.closeQuickSlotMenu();
    row.classList.add('selecting');
    const menu = document.createElement('div');
    menu.className = 'item-slot-menu';
    for (let slot = 0; slot < 2; slot++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `放到槽位 ${slot + 1}`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.assignQuickSlot(slot, kind);
      });
      menu.appendChild(btn);
    }
    row.appendChild(menu);
    this.quickSlotMenu = menu;
  }

  private closeQuickSlotMenu(): void {
    if (!this.quickSlotMenu) return;
    const row = this.quickSlotMenu.parentElement;
    if (row) row.classList.remove('selecting');
    this.quickSlotMenu.remove();
    this.quickSlotMenu = null;
  }

  private wireQuickSlotDrop(btn: HTMLElement, slot: number): void {
    btn.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      btn.classList.add('drop-ok');
    });
    btn.addEventListener('dragleave', () => btn.classList.remove('drop-ok'));
    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      btn.classList.remove('drop-ok');
      const kind = e.dataTransfer?.getData('application/x-consumable') || e.dataTransfer?.getData('text/plain') || '';
      if (this.isConsumableKind(kind)) this.assignQuickSlot(slot, kind);
    });
  }

  private isConsumableKind(value: string): value is ConsumableKind {
    return CONSUMABLE_INFO[value as ConsumableKind] !== undefined;
  }

  // ===== 网格背包 =====
  private onBagKeyDown(e: KeyboardEvent): void {
    if (e.code !== 'KeyB' || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    )) return;

    e.preventDefault();
    e.stopPropagation();

    if (this.bagOverlay.style.display === 'flex') {
      this.closeBag();
      return;
    }
    if (this.isOverlayVisible('start-overlay') || this.isOverlayVisible('end-overlay') ||
      this.isOverlayVisible('bagfull-overlay') || this.isOverlayVisible('choice-overlay') ||
      this.isOverlayVisible('extract-overlay') || this.isOverlayVisible('intel-overlay') ||
      this.isOverlayVisible('shop-overlay') || this.isOverlayVisible('pause-overlay')) {
      return;
    }
    if (this.routeMapExpanded) this.collapseRouteMap(true);
    this.openBag();
  }

  private onItemExpandKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.itemDropdown.classList.contains('open')) {
      e.preventDefault();
      e.stopPropagation();
      this.closeItemDropdown();
      return;
    }
    if (e.code !== 'Tab' || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    )) return;

    e.preventDefault();
    e.stopPropagation();

    if (this.isOverlayVisible('start-overlay') || this.isOverlayVisible('end-overlay') ||
      this.isOverlayVisible('bagfull-overlay') || this.isOverlayVisible('choice-overlay') ||
      this.isOverlayVisible('extract-overlay') || this.isOverlayVisible('intel-overlay') ||
      this.isOverlayVisible('shop-overlay') || this.isOverlayVisible('pause-overlay') ||
      this.bagOverlay.style.display === 'flex' || this.routeMapExpanded) {
      return;
    }
    this.toggleItemDropdown();
  }

  private onItemDropdownOutsidePointer(e: PointerEvent): void {
    if (!this.itemDropdown.classList.contains('open')) return;
    const target = e.target as HTMLElement | null;
    if (target && (this.itemDropdown.contains(target) || this.itemExpand.contains(target))) return;
    this.closeItemDropdown();
  }

  private isOverlayVisible(id: string): boolean {
    const el = document.getElementById(id);
    return !!el && getComputedStyle(el).display !== 'none';
  }

  private openBag(): void {
    this.bagOverlay.style.display = 'flex';
    if (this.onBagToggle) this.onBagToggle(true);
    this.renderInventory();
  }
  private closeBag(): void {
    this.closePopup();
    this.bagOverlay.style.display = 'none';
    if (this.onBagToggle) this.onBagToggle(false);
  }

  renderInventory(): void {
    if (!this.bag) return;
    this.bagOverlay.style.setProperty('--cell', `${CELL}px`);
    // 网格物品
    this.invGrid.innerHTML = '';
    for (const it of this.bag.items) {
      const el = document.createElement('div');
      el.className = 'inv-item';
      el.style.left = `${it.cx * CELL + 1}px`;
      el.style.top = `${it.cy * CELL + 1}px`;
      el.style.width = `${it.w * CELL - 4}px`;
      el.style.height = `${it.h * CELL - 4}px`;
      el.style.borderColor = it.color;
      const badge = it.kind === 'treasure' ? `${it.value}`
        : it.kind === 'ammo' ? `${it.stack}` : '';
      el.innerHTML = `<span class="i-name">${it.name}</span><span class="i-icon">${it.icon}</span>` +
        (badge ? `<span class="i-badge">${badge}</span>` : '');
      this.attachItem(el, it);
      this.invGrid.appendChild(el);
    }
    // 武器栏
    this.wslotEls.forEach((el, slot) => {
      const w = this.bag!.weaponSlots[slot];
      el.classList.toggle('filled', !!w);
      el.innerHTML = (w ? `<span class="ws-icon">${w.icon}</span>` : '') +
        `<span class="wslot-lab">武器${slot + 1}${w ? '·' + w.name : ''}</span>`;
    });
    // 信息
    this.bagValue.textContent = `💰 局内金币 ${this.bag.coins}  ｜  物品总价值 ${this.bag.totalValue}`;
    this.bagBullets.textContent = `🔫手枪弹 ∞  🔹步枪弹 ×${this.bag.bulletsOf('rifle')}` +
      (this.bag.bulletsOf('shell') > 0 ? `  🔴霰弹 ×${this.bag.bulletsOf('shell')}` : '');
  }

  private attachItem(el: HTMLElement, item: InvItem): void {
    el.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      this.closePopup();
      const rect = el.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'inv-ghost';
      ghost.style.width = `${item.w * CELL - 4}px`;
      ghost.style.height = `${item.h * CELL - 4}px`;
      ghost.style.borderColor = item.color;
      ghost.innerHTML = `<span>${item.icon}</span>`;
      document.body.appendChild(ghost);
      el.style.opacity = '0.3';
      this.drag = {
        item, ghost, el,
        offX: e.clientX - rect.left, offY: e.clientY - rect.top,
        downX: e.clientX, downY: e.clientY, moved: false,
      };
      this.moveGhost(e.clientX, e.clientY);
    });
  }

  private moveGhost(x: number, y: number): void {
    if (!this.drag) return;
    this.drag.ghost.style.left = `${x - this.drag.offX}px`;
    this.drag.ghost.style.top = `${y - this.drag.offY}px`;
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.drag) return;
    if (Math.abs(e.clientX - this.drag.downX) > 4 || Math.abs(e.clientY - this.drag.downY) > 4) {
      this.drag.moved = true;
    }
    this.moveGhost(e.clientX, e.clientY);
    // 武器栏放置高亮
    this.wslotEls.forEach((slotEl) => {
      const r = slotEl.getBoundingClientRect();
      const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      slotEl.classList.toggle('drop-ok', over && this.drag!.item.kind === 'weapon');
    });
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.drag || !this.bag) return;
    const d = this.drag;
    this.drag = null;
    d.ghost.remove();
    this.wslotEls.forEach((el) => el.classList.remove('drop-ok'));

    if (!d.moved) {
      d.el.style.opacity = '1';
      this.showItemPopup(d.item, e.clientX, e.clientY);
      return;
    }

    // 拖到武器栏？
    for (let slot = 0; slot < this.wslotEls.length; slot++) {
      const r = this.wslotEls[slot].getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        if (d.item.kind === 'weapon' && this.bag.equipToSlot(d.item.id, slot)) {
          if (this.onInventoryDirty) this.onInventoryDirty();
        }
        this.renderInventory();
        return;
      }
    }
    // 拖到网格内 → 移动
    const gr = this.invGrid.getBoundingClientRect();
    const ghostLeft = e.clientX - d.offX;
    const ghostTop = e.clientY - d.offY;
    const cx = Math.round((ghostLeft - gr.left) / CELL);
    const cy = Math.round((ghostTop - gr.top) / CELL);
    this.bag.moveOrSwap(d.item, cx, cy);   // 拖到已有物品上则交换位置
    this.renderInventory();
  }

  private onSlotClick(slot: number): void {
    if (!this.bag) return;
    if (this.bag.weaponSlots[slot] && this.bag.unequip(slot)) {
      if (this.onInventoryDirty) this.onInventoryDirty();
      this.renderInventory();
    }
  }

  private closePopup(): void {
    if (this.popupEl) { this.popupEl.remove(); this.popupEl = null; }
  }

  private showItemPopup(item: InvItem, x: number, y: number): void {
    this.closePopup();
    const pop = document.createElement('div');
    pop.className = 'inv-popup';
    const title = document.createElement('div');
    title.className = 'pop-title';
    title.textContent = item.kind === 'treasure' ? `${item.name}（价值 ${item.value}）`
      : item.kind === 'ammo' ? `${item.name} ×${item.stack}` : item.name;
    pop.appendChild(title);

    // 物品效果描述
    let descText = '';
    const con = CONSUMABLE_INFO[item.kind as ConsumableKind];
    if (con) descText = con.desc;
    else if (item.kind === 'weapon' && item.weapon) descText = `伤害 ${item.weapon.damage} ｜ 弹匣 ${item.weapon.magSize} ｜ 射速 ${(1 / item.weapon.fireInterval).toFixed(1)}/s`;
    else if (item.kind === 'treasure') {
      const detail = item.description ? ` · ${item.description}` : '';
      descText = `${RARITY_INFO[item.rarity!].name}藏品 · ${item.w}×${item.h} 格 · 撤离结算价值 ${item.value}${detail}`;
    }
    else if (item.kind === 'ammo') descText = `备用弹药 ×${item.stack}`;
    if (descText) {
      const desc = document.createElement('div');
      desc.className = 'pop-desc';
      desc.textContent = descText;
      pop.appendChild(desc);
    }

    const addBtn = (label: string, fn: () => void, danger?: boolean) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (danger) b.className = 'danger';
      b.addEventListener('click', () => { fn(); this.closePopup(); this.renderInventory(); });
      pop.appendChild(b);
    };

    if (item.kind === 'weapon') {
      addBtn('装备到武器1', () => { if (this.bag!.equipToSlot(item.id, 0) && this.onInventoryDirty) this.onInventoryDirty(); });
      addBtn('装备到武器2', () => { if (this.bag!.equipToSlot(item.id, 1) && this.onInventoryDirty) this.onInventoryDirty(); });
    } else if (CONSUMABLE_INFO[item.kind as ConsumableKind] !== undefined) {
      addBtn('使用', () => { if (this.onUseConsumableItem) this.onUseConsumableItem(item.kind as ConsumableKind); });
    }
    addBtn('丢弃', () => { this.bag!.removeItem(item); }, true);

    pop.style.left = `${Math.min(x, window.innerWidth - 140)}px`;
    pop.style.top = `${Math.min(y, window.innerHeight - 160)}px`;
    document.body.appendChild(pop);
    this.popupEl = pop;
    // 点击别处关闭
    setTimeout(() => {
      const close = (ev: MouseEvent) => {
        if (this.popupEl && !this.popupEl.contains(ev.target as Node)) {
          this.closePopup();
          window.removeEventListener('pointerdown', close, true);
        }
      };
      window.addEventListener('pointerdown', close, true);
    }, 0);
  }

  // ===== 搜索圆环（容器顶部，颜色=箱内物品色） =====
  showSearchRing(color: string): void {
    this.srFg.style.stroke = color;
    this.srFg.style.strokeDashoffset = '264';
    this.searchRing.style.display = 'block';
  }
  updateSearchRing(p: number, worldPos: THREE.Vector3, camera: THREE.Camera): void {
    const v = worldPos.clone();
    v.project(camera);
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    this.searchRing.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
    this.searchRing.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
    this.srFg.style.strokeDashoffset = `${264 * (1 - Math.max(0, Math.min(1, p)))}`;
  }
  hideSearchRing(): void { this.searchRing.style.display = 'none'; }

  // ===== BOSS血条 =====
  showBossBar(name: string): void {
    this.bossName.textContent = name;
    this.bossFill.style.width = '100%';
    this.bossBar.style.display = 'block';
  }
  updateBossBar(hp: number, maxHp: number, phase: number): void {
    const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
    this.bossFill.style.width = `${pct}%`;
    this.bossName.textContent = this.bossName.textContent!.split(' ·')[0] + (phase === 2 ? ' · 暴怒' : '');
  }
  hideBossBar(): void { this.bossBar.style.display = 'none'; }

  showIntel(html: string): void {
    this.intelText.innerHTML = html;
    this.intelOverlay.style.display = 'flex';
  }

  setAds(on: boolean): void { this.adsMode = on; }

  setRoomTransition(alpha: number, visible: boolean): void {
    this.roomTransition.style.display = visible ? 'block' : 'none';
    this.roomTransition.style.opacity = `${Math.max(0, Math.min(1, alpha))}`;
  }

  showHitmarker(headshot: boolean): void {
    this.hitmarker.style.opacity = '1';
    this.hitmarker.style.color = headshot ? '#ff5c5c' : '#ffffff';
    this.hitmarker.style.fontSize = headshot ? '30px' : '22px';
    this.hitTimer = 0.18;
  }

  setPrompt(text: string | null): void {
    if (text) { this.promptEl.textContent = text; this.promptEl.style.opacity = '1'; }
    else this.promptEl.style.opacity = '0';
  }

  setStateLabel(text: string): void {
    this.stateText.textContent = text;
  }

  showToast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    this.toastTimer = 1.8;
  }

  private hexToRgba(hex: string, a: number): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) || 120;
    const g = parseInt(h.substring(2, 4), 16) || 120;
    const b = parseInt(h.substring(4, 6), 16) || 120;
    return `rgba(${r},${g},${b},${a})`;
  }

  // 右上角拾取记录：最新置顶高亮，约2秒后下沉淡出，最多3条
  logPickup(icon: string, name: string, count: number, color: string): void {
    const row = document.createElement('div');
    row.className = 'pickup-row hl';
    row.style.setProperty('--qc', this.hexToRgba(color, 0.38));
    row.innerHTML = `<span class="pl-icon">${icon}</span><span class="pl-name">${name}</span><span class="pl-n">×${count}</span>`;
    for (const c of Array.from(this.pickupLog.children)) c.classList.remove('hl');
    this.pickupLog.insertBefore(row, this.pickupLog.firstChild);
    requestAnimationFrame(() => row.classList.add('show'));
    while (this.pickupLog.children.length > 3) {
      this.pickupLog.removeChild(this.pickupLog.lastChild as Node);
    }
    setTimeout(() => {
      row.classList.remove('hl');
      row.classList.add('fade');
      setTimeout(() => { if (row.parentNode) row.remove(); }, 400);
    }, 2000);
  }

  showSearchPanel(label: string): void {
    this.searchPanel.style.display = 'flex';
    this.searchLabel.textContent = label;
  }
  hideSearchPanel(): void { this.searchPanel.style.display = 'none'; }

  dismissBlockingOverlays(): void {
    this.choiceOverlay.classList.remove('route-choice-screen');
    this.choiceOverlay.style.display = 'none';
    this.extractOverlay.style.display = 'none';
    this.intelOverlay.style.display = 'none';
    this.shopOverlay.style.display = 'none';
    this.bagOverlay.style.display = 'none';
    document.getElementById('pause-overlay')!.style.display = 'none';
    document.getElementById('bagfull-overlay')!.style.display = 'none';
  }

  renderRouteMap(snapshot: RouteMapSnapshot): void {
    this.routeSnapshot = snapshot;
    this.drawRouteMap(snapshot);
  }

  showRouteChoice(snapshot: RouteMapSnapshot, closable: boolean = false): void {
    this.routeSnapshot = snapshot;
    this.routeChoiceMode = true;
    this.routeMapExpanded = false;
    this.stage.classList.remove('route-map-open');
    this.drawRouteMap(snapshot);
    this.showRouteChoicePanel(snapshot, true);
  }

  setRouteChoiceReady(snapshot: RouteMapSnapshot): void {
    this.routeSnapshot = snapshot;
    this.routeChoiceMode = true;
    this.drawRouteMap(snapshot);
  }

  private showRouteChoicePanel(snapshot: RouteMapSnapshot, closable: boolean): void {
    const options = this.choiceNodes(snapshot);
    this.routeChoiceOptions = options;
    this.routeChoicePanelClosable = closable;
    const preferred = options.find((n) => n.id === this.routeChoiceSelectedId);
    const forward = options.find((node, index) => this.routeChoiceDirection(node, index, options, snapshot) === '前方');
    this.routeChoiceSelectedId = preferred?.id || forward?.id || options[Math.min(1, Math.max(0, options.length - 1))]?.id || null;

    this.choiceOverlay.classList.add('route-choice-screen');
    this.choiceOverlay.style.display = 'grid';
    this.choiceRouteClose.classList.toggle('hidden', !closable);
    this.routeChoiceZoom = 1;
    this.renderRouteChoicePreview(snapshot);

    const current = snapshot.currentId ? snapshot.nodes.find((n) => n.id === snapshot.currentId) : null;
    const depth = current ? current.depth : snapshot.segmentStartDepth;
    this.choiceRouteDepth.textContent = `当前深度 ${depth}`;

    const titleEl = document.getElementById('choice-title');
    const subEl = document.getElementById('choice-sub');
    if (titleEl) titleEl.textContent = '选择探索方向';
    if (subEl) subEl.textContent = '路线会影响风险、补给和最终收益';

    this.renderRouteChoiceCards(snapshot);
    this.updateRouteChoiceSelected();
    if (this.onRouteMapToggle) this.onRouteMapToggle(true);
    requestAnimationFrame(() => this.centerChoiceRoutePreview());
  }

  private hideRouteChoicePanel(preserveChoiceMode: boolean): void {
    this.choiceOverlay.classList.remove('route-choice-screen');
    this.choiceOverlay.style.display = 'none';
    this.routeChoiceOptions = [];
    this.routeChoiceSelectedId = null;
    if (!preserveChoiceMode) this.routeChoiceMode = false;
    if (this.onRouteMapToggle) this.onRouteMapToggle(false);
    if (this.routeSnapshot) this.drawRouteMap(this.routeSnapshot);
  }

  private choiceNodes(snapshot: RouteMapSnapshot): RouteNode[] {
    const ids = new Set(snapshot.choiceIds);
    return snapshot.nodes
      .filter((node) => ids.has(node.id))
      .sort((a, b) => this.routeDirectionRank(snapshot.choiceDirections[a.id]) - this.routeDirectionRank(snapshot.choiceDirections[b.id]));
  }

  private routeChoiceDirection(node: RouteNode, index: number, options: RouteNode[], snapshot: RouteMapSnapshot): string {
    const direction = snapshot.choiceDirections[node.id];
    if (direction === 'left') return '左侧';
    if (direction === 'right') return '右侧';
    return '前方';
  }

  private routeDirectionRank(direction: RouteDoorDirection | undefined): number {
    return direction === 'left' ? 0 : direction === 'center' ? 1 : 2;
  }

  private renderRouteChoiceCards(snapshot: RouteMapSnapshot): void {
    this.choiceCards.innerHTML = '';
    const options = this.routeChoiceOptions;
    this.choiceCards.style.gridTemplateColumns = `repeat(${Math.max(1, options.length)}, minmax(0, 1fr))`;
    for (let i = 0; i < options.length; i++) {
      const node = options[i];
      const info = ROOM_INFO[node.type];
      const cost = node.visited ? 0 : Math.max(0, sanityCostFor(node.type, node.depth));
      const direction = this.routeChoiceDirection(node, i, options, snapshot);
      const directionText = node.visited ? '已搜刮' : direction;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `door-card route-choice-card${node.id === this.routeChoiceSelectedId ? ' selected' : ''}`;
      card.dataset.routeId = node.id;
      const iconClass = hasRoomArt(node.type) ? 'door-icon has-art' : 'door-icon';
      const costLine = cost > 0 ? `神智 -${cost}` : '无神智消耗';
      card.innerHTML =
        `<span class="route-choice-dir">${directionText}</span>` +
        `<span class="${iconClass}">${roomArtHtml(node.type, info.icon, 'door-icon-art')}</span>` +
        `<strong>${info.name}</strong>` +
        `<em style="color:#ffcf7a">风险：${node.risk}</em>` +
        `<em style="color:#7CFFB0">收益：${node.reward}</em>` +
        `<em class="route-choice-cost" style="color:#7d9bff">${costLine}</em>`;
      card.addEventListener('click', () => {
        this.routeChoiceSelectedId = node.id;
        this.renderRouteChoiceCards(snapshot);
        this.updateRouteChoicePreviewSelection();
        this.updateRouteChoiceSelected();
      });
      this.choiceCards.appendChild(card);
    }
  }

  private updateRouteChoiceSelected(): void {
    const node = this.routeChoiceOptions.find((n) => n.id === this.routeChoiceSelectedId) || null;
    if (!node) {
      this.routeChoiceSelected.innerHTML = '已选择<strong>无可用路线</strong>';
      (this.routeChoiceConfirm as HTMLButtonElement).disabled = true;
      return;
    }
    const snapshot = this.routeSnapshot;
    const index = this.routeChoiceOptions.findIndex((n) => n.id === node.id);
    const direction = snapshot ? this.routeChoiceDirection(node, index, this.routeChoiceOptions, snapshot) : '前方';
    const directionText = node.visited ? '已搜刮' : direction;
    this.routeChoiceSelected.innerHTML = `已选择<strong>${directionText} · ${ROOM_INFO[node.type].name}</strong>`;
    (this.routeChoiceConfirm as HTMLButtonElement).disabled = false;
  }

  private confirmRouteChoice(): void {
    const node = this.routeChoiceOptions.find((n) => n.id === this.routeChoiceSelectedId);
    if (!node) return;
    this.hideRouteChoicePanel(false);
    if (this.onChoice) this.onChoice(node);
  }

  private renderRouteChoicePreview(snapshot: RouteMapSnapshot): void {
    const nodes = snapshot.nodes;
    if (nodes.length === 0) {
      this.choiceRoutePreview.innerHTML = '';
      return;
    }
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const choiceIds = new Set(snapshot.choiceIds);
    const gridGap = 36;
    const mapPadding = 42;
    const mapWidth = mapPadding * 2 + Math.max(1, snapshot.maxX - snapshot.minX) * gridGap;
    const routeContentHeight = mapPadding * 2 + Math.max(1, snapshot.maxY - snapshot.minY) * gridGap;
    const mapX = (x: number): number => mapPadding + (x - snapshot.minX) * gridGap;
    const mapY = (y: number): number => routeContentHeight - mapPadding - (y - snapshot.minY) * gridGap;
    const focus =
      (snapshot.currentId ? nodeById.get(snapshot.currentId) : null) ||
      nodes.find((node) => choiceIds.has(node.id)) ||
      nodes[0];
    this.routeChoicePreviewFocusX = mapX(focus.x);
    this.routeChoicePreviewFocusY = mapY(focus.y);

    const lines: string[] = [];
    for (const node of nodes) {
      const x1 = mapX(node.x);
      const y1 = mapY(node.y);
      for (const id of node.links) {
        const target = nodeById.get(id);
        if (!target) continue;
        const x2 = mapX(target.x);
        const y2 = mapY(target.y);
        const active =
          this.routeChoiceSelectedId !== null &&
          node.id === snapshot.currentId &&
          target.id === this.routeChoiceSelectedId;
        lines.push(
          `<path class="route-choice-map-line${active ? ' active' : ''}" ` +
          `data-from="${node.id}" data-to="${target.id}" ` +
          `d="M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}"></path>`
        );
      }
    }

    const defs: string[] = [];
    const safeSvgId = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, '-');
    const nodeEls = nodes.map((node) => {
      const info = ROOM_INFO[node.type];
      const cls = [
        'route-choice-map-node',
        node.visited ? 'visited' : '',
        snapshot.currentId === node.id ? 'current' : '',
        choiceIds.has(node.id) ? 'next' : '',
        choiceIds.has(node.id) && node.id === this.routeChoiceSelectedId ? 'selected' : '',
      ].filter(Boolean).join(' ');
      const x = mapX(node.x);
      const y = mapY(node.y);
      const iconSize = snapshot.currentId === node.id ? 44 : 36;
      const iconX = x - iconSize / 2;
      const iconY = y - iconSize / 2;
      const ringRadius = snapshot.currentId === node.id ? 25 : 21;
      const discRadius = snapshot.currentId === node.id ? 24 : 20;
      const clipId = `route-choice-clip-${safeSvgId(node.id)}`;
      defs.push(`<clipPath id="${clipId}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${discRadius}"></circle></clipPath>`);
      const art = ROOM_ART[node.type];
      const icon = art
        ? `<image class="route-choice-map-icon" href="${art}" x="${iconX.toFixed(1)}" y="${iconY.toFixed(1)}" width="${iconSize}" height="${iconSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"></image>`
        : `<text class="route-choice-map-emoji" x="${x.toFixed(1)}" y="${(y + 8).toFixed(1)}">${info.icon}</text>`;
      const showLabel = snapshot.currentId === node.id || choiceIds.has(node.id) ||
        node.type === 'corridor' || node.type === 'exit' || node.type === 'boss';
      const label = showLabel
        ? `<g class="route-choice-map-label"><rect x="${(x - 21).toFixed(1)}" y="${(y + 19).toFixed(1)}" width="42" height="16" rx="7"></rect>` +
          `<text x="${x.toFixed(1)}" y="${(y + 31).toFixed(1)}">${ROOM_LABEL[node.type] || info.name}</text></g>`
        : '';
      return `<g class="${cls}" data-route-id="${node.id}" data-floor="${node.floor}" data-x="${node.x}" data-y="${node.y}" transform="translate(0 0)">` +
        `<circle class="route-choice-map-disc" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${discRadius}"></circle>` +
        `${icon}` +
        `<circle class="route-choice-map-ring" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${ringRadius}"></circle>` +
        `${label}</g>`;
    }).join('');

    this.choiceRoutePreview.innerHTML =
      `<div class="route-choice-map-content" data-zoom="1" style="width:${mapWidth}px; height:${routeContentHeight}px">` +
      `<svg class="route-choice-map-svg" viewBox="0 0 ${mapWidth} ${routeContentHeight}" preserveAspectRatio="xMidYMid meet"><defs>${defs.join('')}</defs>${lines.join('')}${nodeEls}</svg>` +
      `</div>`;
  }

  private updateRouteChoicePreviewSelection(): void {
    const selectedId = this.routeChoiceSelectedId;
    const nodes = this.choiceRoutePreview.querySelectorAll<SVGGElement>('.route-choice-map-node[data-route-id]');
    nodes.forEach((el) => {
      el.classList.toggle('selected', selectedId !== null && el.dataset.routeId === selectedId);
    });
    const currentId = this.routeSnapshot?.currentId || null;
    const lines = this.choiceRoutePreview.querySelectorAll<SVGPathElement>('.route-choice-map-line[data-from][data-to]');
    lines.forEach((el) => {
      const selectedEdge =
        currentId !== null &&
        selectedId !== null &&
        el.dataset.from === currentId &&
        el.dataset.to === selectedId;
      el.classList.toggle('active', selectedEdge);
    });
  }

  private routeLinePath(x1: number, y1: number, x2: number, y2: number): string {
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }

  private centerChoiceRoutePreview(): void {
    const viewport = this.choiceRoutePreview;
    if (!this.routeChoicePreviewFocusY) {
      viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
      viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      return;
    }
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const desiredLeft = this.routeChoicePreviewFocusX - viewport.clientWidth * 0.5;
    const desired = this.routeChoicePreviewFocusY - viewport.clientHeight * 0.58;
    viewport.scrollLeft = Math.max(0, Math.min(maxScrollLeft, desiredLeft));
    viewport.scrollTop = Math.max(0, Math.min(maxScroll, desired));
  }

  private onRouteChoicePreviewDragStart(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    const viewport = target?.closest('.route-choice-canvas') as HTMLElement | null;
    if (!viewport) return;
    this.routeMapDragViewport = viewport;
    this.routeMapDragPointerId = e.pointerId;
    this.routeMapDragStartX = e.clientX;
    this.routeMapDragStartY = e.clientY;
    this.routeMapDragStartScrollLeft = viewport.scrollLeft;
    this.routeMapDragStartScrollTop = viewport.scrollTop;
    this.routeMapDragMoved = false;
  }

  private onRouteChoiceWheel(e: WheelEvent): void {
    this.routeChoiceZoom = this.zoomRouteViewport(
      this.choiceRoutePreview,
      '.route-choice-map-content',
      this.routeChoiceZoom,
      e
    );
  }

  closeRouteMap(): void {
    this.collapseRouteMap(false);
  }

  private collapseRouteMap(preserveChoiceMode: boolean = true): void {
    if (!preserveChoiceMode) {
      this.routeChoiceMode = false;
    }
    this.setRouteMapExpanded(false, true);
  }

  private onRouteMapOutsidePointer(e: PointerEvent): void {
    if (!this.routeMapExpanded) return;
    const target = e.target;
    if (target instanceof Node && this.routeMap.contains(target)) return;
    e.preventDefault();
    e.stopPropagation();
    this.collapseRouteMap(true);
  }

  private onRouteMapKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (this.choiceOverlay.classList.contains('route-choice-screen')) {
      e.preventDefault();
      e.stopPropagation();
      this.hideRouteChoicePanel(true);
      return;
    }
    if (!this.routeMapExpanded) return;
    e.preventDefault();
    e.stopPropagation();
    this.collapseRouteMap(true);
  }

  private onRouteMapDragStart(e: PointerEvent): void {
    if (!this.routeMapExpanded) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    const viewport = target?.closest('.route-canvas') as HTMLElement | null;
    if (!viewport) return;

    this.routeMapDragViewport = viewport;
    this.routeMapDragPointerId = e.pointerId;
    this.routeMapDragStartX = e.clientX;
    this.routeMapDragStartY = e.clientY;
    this.routeMapDragStartScrollLeft = viewport.scrollLeft;
    this.routeMapDragStartScrollTop = viewport.scrollTop;
    this.routeMapDragMoved = false;
  }

  private onRouteMapWheel(e: WheelEvent): void {
    if (!this.routeMapExpanded) return;
    const target = e.target as HTMLElement | null;
    const viewport = target?.closest('.route-canvas') as HTMLElement | null;
    if (!viewport) return;
    this.routeMapZoom = this.zoomRouteViewport(
      viewport,
      '.route-map-content',
      this.routeMapZoom,
      e
    );
  }

  private zoomRouteViewport(
    viewport: HTMLElement,
    contentSelector: string,
    currentZoom: number,
    e: WheelEvent
  ): number {
    const content = viewport.querySelector(contentSelector) as HTMLElement | null;
    if (!content) return currentZoom;
    e.preventDefault();
    e.stopPropagation();

    const direction = e.deltaY < 0 ? 1 : -1;
    const nextZoom = Math.max(1, Math.min(2.8, currentZoom + direction * 0.16));
    if (Math.abs(nextZoom - currentZoom) < 0.001) return currentZoom;

    const rect = viewport.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    const baseWidth = Number(content.dataset.baseWidth || content.offsetWidth / currentZoom);
    const baseHeight = Number(content.dataset.baseHeight || content.offsetHeight / currentZoom);
    content.dataset.baseWidth = String(baseWidth);
    content.dataset.baseHeight = String(baseHeight);

    const mapX = (viewport.scrollLeft + pointerX) / currentZoom;
    const mapY = (viewport.scrollTop + pointerY) / currentZoom;
    content.style.width = `${baseWidth * nextZoom}px`;
    content.style.height = `${baseHeight * nextZoom}px`;
    content.dataset.zoom = nextZoom.toFixed(2);
    viewport.scrollLeft = mapX * nextZoom - pointerX;
    viewport.scrollTop = mapY * nextZoom - pointerY;
    return nextZoom;
  }

  private onRouteMapDragMove(e: PointerEvent): void {
    const viewport = this.routeMapDragViewport;
    if (!viewport || e.pointerId !== this.routeMapDragPointerId) return;
    const dx = e.clientX - this.routeMapDragStartX;
    const dy = e.clientY - this.routeMapDragStartY;
    if (Math.hypot(dx, dy) <= 4) return;

    if (!this.routeMapDragMoved) {
      viewport.classList.add('dragging');
    }
    this.routeMapDragMoved = true;
    viewport.scrollLeft = this.routeMapDragStartScrollLeft - dx;
    viewport.scrollTop = this.routeMapDragStartScrollTop - dy;
    e.preventDefault();
    e.stopPropagation();
  }

  private onRouteMapDragEnd(e: PointerEvent): void {
    const viewport = this.routeMapDragViewport;
    if (!viewport || e.pointerId !== this.routeMapDragPointerId) return;
    viewport.classList.remove('dragging');

    const dragged = this.routeMapDragMoved;
    this.routeMapDragViewport = null;
    this.routeMapDragPointerId = -1;
    this.routeMapDragMoved = false;
    if (dragged) {
      this.routeMapSuppressClickUntil = performance.now() + 160;
    }
  }

  private onRouteMapClick(e: MouseEvent): void {
    if (performance.now() <= this.routeMapSuppressClickUntil) {
      this.routeMapSuppressClickUntil = 0;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const target = e.target as HTMLElement;
    const nodeEl = target.closest('.route-node.selectable') as HTMLElement | null;
    if (nodeEl && this.routeSnapshot) {
      e.stopPropagation();
      const id = nodeEl.dataset.routeId;
      const node = this.routeSnapshot.nodes.find((n) => n.id === id);
      if (!node) return;
      this.closeRouteMap();
      if (this.onChoice) this.onChoice(node);
      return;
    }
    if (target.closest('.route-map-toggle')) {
      e.stopPropagation();
      if (this.routeChoiceMode && this.routeSnapshot && this.routeSnapshot.choiceIds.length > 0) {
        this.showRouteChoice(this.routeSnapshot, true);
        return;
      }
      this.setRouteMapExpanded(!this.routeMapExpanded);
      return;
    }
    if (target.closest('.route-map-close')) {
      e.stopPropagation();
      this.collapseRouteMap(true);
    }
  }

  private setRouteMapExpanded(open: boolean, force: boolean = false): void {
    if (this.routeMapExpanded === open && !force) return;
    this.routeMapExpanded = open;
    if (open) this.routeMapZoom = 1;
    this.stage.classList.toggle('route-map-open', open);
    if (this.onRouteMapToggle) this.onRouteMapToggle(open);
    if (this.routeSnapshot) this.drawRouteMap(this.routeSnapshot);
    if (open) this.centerRouteMapSoon();
  }

  private centerRouteMapSoon(): void {
    requestAnimationFrame(() => this.centerRouteMapOnProgress());
  }

  private centerRouteMapOnProgress(): void {
    const viewport = this.routeMap.querySelector('.route-canvas') as HTMLElement | null;
    if (!viewport) return;
    const target =
      this.routeMap.querySelector('.route-node.current') as HTMLElement | null ||
      this.routeMap.querySelector('.route-node.selectable') as HTMLElement | null ||
      this.routeMap.querySelector('.route-node.next') as HTMLElement | null;
    if (!target) {
      viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
      viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      return;
    }

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const desiredLeft = target.offsetLeft - viewport.clientWidth * 0.5;
    const desired = target.offsetTop - viewport.clientHeight * 0.58;
    viewport.scrollLeft = Math.max(0, Math.min(maxScrollLeft, desiredLeft));
    viewport.scrollTop = Math.max(0, Math.min(maxScroll, desired));
  }

  private drawRouteMap(snapshot: RouteMapSnapshot): void {
    const nodes = snapshot.nodes;
    if (nodes.length === 0) {
      this.routeMap.innerHTML = '';
      return;
    }
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const choiceIds = new Set(snapshot.choiceIds);
    const gridGap = 38;
    const mapPadding = 50;
    const routeContentWidth = mapPadding * 2 + Math.max(1, snapshot.maxX - snapshot.minX) * gridGap;
    const routeContentHeight = mapPadding * 2 + Math.max(1, snapshot.maxY - snapshot.minY) * gridGap;
    const mapX = (x: number): number => mapPadding + (x - snapshot.minX) * gridGap;
    const mapY = (y: number): number => routeContentHeight - mapPadding - (y - snapshot.minY) * gridGap;
    const linePath = (x1: number, y1: number, x2: number, y2: number): string => this.routeLinePath(x1, y1, x2, y2);

    const lines: string[] = [];
    for (const node of nodes) {
      const x1 = mapX(node.x);
      const y1 = mapY(node.y);
      for (const id of node.links) {
        const target = nodeById.get(id);
        if (!target) continue;
        const x2 = mapX(target.x);
        const y2 = mapY(target.y);
        const active = node.visited && (target.visited || choiceIds.has(target.id));
        lines.push(`<path class="route-line${active ? ' active' : ''}" data-from="${node.id}" data-to="${target.id}" d="${linePath(x1, y1, x2, y2)}"></path>`);
      }
    }

    const nodeEls = nodes.map((node) => {
      const info = ROOM_INFO[node.type];
      const selectable = this.routeMapExpanded && this.routeChoiceMode && choiceIds.has(node.id);
      const cls = [
        'route-node',
        `route-${node.type}`,
        hasRoomArt(node.type) ? 'has-art' : '',
        node.visited ? 'visited' : '',
        snapshot.currentId === node.id ? 'current' : '',
        choiceIds.has(node.id) ? 'next' : '',
        selectable ? 'selectable' : '',
      ].filter(Boolean).join(' ');
      const x = mapX(node.x);
      const y = mapY(node.y);
      const icon = roomArtHtml(node.type, info.icon, 'route-node-art');
      const showLabel = snapshot.currentId === node.id || choiceIds.has(node.id);
      const fixedLabel = node.type === 'corridor' || node.type === 'exit' || node.type === 'boss';
      const label = showLabel || fixedLabel ? `<span class="route-node-label">${ROOM_LABEL[node.type] || info.name}</span>` : '';
      if (selectable) {
        return `<button type="button" class="${cls}" data-route-id="${node.id}" data-floor="${node.floor}" data-x="${node.x}" data-y="${node.y}" style="left:${x}px; top:${y}px">${icon}${label}</button>`;
      }
      return `<div class="${cls}" data-route-id="${node.id}" data-floor="${node.floor}" data-x="${node.x}" data-y="${node.y}" style="left:${x}px; top:${y}px">${icon}${label}</div>`;
    }).join('');

    this.routeMap.classList.toggle('route-expanded', this.routeMapExpanded);
    this.routeMap.classList.toggle('route-collapsed', !this.routeMapExpanded);

    if (!this.routeMapExpanded) {
      this.routeMap.innerHTML =
        `<button class="route-map-toggle route-icon-btn">` +
        `<span class="route-icon">🗺️</span>` +
        `</button>`;
      return;
    }

    this.routeMap.innerHTML =
      `<div class="route-head">` +
      `<strong>${this.routeChoiceMode ? '选择下一关' : '路线图'}</strong>` +
      (this.routeChoiceMode ? `<span class="route-must-pick">点击高亮节点</span>` : `<button class="route-map-close">×</button>`) +
      `</div>` +
      `<div class="route-canvas">` +
      `<div class="route-map-content" data-zoom="1" style="width:${routeContentWidth}px; height:${routeContentHeight}px">` +
      `<svg viewBox="0 0 ${routeContentWidth} ${routeContentHeight}" preserveAspectRatio="none">${lines.join('')}</svg>${nodeEls}` +
      `</div>` +
      `</div>`;
    this.centerRouteMapSoon();
  }

  showChoice(options: RouteNode[], depth: number = 0, sanityReduce: number = 0): void {
    this.choiceOverlay.classList.remove('route-choice-screen');
    const titleEl = document.getElementById('choice-title');
    const subEl = document.getElementById('choice-sub');
    if (titleEl) titleEl.textContent = '选择地图节点';
    if (subEl) subEl.textContent = '路线会影响风险、补给和最终收益';
    this.choiceCards.innerHTML = '';
    for (const node of options) {
      const info = ROOM_INFO[node.type];
      const costDepth = node.depth || depth;
      const cost = node.visited ? 0 : Math.max(0, sanityCostFor(node.type, costDepth) - sanityReduce);
      const costLine = cost > 0
        ? `<em style="color:#7d9bff">🧠 神智 -${cost}</em>`
        : `<em style="color:#7CFFB0">无神智消耗</em>`;
      const card = document.createElement('button');
      card.className = 'door-card';
      const iconClass = hasRoomArt(node.type) ? 'door-icon has-art' : 'door-icon';
      card.innerHTML =
        `<span class="${iconClass}">${roomArtHtml(node.type, info.icon, 'door-icon-art')}</span><strong>${info.name}</strong>` +
        `<em style="color:#ffcf7a">风险：${node.risk}</em>` +
        `<em style="color:#7CFFB0">收益：${node.reward}</em>` +
        `<em>${info.hint}</em>${costLine}`;
      card.addEventListener('click', () => {
        this.choiceOverlay.style.display = 'none';
        if (this.onChoice) this.onChoice(node);
      });
      this.choiceCards.appendChild(card);
    }
    this.choiceOverlay.style.display = 'flex';
  }

  showPactChoice(pacts: Pact[], onPick: (p: Pact | null) => void, allowDecline: boolean = true, title?: string, sub?: string): void {
    this.choiceOverlay.classList.remove('route-choice-screen');
    const titleEl = document.getElementById('choice-title');
    const subEl = document.getElementById('choice-sub');
    if (titleEl) titleEl.textContent = title || '抉择';
    if (subEl) subEl.textContent = sub || '';
    this.choiceCards.innerHTML = '';
    for (const p of pacts) {
      const card = document.createElement('button');
      card.className = 'door-card';
      card.innerHTML =
        `<span class="door-icon">${p.icon}</span><strong>${p.name}</strong>` +
        `<em style="color:#7CFFB0">▲ ${p.boon}</em>` +
        (p.curse ? `<em style="color:#FF7A7A">▼ ${p.curse}</em>` : '');
      card.addEventListener('click', () => {
        this.choiceOverlay.style.display = 'none';
        onPick(p);
      });
      this.choiceCards.appendChild(card);
    }
    if (allowDecline) {
      const skip = document.createElement('button');
      skip.className = 'door-card';
      skip.innerHTML = `<span class="door-icon">🚶</span><strong>婉拒</strong><em>不交换，继续</em>`;
      skip.addEventListener('click', () => {
        this.choiceOverlay.style.display = 'none';
        onPick(null);
      });
      this.choiceCards.appendChild(skip);
    }
    this.choiceOverlay.style.display = 'flex';
  }

  // ===== 商店 =====
  showShop(items: { icon: string; name: string; desc: string; price: number; sold?: boolean }[], bank: number): void {
    this.renderShop(items, bank);
    this.shopOverlay.style.display = 'flex';
  }
  refreshShop(items: { icon: string; name: string; desc: string; price: number; sold?: boolean }[], bank: number): void {
    this.renderShop(items, bank);
  }
  private renderShop(items: { icon: string; name: string; desc: string; price: number; sold?: boolean }[], bank: number): void {
    this.shopBank.textContent = `局内金币 💰 ${bank}`;
    this.shopItemsEl.innerHTML = '';
    items.forEach((it, i) => {
      const card = document.createElement('div');
      card.className = 'shop-item';
      card.innerHTML = `<span class="s-icon">${it.icon}</span><strong>${it.name}</strong><span class="s-desc">${it.desc}</span>`;
      const btn = document.createElement('button');
      btn.className = 's-buy';
      if (it.sold) {
        btn.textContent = '已售'; btn.disabled = true;
      } else {
        btn.textContent = `💰 ${it.price}`;
        btn.disabled = bank < it.price;
        btn.addEventListener('click', () => { if (this.onShopBuy) this.onShopBuy(i); });
      }
      card.appendChild(btn);
      this.shopItemsEl.appendChild(card);
    });
  }

  showExtractDialog(value: number): void {
    this.extractDialogMode = 'boss';
    document.getElementById('extract-title')!.textContent = '👹 BOSS 已击败';
    document.getElementById('extract-sub')!.textContent = '可在此撤离保住战利品，或继续深入下一层迷宫';
    document.getElementById('extract-yes')!.innerHTML = '<span class="door-icon">🏃</span><strong>撤离</strong><em>落袋为安</em>';
    document.getElementById('extract-no')!.innerHTML = '<span class="door-icon">⬇️</span><strong>继续深入</strong><em>富贵险中求</em>';
    document.getElementById('extract-coins')!.textContent = `当前背包战利品总价值：💰 ${value}`;
    this.extractOverlay.style.display = 'flex';
  }

  showExitConfirm(value: number): void {
    this.extractDialogMode = 'exit';
    document.getElementById('extract-title')!.textContent = '🟢 确认撤离';
    document.getElementById('extract-sub')!.textContent = '确认后立即结束本次探索并带出全部战利品';
    document.getElementById('extract-yes')!.innerHTML = '<span class="door-icon">🏃</span><strong>确认撤离</strong><em>结束本次探索</em>';
    document.getElementById('extract-no')!.innerHTML = '<span class="door-icon">↩️</span><strong>暂不撤离</strong><em>留在当前房间</em>';
    document.getElementById('extract-coins')!.textContent = `当前背包战利品总价值：💰 ${value}`;
    this.extractOverlay.style.display = 'flex';
  }

  showEnd(victory: boolean, title: string, lines: string[]): void {
    this.endTitle.textContent = title;
    this.endTitle.style.color = victory ? '#35e07a' : '#ff5c5c';
    this.endStats.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    this.endOverlay.style.display = 'flex';
  }

  // 搜刮：物品图标在容器处出现（品质色外发光），曲线飞入左下角背包按钮后消失
  flyItemToBag(worldPos: THREE.Vector3, icon: string, color: string, camera: THREE.Camera): void {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    const v = worldPos.clone().project(camera);
    const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
    const stageRect = this.stage.getBoundingClientRect();
    const bagRect = this.bagBtn.getBoundingClientRect();
    const ex = bagRect.left + bagRect.width / 2 - stageRect.left;
    const ey = bagRect.top + bagRect.height / 2 - stageRect.top;
    const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 120;  // 控制点抬高 → 曲线
    const el = document.createElement('div');
    el.className = 'fly-item';
    el.textContent = icon;
    el.style.setProperty('--glow', color);
    this.floaterLayer.appendChild(el);
    const dur = 800, t0 = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / dur);
      const mt = 1 - t;
      const x = mt * mt * sx + 2 * mt * t * cx + t * t * ex;
      const y = mt * mt * sy + 2 * mt * t * cy + t * t * ey;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.transform = `translate(-50%, -50%) scale(${1 - 0.55 * t})`;
      el.style.opacity = `${t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2}`;
      if (t < 1) requestAnimationFrame(step); else el.remove();
    };
    requestAnimationFrame(step);
  }

  floatText(worldPos: THREE.Vector3, text: string, cls: string): void {
    if (this.floaters.length > 30) return;
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.textContent = text;
    this.floaterLayer.appendChild(el);
    this.floaters.push({ el, worldPos: worldPos.clone(), age: 0, life: 0.65 });
  }

  updateFloaters(dt: number, camera: THREE.Camera): void {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    const v = new THREE.Vector3();
    for (const f of this.floaters) {
      f.age += dt;
      if (f.age >= f.life) { f.el.remove(); continue; }
      f.worldPos.y += dt * 1.2;
      v.copy(f.worldPos).project(camera);
      f.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
      f.el.style.opacity = `${1 - f.age / f.life}`;
    }
    this.floaters = this.floaters.filter((f) => f.age < f.life);
  }
}
