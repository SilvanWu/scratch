import * as THREE from 'three';
import { RoomType, ROOM_INFO, sanityCostFor } from './rooms';
import { Backpack, InvItem, RARITY_INFO, ConsumableKind, CONSUMABLE_INFO } from './items';
import { Pact } from './pacts';

interface Floater {
  el: HTMLElement;
  worldPos: THREE.Vector3;
  age: number;
  life: number;
}

const CELL = 44;

export class HUD {
  private hpFill: HTMLElement;
  private hpText: HTMLElement;
  private sanFill: HTMLElement;
  private sanText: HTMLElement;
  private pickupLog!: HTMLElement;
  private depthText: HTMLElement;
  private stateText: HTMLElement;
  private crosshair: HTMLElement;
  private hitmarker: HTMLElement;
  private toastEl: HTMLElement;
  private promptEl: HTMLElement;
  private vignette: HTMLElement;
  private sanVignette!: HTMLElement;
  private floaterLayer: HTMLElement;
  private searchPanel: HTMLElement;
  private searchLabel: HTMLElement;
  private skipBtn: HTMLElement;
  private choiceOverlay: HTMLElement;
  private choiceCards: HTMLElement;
  private extractOverlay: HTMLElement;
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
  private mostNeededKind: ConsumableKind | null = null;
  private skillBtn: HTMLElement;
  private selIndex: number = 0;

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

  onSkipSearch: (() => void) | null = null;
  onChoice: ((t: RoomType) => void) | null = null;
  onExtract: ((leave: boolean) => void) | null = null;
  onIntelContinue: (() => void) | null = null;
  onWeaponTap: ((index: number) => void) | null = null;
  onUseConsumable: ((kind: ConsumableKind) => void) | null = null;
  onUseSkill: (() => void) | null = null;
  // 背包相关回调（game 端）
  onInventoryDirty: (() => void) | null = null;            // 装备/库存变化 → 同步武器与底部HUD
  onUseConsumableItem: ((kind: ConsumableKind) => void) | null = null; // 在背包内使用消耗品
  onBagToggle: ((open: boolean) => void) | null = null;    // 打开/关闭背包（暂停）
  onPauseToggle: ((paused: boolean) => void) | null = null; // 暂停按钮
  onSensitivity: ((v: number) => void) | null = null;       // 瞄准灵敏度滑块

  constructor() {
    const $ = (id: string): HTMLElement => document.getElementById(id)!;
    this.stage = $('stage');
    this.hpFill = $('hp-fill'); this.hpText = $('hp-text');
    this.sanFill = $('san-fill'); this.sanText = $('san-text');
    this.pickupLog = $('pickup-log'); this.depthText = $('depth-text');
    this.stateText = $('state-text');
    this.crosshair = $('crosshair'); this.hitmarker = $('hitmarker');
    this.toastEl = $('toast'); this.promptEl = $('prompt');
    this.vignette = $('vignette');
    this.sanVignette = $('vignette-san');
    this.floaterLayer = $('floater-layer');
    this.searchPanel = $('search-panel');
    this.searchLabel = $('search-label');
    this.skipBtn = $('skip-btn');
    this.choiceOverlay = $('choice-overlay');
    this.choiceCards = $('choice-cards');
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

    this.skipBtn.addEventListener('click', () => { if (this.onSkipSearch) this.onSkipSearch(); });
    $('extract-yes').addEventListener('click', () => {
      this.extractOverlay.style.display = 'none';
      if (this.onExtract) this.onExtract(true);
    });
    $('extract-no').addEventListener('click', () => {
      this.extractOverlay.style.display = 'none';
      if (this.onExtract) this.onExtract(false);
    });
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

    // 消耗品按钮
    this.nadeBtn.addEventListener('click', () => { if (this.onUseConsumable) this.onUseConsumable('grenade'); });
    // 物品栏：主按钮使用“最需要”的消耗品；▲ 展开下拉选择任意消耗品
    this.itemBtn.addEventListener('click', () => {
      if (this.mostNeededKind && this.onUseConsumable) this.onUseConsumable(this.mostNeededKind);
    });
    this.itemExpand.addEventListener('click', (e) => { e.stopPropagation(); this.toggleItemDropdown(); });
    this.skillBtn.addEventListener('click', () => { if (this.onUseSkill) this.onUseSkill(); });

    // 拖拽全局监听
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
  }

  bindBag(bag: Backpack): void { this.bag = bag; }

  update(
    dt: number, hp: number, maxHp: number, sanity: number, maxSanity: number,
    ammo: number, magSize: number, reloading: number, reloadTime: number,
    bagValue: number, depth: number, stateLabel: string, mousePx: { x: number; y: number },
    reserve: number, coins: number
  ): void {
    this.hpFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    this.hpText.textContent = `${Math.ceil(hp)}`;
    this.sanFill.style.width = `${Math.max(0, (sanity / maxSanity) * 100)}%`;
    this.sanText.textContent = `${Math.ceil(sanity)}`;
    this.depthText.textContent = `深度 ${depth}`;
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
      this.setConCount(this.nadeBtn, this.bag.countKind('grenade'));
      // 物品栏：根据生命/神智百分比，优先显示最需要的消耗品
      const meds = (Object.keys(CONSUMABLE_INFO) as ConsumableKind[])
        .filter((k) => k !== 'grenade' && this.bag!.countKind(k) > 0);
      let pick: ConsumableKind | null = null;
      if (meds.length > 0) {
        const needHp = (hp / maxHp) <= (sanity / maxSanity);
        const prefer = meds.filter((k) => needHp ? CONSUMABLE_INFO[k].hp > 0 : CONSUMABLE_INFO[k].san > 0);
        const pool = prefer.length ? prefer : meds;
        pool.sort((a, b) => needHp
          ? CONSUMABLE_INFO[b].hp - CONSUMABLE_INFO[a].hp
          : CONSUMABLE_INFO[b].san - CONSUMABLE_INFO[a].san);
        pick = pool[0];
      }
      this.mostNeededKind = pick;
      const ic = this.itemBtn.querySelector('.a-icon') as HTMLElement | null;
      const nn = this.itemBtn.querySelector('.a-n') as HTMLElement | null;
      if (pick) {
        if (ic) ic.textContent = CONSUMABLE_INFO[pick].icon;
        if (nn) nn.textContent = `×${this.bag.countKind(pick)}`;
        this.itemBtn.classList.remove('empty');
      } else {
        if (ic) ic.textContent = '🧪';
        if (nn) nn.textContent = '×0';
        this.itemBtn.classList.add('empty');
      }
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
      btn.innerHTML = `<span class="w-icon">${w.icon}</span><span class="w-ammo"></span>`;
      btn.title = w.name;
      btn.addEventListener('click', () => { if (this.onWeaponTap) this.onWeaponTap(i); });
      this.weaponSlotsEl.appendChild(btn);
      this.weaponBtns.push(btn);
    });
    this.setWeaponSelected(index);
  }
  setWeaponSelected(index: number): void {
    this.selIndex = index;
    this.weaponBtns.forEach((b, i) => b.classList.toggle('selected', i === index));
  }
  updateSkill(owned: boolean, charges: number): void {
    if (!owned) { this.skillBtn.style.display = 'none'; return; }
    this.skillBtn.style.display = 'flex';
    this.skillBtn.classList.toggle('empty', charges <= 0);
    const el = this.skillBtn.querySelector('.a-n') as HTMLElement | null;
    if (el) el.textContent = `×${charges}`;
  }
  // 物品栏下拉：列出背包中所有消耗品（不含手雷），点击使用
  private toggleItemDropdown(): void {
    if (this.itemDropdown.classList.contains('open')) {
      this.itemDropdown.classList.remove('open');
      return;
    }
    this.itemDropdown.innerHTML = '';
    const kinds = (Object.keys(CONSUMABLE_INFO) as ConsumableKind[])
      .filter((k) => k !== 'grenade' && this.bag !== null && this.bag.countKind(k) > 0);
    if (kinds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'item-row';
      empty.textContent = '（无消耗品）';
      this.itemDropdown.appendChild(empty);
    }
    for (const k of kinds) {
      const info = CONSUMABLE_INFO[k];
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `<span class="ir-icon">${info.icon}</span><span>${info.name}<span class="ir-desc"> ${info.desc}</span></span><span class="ir-n">×${this.bag!.countKind(k)}</span>`;
      row.addEventListener('click', () => {
        this.itemDropdown.classList.remove('open');
        if (this.onUseConsumable) this.onUseConsumable(k);
      });
      this.itemDropdown.appendChild(row);
    }
    this.itemDropdown.classList.add('open');
  }

  private setConCount(btn: HTMLElement, n: number): void {
    btn.classList.toggle('empty', n <= 0);
    const el = btn.querySelector('.a-n') as HTMLElement | null;
    if (el) el.textContent = `×${n}`;
  }

  // ===== 网格背包 =====
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
    else if (item.kind === 'treasure') descText = `${RARITY_INFO[item.rarity!].name}藏品 · 撤离结算价值 ${item.value}`;
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
    this.bossBar.style.display = 'block';
  }
  updateBossBar(hp: number, maxHp: number, phase: number): void {
    this.bossFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    this.bossName.textContent = this.bossName.textContent!.split(' ·')[0] + (phase === 2 ? ' · 暴怒' : '');
  }
  hideBossBar(): void { this.bossBar.style.display = 'none'; }

  showIntel(html: string): void {
    this.intelText.innerHTML = html;
    this.intelOverlay.style.display = 'flex';
  }

  setAds(on: boolean): void { this.adsMode = on; }

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

  showChoice(options: RoomType[], depth: number = 0, sanityReduce: number = 0): void {
    const titleEl = document.getElementById('choice-title');
    const subEl = document.getElementById('choice-sub');
    if (titleEl) titleEl.textContent = '选择路线';
    if (subEl) subEl.textContent = '前方房间，选择其一';
    this.choiceCards.innerHTML = '';
    for (const t of options) {
      const info = ROOM_INFO[t];
      const cost = Math.max(0, sanityCostFor(t, depth) - sanityReduce);
      const costLine = cost > 0
        ? `<em style="color:#7d9bff">🧠 神智 -${cost}</em>`
        : `<em style="color:#7CFFB0">无神智消耗</em>`;
      const card = document.createElement('button');
      card.className = 'door-card';
      card.innerHTML = `<span class="door-icon">${info.icon}</span><strong>${info.name}</strong><em>${info.hint}</em>${costLine}`;
      card.addEventListener('click', () => {
        this.choiceOverlay.style.display = 'none';
        if (this.onChoice) this.onChoice(t);
      });
      this.choiceCards.appendChild(card);
    }
    this.choiceOverlay.style.display = 'flex';
  }

  showPactChoice(pacts: Pact[], onPick: (p: Pact | null) => void, allowDecline: boolean = true, title?: string, sub?: string): void {
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
