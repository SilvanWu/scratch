import { Game } from './game';
import { Meta } from './meta';
import { AudioFX } from './audio';

const meta = new Meta();
const audio = new AudioFX();

document.getElementById('bank-text')!.textContent =
  `🪙 金库 ${meta.data.bank} ｜ 最深 ${meta.data.bestDepth} ｜ 撤离 ${meta.data.extracts}/${meta.data.runs}`;

document.getElementById('start-btn')!.addEventListener('click', () => {
  audio.init();
  audio.startAmbient();
  document.getElementById('start-overlay')!.style.display = 'none';
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const game = new Game(canvas, meta, audio);
  game.start();
});
