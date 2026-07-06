import * as THREE from 'three';

// 鼠标/触屏瞄准（坐标相对游戏舞台，适配竖屏居中布局）
export class Input {
  mouseNDC: THREE.Vector2 = new THREE.Vector2(0, 0);
  mousePx: { x: number; y: number } = { x: 0, y: 0 };
  private keys: Set<string> = new Set();
  private pressed: Set<string> = new Set();
  private clicked: boolean = false;
  private mouseDown: boolean = false;
  private downAt: number = 0;          // 按下时刻（用于长按判定）
  private downPx: { x: number; y: number } = { x: 0, y: 0 };  // 按下位置（用于区分点按/拖动）
  downNDC: THREE.Vector2 = new THREE.Vector2(0, 0);            // 按下时的NDC（相对瞄准基准）
  readonly aimHoldMs: number = 150;    // 长按 0.15s 进入瞄准（兼顾点按拾取与射击响应）
  private stage: HTMLElement;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = document.getElementById('stage')!;

    const setPos = (clientX: number, clientY: number): void => {
      const rect = this.stage.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      this.mousePx.x = x;
      this.mousePx.y = y;
      this.mouseNDC.x = Math.max(-1, Math.min(1, (x / rect.width) * 2 - 1));
      this.mouseNDC.y = Math.max(-1, Math.min(1, -(y / rect.height) * 2 + 1));
    };

    // 松手判定点按：按下不立即算点击；松手时若“时长<阈值且几乎没移动”才算点按。
    // 这样长按=瞄准、短按=点按（拾取/切换索敌），不再相互误触。
    const onUp = (): void => {
      if (!this.mouseDown) return;
      this.mouseDown = false;
      const quick = performance.now() - this.downAt < this.aimHoldMs;
      const moved = Math.hypot(this.mousePx.x - this.downPx.x, this.mousePx.y - this.downPx.y);
      if (quick && moved < 16) this.clicked = true;   // 视为点按
    };

    window.addEventListener('mousemove', (e: MouseEvent) => setPos(e.clientX, e.clientY));
    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.downAt = performance.now();
        this.downPx = { x: this.mousePx.x, y: this.mousePx.y };
        this.downNDC.copy(this.mouseNDC);
      }
    });
    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 0) onUp();
    });

    // 触屏：按住瞄准，拖动跟随，快速点按=拾取/切换
    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      setPos(t.clientX, t.clientY);
      this.mouseDown = true;
      this.downAt = performance.now();
      this.downPx = { x: this.mousePx.x, y: this.mousePx.y };
      this.downNDC.copy(this.mouseNDC);
    }, { passive: false });
    canvas.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      setPos(t.clientX, t.clientY);
    }, { passive: false });
    canvas.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      onUp();
    }, { passive: false });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    window.addEventListener('contextmenu', (e: MouseEvent) => e.preventDefault());
  }

  consumeClick(): boolean {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }

  isFiring(): boolean {
    return this.mouseDown;
  }

  // 长按超过阈值才视为“进入瞄准（ADS）”——短按（tap）留给点击箱子/UI
  isAiming(): boolean {
    return this.mouseDown && (performance.now() - this.downAt) >= this.aimHoldMs;
  }

  wasPressed(code: string): boolean {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  endFrame(): void {
    this.pressed.clear();
    this.clicked = false;
  }
}
