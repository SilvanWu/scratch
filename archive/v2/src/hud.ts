import * as THREE from 'three';
import { RoomType, ROOM_INFO } from './rooms';
import { Backpack, TreasureItem, RARITY_INFO, CONSUMABLE_INFO, ConsumableKind } from './items';

interface Floater {
  el: HTMLElement;
  worldPos: THREE.Vector3;
  age: number;
  life: number;
}

export class HUD {
  private hpFill: HTMLElement;
  private hpText: HTMLElement;
  private sanFill: HTMLElement;
  private sanText: HTMLElement;
  private ammoText: HTMLElement;
  private reloadHint: HTMLElement;
  private coinsText: HTMLElement;
  private depthText: HTMLElement;
  private stateText: HTMLElement;
  private crosshair: HTMLElement;
  private hitmarker: HTMLElement;
  private toastEl: HTMLElement;
  private promptEl: HTMLElement;
  private vignette: HTMLElement;
  private floaterLayer: HTMLElement;
  private searchPanel: HTMLElement;
  private searchFill: HTMLElement;
  private searchLabel: HTMLElement;
  private skipBtn: HTMLElement;
  private choiceOverlay: HTMLElement;
  private choiceCards: HTMLElement;
  private extractOverlay: HTMLElement;
  private endOverlay: HTMLElement;
  private endTitle: HTMLElement;
  private endStats: HTMLElement;
  private bagSlots: HTMLElement;
  private bagValue: HTMLElement;
  private conSlots: HTMLElement;
  private bagfullOverlay: HTMLElement;
  private intelOverlay: HTMLElement;
  private intelText: HTMLElement;

  private toastTimer: number = 0;
  private hitTimer: number = 0;
  private floaters: Floater[] = [];
  private lastBagSig: string = '';

  onSkipSearch: (() => void) | null = null;
  onChoice: ((t: RoomType) => void) | null = null;
  onExtract: ((leave: boolean) => void) | null = null;
  onBagDecision: ((replace: boolean) => void) | null = null;
  onIntelContinue: (() => void) | null = null;

  constructor() {
    const $ = (id: string): HTMLElement => document.getElementById(id)!;
    this.hpFill = $('hp-fill'); this.hpText = $('hp-text');
    this.sanFill = $('san-fill'); this.sanText = $('san-text');
    this.ammoText = $('ammo-text'); this.reloadHint = $('reload-hint');
    this.coinsText = $('coins-text'); this.depthText = $('depth-text');
    this.stateText = $('state-text');
    this.crosshair = $('crosshair'); this.hitmarker = $('hitmarker');
    this.toastEl = $('toast'); this.promptEl = $('prompt');
    this.vignette = $('vignette');
    this.floaterLayer = $('floater-layer');
    this.searchPanel = $('search-panel');
    this.searchFill = $('search-fill');
    this.searchLabel = $('search-label');
    this.skipBtn = $('skip-btn');
    this.choiceOverlay = $('choice-overlay');
    this.choiceCards = $('choice-cards');
    this.extractOverlay = $('extract-overlay');
    this.endOverlay = $('end-overlay');
    this.endTitle = $('end-title');
    this.endStats = $('end-stats');
    this.bagSlots = $('bag-slots');
    this.bagValue = $('bag-value');
    this.conSlots = $('con-slots');
    this.bagfullOverlay = $('bagfull-overlay');
    this.intelOverlay = $('intel-overlay');
    this.intelText = $('intel-text');

    this.skipBtn.addEventListener('click', () => {
      if (this.onSkipSearch) this.onSkipSearch();
    });
    $('extract-yes').addEventListener('click', () => {
      this.extractOverlay.style.display = 'none';
      if (this.onExtract) this.onExtract(true);
    });
    $('extract-no').addEventListener('click', () => {
      this.extractOverlay.style.display = 'none';
      if (this.onExtract) this.onExtract(false);
    });
    $('bagfull-replace').addEventListener('click', () => {
      this.bagfullOverlay.style.display = 'none';
      if (this.onBagDecision) this.onBagDecision(true);
    });
    $('bagfull-discard').addEventListener('click', () => {
      this.bagfullOverlay.style.display = 'none';
      if (this.onBagDecision) this.onBagDecision(false);
    });
    $('intel-continue').addEventListener('click', () => {
      this.intelOverlay.style.display = 'none';
      if (this.onIntelContinue) this.onIntelContinue();
    });
    $('restart-btn').addEventListener('click', () => location.reload());
  }

  update(
    dt: number, hp: number, maxHp: number, sanity: number, maxSanity: number,
    ammo: number, magSize: number, reloading: number, reloadTime: number,
    bagValue: number, depth: number, stateLabel: string, mousePx: { x: number; y: number }
  ): void {
    this.hpFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    this.hpText.textContent = `${Math.ceil(hp)}`;
    this.sanFill.style.width = `${Math.max(0, (sanity / maxSanity) * 100)}%`;
    this.sanText.textContent = `${Math.ceil(sanity)}`;
    this.ammoText.textContent = reloading > 0 ? '装填中' : `${ammo} / ${magSize}`;
    this.reloadHint.style.opacity = reloading > 0 ? '1' : '0';
    if (reloading > 0) {
      const p = 1 - reloading / reloadTime;
      this.reloadHint.textContent = `🔄 ${(p * 100).toFixed(0)}%`;
    }
    this.coinsText.textContent = `💰 ${bagValue}`;
    this.depthText.textContent = `深度 ${depth}`;
    this.stateText.textContent = stateLabel;

    this.crosshair.style.transform = `translate(${mousePx.x}px, ${mousePx.y}px)`;

    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      this.hitmarker.style.transform = `translate(${mousePx.x}px, ${mousePx.y}px)`;
      if (this.hitTimer <= 0) this.hitmarker.style.opacity = '0';
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.style.opacity = '0';
    }

    const danger = Math.max(1 - hp / maxHp, 1 - sanity / maxSanity);
    this.vignette.style.opacity = `${Math.min(0.85, danger * 0.9)}`;
  }

  // ===== 背包UI =====
  updateBackpack(bag: Backpack): void {
    const sig =
      bag.items.map((i) => i.name + i.value).join(',') + '|' +
      bag.consumables.med + bag.consumables.sedative + bag.consumables.grenade;
    if (sig === this.lastBagSig) return;
    this.lastBagSig = sig;

    this.bagSlots.innerHTML = '';
    for (let i = 0; i < bag.cap; i++) {
      const slot = document.createElement('div');
      slot.className = 'bag-slot';
      const item = bag.items[i];
      if (item) {
        slot.style.borderColor = RARITY_INFO[item.rarity].color;
        slot.innerHTML = `<span class="b-icon">${item.icon}</span><span class="b-val">${item.value}</span>`;
        slot.title = `${item.name}（${RARITY_INFO[item.rarity].name}）价值${item.value}`;
      }
      this.bagSlots.appendChild(slot);
    }
    this.bagValue.textContent = `总价值 ${bag.totalValue}`;

    this.conSlots.innerHTML = '';
    const kinds: ConsumableKind[] = ['med', 'sedative', 'grenade'];
    for (const k of kinds) {
      const info = CONSUMABLE_INFO[k];
      const n = bag.consumables[k];
      const slot = document.createElement('div');
      slot.className = 'con-slot' + (n <= 0 ? ' empty' : '');
      slot.innerHTML =
        `<span class="c-key">${info.key}</span><span class="c-icon">${info.icon}</span><span class="c-n">×${n}</span>`;
      slot.title = `${info.name}：${info.desc}（按 ${info.key} 使用）`;
      this.conSlots.appendChild(slot);
    }
  }

  showBagFull(newItem: TreasureItem, lowest: TreasureItem): void {
    document.getElementById('bagfull-new')!.innerHTML =
      `新拾取：${newItem.icon} <b style="color:${RARITY_INFO[newItem.rarity].color}">${newItem.name}</b>（价值 ${newItem.value}）`;
    document.getElementById('bagfull-low')!.innerHTML =
      `背包最低：${lowest.icon} <b style="color:${RARITY_INFO[lowest.rarity].color}">${lowest.name}</b>（价值 ${lowest.value}）`;
    this.bagfullOverlay.style.display = 'flex';
  }

  // ===== 战前情报 =====
  showIntel(html: string): void {
    this.intelText.innerHTML = html;
    this.intelOverlay.style.display = 'flex';
  }

  showHitmarker(headshot: boolean): void {
    this.hitmarker.style.opacity = '1';
    this.hitmarker.style.color = headshot ? '#ff5c5c' : '#ffffff';
    this.hitmarker.style.fontSize = headshot ? '30px' : '22px';
    this.hitTimer = 0.18;
  }

  setPrompt(text: string | null): void {
    if (text) {
      this.promptEl.textContent = text;
      this.promptEl.style.opacity = '1';
    } else {
      this.promptEl.style.opacity = '0';
    }
  }

  showToast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    this.toastTimer = 1.8;
  }

  showSearchPanel(label: string): void {
    this.searchPanel.style.display = 'flex';
    this.searchLabel.textContent = label;
    this.searchFill.style.width = '0%';
  }
  setSearchProgress(p: number): void {
    this.searchFill.style.width = `${Math.min(100, p * 100)}%`;
  }
  hideSearchPanel(): void {
    this.searchPanel.style.display = 'none';
  }

  showChoice(options: RoomType[]): void {
    this.choiceCards.innerHTML = '';
    for (const t of options) {
      const info = ROOM_INFO[t];
      const card = document.createElement('button');
      card.className = 'door-card';
      card.innerHTML = `<span class="door-icon">${info.icon}</span><strong>${info.name}之间</strong><em>${info.hint}</em>`;
      card.addEventListener('click', () => {
        this.choiceOverlay.style.display = 'none';
        if (this.onChoice) this.onChoice(t);
      });
      this.choiceCards.appendChild(card);
    }
    this.choiceOverlay.style.display = 'flex';
  }

  showExtractDialog(value: number): void {
    document.getElementById('extract-coins')!.textContent =
      `当前背包战利品总价值：💰 ${value}`;
    this.extractOverlay.style.display = 'flex';
  }

  showEnd(victory: boolean, title: string, lines: string[]): void {
    this.endTitle.textContent = title;
    this.endTitle.style.color = victory ? '#35e07a' : '#ff5c5c';
    this.endStats.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    this.endOverlay.style.display = 'flex';
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
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    for (const f of this.floaters) {
      f.age += dt;
      if (f.age >= f.life) {
        f.el.remove();
        continue;
      }
      f.worldPos.y += dt * 1.2;
      v.copy(f.worldPos).project(camera);
      f.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
      f.el.style.opacity = `${1 - f.age / f.life}`;
    }
    this.floaters = this.floaters.filter((f) => f.age < f.life);
  }
}
