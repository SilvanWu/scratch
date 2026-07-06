import * as THREE from 'three';

// 鼠标/触屏瞄准（坐标相对游戏舞台，适配竖屏居中布局）
export class Input {
  mouseNDC: THREE.Vector2 = new THREE.Vector2(0, 0);
  mousePx: { x: number; y: number } = { x: 0, y: 0 };
  private keys: Set<string> = new Set();
  private pressed: Set<string> = new Set();
  private clicked: boolean = false;
  private mouseDown: boolean = false;
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

    window.addEventListener('mousemove', (e: MouseEvent) => setPos(e.clientX, e.clientY));
    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0) {
        this.clicked = true;
        this.mouseDown = true;
      }
    });
    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 0) this.mouseDown = false;
    });

    // 触屏：按下即瞄准+开火，拖动跟随
    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      setPos(t.clientX, t.clientY);
      this.clicked = true;
      this.mouseDown = true;
    }, { passive: false });
    canvas.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      setPos(t.clientX, t.clientY);
    }, { passive: false });
    canvas.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      this.mouseDown = false;
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
