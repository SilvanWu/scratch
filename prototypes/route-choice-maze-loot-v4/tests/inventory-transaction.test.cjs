const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

function compile(file) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
  return stripTypeScriptTypes(source, { mode: 'strip' })
    .split('\n')
    .filter((line) => !/^\s*import\b/.test(line))
    .map((line) => line.replace(/^export\s+((?:abstract\s+)?(?:class|function|const|let|var))\b/, '$1'))
    .join('\n');
}

const context = { console, Math };
vm.runInNewContext(
  `${compile('content-config.ts')}\n${compile('items.ts')}\nglobalThis.__inventory = { Backpack };`,
  context,
);
const { Backpack } = context.__inventory;

let nextId = 1000;
function item(cx, cy, w = 1, h = 1, kind = 'treasure') {
  return {
    id: nextId++, kind, name: `item-${nextId}`, icon: '*', color: '#fff',
    cx, cy, w, h,
  };
}

function snapshot(bag) {
  return JSON.stringify({
    items: bag.items.map((entry) => ({
      id: entry.id, cx: entry.cx, cy: entry.cy, w: entry.w, h: entry.h,
      equipped: entry.equipped, slot: entry.slot,
    })),
    slots: bag.weaponSlots.map((entry) => entry ? {
      id: entry.id, cx: entry.cx, cy: entry.cy, equipped: entry.equipped, slot: entry.slot,
    } : null),
  });
}

function testMoveCommitsOnce() {
  const bag = new Backpack();
  const moving = item(0, 0, 2, 1);
  bag.items.push(moving, item(5, 4));
  const before = snapshot(bag);
  const tx = bag.beginDragTransaction(moving);
  const preview = tx.preview(2, 2);
  assert.equal(preview.mode, 'move');
  assert.equal(snapshot(bag), before, 'preview must not mutate inventory');
  const result = tx.commit(preview);
  assert.equal(result.committed, true);
  assert.equal(result.mode, 'move');
  assert.equal(moving.cx, 2);
  assert.equal(moving.cy, 2);
}

function testSingleItemSwap() {
  const bag = new Backpack();
  const moving = item(0, 0, 2, 1);
  const target = item(3, 1, 1, 2);
  bag.items.push(moving, target);
  const tx = bag.beginDragTransaction(moving);
  const preview = tx.preview(3, 1);
  assert.equal(preview.mode, 'swap');
  assert.equal(tx.commit(preview).committed, true);
  assert.equal([moving.cx, moving.cy, target.cx, target.cy].join(','), '3,1,0,0');
}

function testMultipleOverlapRollsBack() {
  const bag = new Backpack();
  const moving = item(0, 0, 2, 2);
  bag.items.push(moving, item(2, 0), item(3, 1));
  const before = snapshot(bag);
  const tx = bag.beginDragTransaction(moving);
  const preview = tx.preview(2, 0);
  assert.equal(preview.reason, 'multiple-overlap');
  assert.equal(tx.commit(preview).committed, false);
  assert.equal(snapshot(bag), before, 'failed multi-overlap must leave inventory unchanged');
}

function testBlockedSwapRollsBack() {
  const bag = new Backpack();
  const moving = item(0, 0, 2, 1);
  bag.items.push(moving, item(4, 3), item(5, 3));
  const before = snapshot(bag);
  const tx = bag.beginDragTransaction(moving);
  const preview = tx.preview(3, 3);
  assert.equal(preview.reason, 'swap-blocked');
  assert.equal(tx.commit(preview).committed, false);
  assert.equal(snapshot(bag), before, 'failed swap must leave inventory unchanged');
}

function testStalePreviewCannotCommit() {
  const bag = new Backpack();
  const moving = item(0, 0);
  const other = item(4, 4);
  bag.items.push(moving, other);
  const tx = bag.beginDragTransaction(moving);
  const preview = tx.preview(2, 2);
  other.cx = 3;
  const beforeCommit = snapshot(bag);
  assert.equal(tx.commit(preview).committed, false);
  assert.equal(snapshot(bag), beforeCommit, 'stale transaction must not add mutations');
}

function testEquipFailureIsAtomic() {
  const bag = new Backpack();
  const moving = item(0, 0, 1, 1, 'weapon');
  moving.weapon = {};
  bag.items.push(moving);
  for (let y = 0; y < bag.rows; y++) {
    for (let x = 0; x < bag.cols; x++) {
      if (x !== 0 || y !== 0) bag.items.push(item(x, y));
    }
  }
  const equipped = item(0, 0, 2, 1, 'weapon');
  equipped.weapon = {};
  equipped.equipped = true;
  equipped.slot = 0;
  bag.weaponSlots[0] = equipped;
  const before = snapshot(bag);
  assert.equal(bag.equipToSlot(moving.id, 0), false);
  assert.equal(snapshot(bag), before, 'failed weapon replacement must be atomic');
}

testMoveCommitsOnce();
testSingleItemSwap();
testMultipleOverlapRollsBack();
testBlockedSwapRollsBack();
testStalePreviewCannotCommit();
testEquipFailureIsAtomic();
console.log('inventory transaction tests: 6 passed');
