// 构建脚本：TS → JS（Node 内置类型剥离）→ 单文件 HTML
// 用法: node build.js
const { stripTypeScriptTypes } = require('node:module');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const ORDER = ['input.ts', 'audio.ts', 'meta.ts', 'items.ts', 'pacts.ts', 'rooms.ts', 'enemy.ts', 'player.ts', 'boss.ts', 'assistant.ts', 'hud.ts', 'game.ts', 'main.ts'];

function compileFile(file) {
  const code = fs.readFileSync(path.join(SRC, file), 'utf8');
  let js = stripTypeScriptTypes(code, { mode: 'strip' });
  js = js
    .split('\n')
    .filter((line) => !/^\s*import\b/.test(line))
    .map((line) => line.replace(/^export\s+((?:abstract\s+)?(?:class|function|const|let|var))\b/, '$1'))
    .join('\n');
  return `// ===== ${file} =====\n${js}`;
}

const bundle =
  `import * as THREE from 'three';\n\n` + ORDER.map(compileFile).join('\n\n');

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'bundle.mjs'), bundle);

const template = fs.readFileSync(path.join(__dirname, 'index.template.html'), 'utf8');
const html = template.replace('/*__BUNDLE__*/', () => bundle);
fs.writeFileSync(path.join(__dirname, 'index.html'), html);

console.log(`OK: dist/bundle.mjs (${bundle.length} chars), index.html generated`);
