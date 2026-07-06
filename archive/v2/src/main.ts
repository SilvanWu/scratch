import { Game } from './game';
import { Meta } from './meta';
import { AudioFX } from './audio';

const meta = new Meta();
const audio = new AudioFX();

document.getElementById('bank-text')!.textContent =
  `💰 金库 ${meta.data.bank} ｜ 最深 ${meta.data.bestDepth} ｜ 撤离 ${meta.data.extracts}/${meta.data.runs}`;

function startGame(startDepth: number): void {
  audio.init();
  audio.startAmbient();
  document.getElementById('start-overlay')!.style.display = 'none';
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const game = new Game(canvas, meta, audio, startDepth);
  game.start();
}

document.getElementById('start-btn')!.addEventListener('click', () => startGame(0));

// 安全屋检查点出发（策划案"安全屋"：再次探索可从已解锁安全屋开始）
const cpBtn = document.getElementById('checkpoint-btn')!;
if (meta.data.checkpoint > 0) {
  cpBtn.style.display = 'inline-block';
  cpBtn.textContent = `🏕️ 从安全屋出发（深度 ${meta.data.checkpoint}）`;
  cpBtn.addEventListener('click', () => startGame(meta.data.checkpoint));
}
