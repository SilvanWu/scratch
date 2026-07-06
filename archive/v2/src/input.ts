import * as THREE from 'three';

// 鼠标瞄准 + 按键。射击为点击触发，换弹R。
export class Input {
  // 归一化鼠标位置（NDC，-1~1）
  mouseNDC: THREE.Vector2 = new THREE.Vector2(0, 0);
  mousePx: { x: number; y: number } = { x: 0, y: 0 };
  private keys: Set<string> = new Set();
  private pressed: Set<string> = new Set();
  private clicked: boolean = false;
  private mouseDown: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('mousemove', (e: MouseEvent) => {
      this.mousePx.x = e.clientX;
      this.mousePx.y = e.clientY;
      this.mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0) {
        this.clicked = true;
        this.mouseDown = true;
      }
    });
    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 0) this.mouseDown = false;
    });
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

  // 本帧是否点击（消费式）
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
