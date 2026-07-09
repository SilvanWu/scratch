import * as THREE from 'three';
import { InvItem, rollSupplyContent, rollGemContent } from './items';

// 房间类型（corridor 只用于开局过渡，不进入路线图）
export type RoomType = 'corridor' | 'boss' | 'supply' | 'gem' | 'blessing' | 'curse' | 'safehouse' | 'shop';

// 章节主题（策划案"世界观"：金字塔/玛雅神庙/秦始皇陵）
export interface Theme {
  name: string;
  story: string;
  wall: number;
  floor: number;
  brick: string;
  gap: string;
}

export const THEMES: Theme[] = [
  { name: '第一章 · 失落金字塔', story: '黄沙之下，法老的诅咒仍在低语……找到王冠，活着出去。',
    wall: 0x8a7a60, floor: 0x6b5d48, brick: '#5a4d3b', gap: '#473c2e' },
  { name: '第二章 · 玛雅神庙', story: '雨林深处的石阶通向献祭之台，羽蛇神注视着每一个闯入者。',
    wall: 0x5f7a62, floor: 0x4a6350, brick: '#3e5a44', gap: '#2e4634' },
  { name: '第三章 · 秦陵地宫', story: '水银为江河，人俑为军阵。地宫深处，长明灯还亮着。',
    wall: 0x6a6a72, floor: 0x55555f, brick: '#4a4a52', gap: '#36363e' },
];

// 进入会刷新怪物的房间时一次性扣除的神智（非战斗房为 0）
export function sanityCostFor(type: RoomType, depth: number): number {
  if (type === 'supply' || type === 'gem') return 6 + Math.floor(depth / 4);
  if (type === 'blessing') return 10 + Math.floor(depth / 3);
  if (type === 'boss') return 20;
  return 0;
}

export function themeForDepth(depth: number): Theme {
  return THEMES[Math.floor(Math.max(0, depth - 1) / 30) % THEMES.length];
}

export const ROOM_INFO: Record<string, { name: string; icon: string; hint: string }> = {
  corridor: { name: '入口回廊', icon: '🚪', hint: '进入古墓前的过渡区域' },
  supply:   { name: '补给之屋', icon: '🧰', hint: '清怪后可搜刮药品/弹药' },
  gem:      { name: '宝藏之屋', icon: '💎', hint: '清怪后可搜刮宝藏' },
  blessing: { name: '祝福祭坛', icon: '😇', hint: '精英镇守，击败后三选一纯增益' },
  curse:    { name: '诅咒祭坛', icon: '😈', hint: '祭坛抉择：以代价换强力增益' },
  safehouse:{ name: '安全屋', icon: '🏕️', hint: '点击篝火回理智，或有补给' },
  shop:     { name: '局内商店', icon: '🛒', hint: '花局内金币购买本局补给' },
  boss:     { name: 'BOSS·撤离点', icon: '👹', hint: '本章主宰，击败后可撤离' },
};

export interface RouteNode {
  id: string;
  type: RoomType;
  floor: number;
  lane: number;
  depth: number;
  links: string[];
  visited: boolean;
  risk: string;
  reward: string;
}

export interface RouteMapSnapshot {
  nodes: RouteNode[];
  currentId: string | null;
  choiceIds: string[];
  floors: number;
  lanes: number;
  segmentStartDepth: number;
  segmentEndDepth: number;
}

interface RouteMapCandidate {
  nodes: RouteNode[];
  fairness: number;
  routeCount: number;
}

interface RouteProfile {
  vector: number[];
  routeCount: number;
}

export interface Room {
  type: RoomType;
  depth: number;        // 第几个房间
  group: THREE.Group;
  zEntry: number;       // 入口z（大）
  zCenter: number;      // 触发点
  zExit: number;        // 出口z（小）
  length: number;
  crates: THREE.Mesh[]; // 宝藏房可搜索点
  pickups: THREE.Mesh[]; // 可点击领取的资源（祭坛/篝火）
  searched: number;     // 已搜索数
  torches: THREE.PointLight[];
  cleared: boolean;
  doorPanels: THREE.Mesh[];  // 雕花石门（左右两扇）
  doorProgress: number;      // 0关 → 1全开
  doorRumbled: boolean;
  doorW: number;
  routeDoors: RouteDoorVisual[];
}

type RouteDoorDirection = 'left' | 'center' | 'right';

interface RouteDoorChoice {
  direction: RouteDoorDirection;
  node: RouteNode;
}

interface RouteDoorVisual {
  nodeId: string;
  direction: RouteDoorDirection;
  root: THREE.Group;
  leaf: THREE.Group;
  progress: number;
  opening: boolean;
}

const WIDTH = 11;
const HEIGHT = 5.2;

// 石材纹理（按主题缓存）
const texCache: Map<string, THREE.CanvasTexture> = new Map();
function getStoneTex(theme: Theme): THREE.CanvasTexture {
  const hit = texCache.get(theme.name);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = theme.brick;
  g.fillRect(0, 0, 128, 128);
  // 砖缝
  g.strokeStyle = theme.gap;
  g.lineWidth = 2;
  for (let y = 0; y < 128; y += 32) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke();
    const off = (y / 32) % 2 === 0 ? 0 : 32;
    for (let x = off; x < 128; x += 64) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke();
    }
  }
  // 噪点风化
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(30,24,16,${0.05 + Math.random() * 0.1})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  texCache.set(theme.name, tex);
  return tex;
}

// 门板浮雕纹理：石底 + 鎏金边 + 象形符文
const doorTexCache: Map<string, THREE.CanvasTexture> = new Map();
function getDoorTex(theme: Theme): THREE.CanvasTexture {
  const hit = doorTexCache.get(theme.name);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = theme.gap;
  g.fillRect(0, 0, 64, 128);
  // 鎏金描边
  g.strokeStyle = 'rgba(220,178,80,0.95)';
  g.lineWidth = 3;
  g.strokeRect(3, 3, 58, 122);
  g.strokeStyle = 'rgba(220,178,80,0.45)';
  g.lineWidth = 1;
  g.strokeRect(8, 8, 48, 112);
  // 象形符文（圆/眼/波浪/三角，逐行排布）
  g.strokeStyle = 'rgba(255,214,130,0.8)';
  g.fillStyle = 'rgba(255,214,130,0.55)';
  g.lineWidth = 1.5;
  for (let row = 0; row < 5; row++) {
    const y = 20 + row * 21;
    const kind = row % 4;
    if (kind === 0) { // 荷鲁斯之眼
      g.beginPath(); g.ellipse(32, y, 9, 4.5, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(32, y, 2, 0, Math.PI * 2); g.fill();
    } else if (kind === 1) { // 安卡
      g.beginPath(); g.arc(32, y - 3, 4, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(32, y + 1); g.lineTo(32, y + 8); g.moveTo(26, y + 3); g.lineTo(38, y + 3); g.stroke();
    } else if (kind === 2) { // 水波
      g.beginPath();
      for (let x = 14; x <= 50; x += 4) {
        g.lineTo(x, y + ((x / 4) % 2 === 0 ? -3 : 3));
      }
      g.stroke();
    } else { // 金字塔三角
      g.beginPath(); g.moveTo(32, y - 5); g.lineTo(24, y + 5); g.lineTo(40, y + 5); g.closePath(); g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  doorTexCache.set(theme.name, tex);
  return tex;
}

const routeDoorTexCache: Map<string, THREE.CanvasTexture> = new Map();
function getRouteDoorTex(theme: Theme, type: RoomType): THREE.CanvasTexture {
  const key = `${theme.name}:${type}`;
  const hit = routeDoorTexCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 384;
  const g = c.getContext('2d')!;
  g.fillStyle = theme.gap;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 900; i++) {
    const shade = Math.random() < 0.55 ? 255 : 0;
    g.fillStyle = `rgba(${shade},${shade},${shade},${0.015 + Math.random() * 0.035})`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }

  const sx = c.width / 256;
  const sy = c.height / 384;
  const x = (v: number): number => v * sx;
  const y = (v: number): number => v * sy;
  const line = (color = 'rgba(245,226,176,0.9)', width = 7): void => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.fillStyle = color;
  };

  // Door-carving guide lines: every symbol sits inside the same rough doorway mark.
  line('rgba(222,180,92,0.76)', 5);
  g.strokeRect(x(26), y(24), x(204), y(336));
  line('rgba(245,226,176,0.35)', 3);
  g.strokeRect(x(42), y(42), x(172), y(300));
  line('rgba(245,226,176,0.88)', 7);

  const cx = x(128);
  const cy = y(192);
  const begin = (): void => g.beginPath();
  const stroke = (): void => g.stroke();

  if (type === 'supply') {
    begin(); g.rect(x(72), y(190), x(112), y(74)); stroke();
    begin(); g.moveTo(x(72), y(210)); g.lineTo(x(128), y(170)); g.lineTo(x(184), y(210)); stroke();
    begin(); g.moveTo(cx, y(96)); g.lineTo(cx, y(152)); g.moveTo(x(100), y(124)); g.lineTo(x(156), y(124)); stroke();
    begin(); g.moveTo(x(92), y(230)); g.lineTo(x(164), y(230)); stroke();
  } else if (type === 'gem') {
    begin(); g.moveTo(cx, y(86)); g.lineTo(x(172), y(136)); g.lineTo(cx, y(188)); g.lineTo(x(84), y(136)); g.closePath(); stroke();
    begin(); g.moveTo(x(84), y(136)); g.lineTo(x(172), y(136)); g.moveTo(cx, y(86)); g.lineTo(cx, y(188)); stroke();
    begin(); g.rect(x(70), y(224), x(116), y(52)); stroke();
    begin(); g.moveTo(x(70), y(224)); g.quadraticCurveTo(cx, y(190), x(186), y(224)); stroke();
  } else if (type === 'blessing') {
    begin(); g.arc(cx, y(118), x(24), 0, Math.PI * 2); stroke();
    begin(); g.moveTo(cx, y(150)); g.lineTo(cx, y(262)); stroke();
    begin(); g.moveTo(x(116), y(184)); g.quadraticCurveTo(x(62), y(152), x(54), y(214)); g.quadraticCurveTo(x(84), y(202), x(106), y(226)); stroke();
    begin(); g.moveTo(x(140), y(184)); g.quadraticCurveTo(x(194), y(152), x(202), y(214)); g.quadraticCurveTo(x(172), y(202), x(150), y(226)); stroke();
    begin(); g.moveTo(x(92), y(288)); g.lineTo(x(164), y(288)); stroke();
  } else if (type === 'curse') {
    begin(); g.moveTo(x(78), y(266)); g.lineTo(cx, y(144)); g.lineTo(x(178), y(266)); g.closePath(); stroke();
    begin(); g.moveTo(x(98), y(124)); g.quadraticCurveTo(x(70), y(80), x(52), y(116)); g.moveTo(x(158), y(124)); g.quadraticCurveTo(x(186), y(80), x(204), y(116)); stroke();
    begin(); g.moveTo(cx, y(168)); g.quadraticCurveTo(x(106), y(208), cx, y(236)); g.quadraticCurveTo(x(150), y(210), cx, y(168)); stroke();
  } else if (type === 'safehouse') {
    begin(); g.arc(cx, y(132), x(56), Math.PI * 0.18, Math.PI * 1.82); stroke();
    begin(); g.moveTo(x(92), y(274)); g.lineTo(x(164), y(224)); g.moveTo(x(164), y(274)); g.lineTo(x(92), y(224)); stroke();
    begin(); g.moveTo(cx, y(184)); g.quadraticCurveTo(x(102), y(230), cx, y(258)); g.quadraticCurveTo(x(154), y(228), cx, y(184)); stroke();
  } else if (type === 'shop') {
    begin(); g.moveTo(cx, y(92)); g.lineTo(cx, y(268)); g.moveTo(x(76), y(132)); g.lineTo(x(180), y(132)); stroke();
    begin(); g.moveTo(x(88), y(132)); g.lineTo(x(62), y(208)); g.lineTo(x(114), y(208)); g.closePath(); stroke();
    begin(); g.moveTo(x(168), y(132)); g.lineTo(x(142), y(208)); g.lineTo(x(194), y(208)); g.closePath(); stroke();
    begin(); g.arc(cx, y(296), x(24), 0, Math.PI * 2); stroke();
  } else if (type === 'boss') {
    begin(); g.moveTo(x(74), y(112)); g.lineTo(x(100), y(66)); g.lineTo(cx, y(108)); g.lineTo(x(156), y(66)); g.lineTo(x(182), y(112)); stroke();
    begin(); g.moveTo(x(82), y(140)); g.quadraticCurveTo(cx, y(104), x(174), y(140)); g.lineTo(x(164), y(270)); g.quadraticCurveTo(cx, y(300), x(92), y(270)); g.closePath(); stroke();
    begin(); g.moveTo(x(104), y(190)); g.lineTo(x(116), y(190)); g.moveTo(x(140), y(190)); g.lineTo(x(152), y(190)); stroke();
    begin(); g.moveTo(cx, y(210)); g.lineTo(x(114), y(250)); g.lineTo(x(142), y(250)); g.closePath(); stroke();
  } else {
    begin(); g.moveTo(x(78), y(284)); g.lineTo(x(78), y(156)); g.quadraticCurveTo(cx, y(82), x(178), y(156)); g.lineTo(x(178), y(284)); stroke();
    begin(); g.moveTo(cx, y(160)); g.lineTo(cx, y(282)); g.moveTo(x(100), y(220)); g.lineTo(x(156), y(220)); stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 2;
  routeDoorTexCache.set(key, tex);
  return tex;
}

export class Dungeon {
  rooms: Room[] = [];
  private scene: THREE.Scene;
  private nextZ: number = 0; // 下一个房间入口z
  private depthCount: number = 0;
  private lastShopDepth: number = -10;  // 上一个商店所在深度（控制间隔）
  private routeNodes: RouteNode[] = [];
  private routeCurrentId: string | null = null;
  private routeSegmentStartDepth: number = 0;
  private routeSegmentIndex: number = 0;
  private readonly routeRoomsPerSegment: number = 10;
  private readonly routeFloors: number = 11;
  private readonly routeLanes: number = 3;
  private readonly routeRestFloor: number = 6;
  private readonly routeFixedLane: number = 1;

  constructor(scene: THREE.Scene, startDepth: number = 0) {
    this.scene = scene;
    this.depthCount = startDepth;
  }

  get currentDepth(): number {
    return this.depthCount;
  }

  // 参考杀戮尖塔：每段 10 节，3 条主路线，少量横向连线，终点为 BOSS/撤离点。
  nextChoices(): RouteNode[] {
    this.ensureRouteMap();
    return this.availableRouteChoices();
  }

  routeSnapshot(): RouteMapSnapshot {
    this.ensureRouteMap();
    const choices = this.peekRouteChoices().map((n) => n.id);
    return {
      nodes: this.routeNodes.map((n) => ({
        ...n,
        links: n.links.slice(),
      })),
      currentId: this.routeCurrentId,
      choiceIds: choices,
      floors: this.routeFloors,
      lanes: this.routeLanes,
      segmentStartDepth: this.routeSegmentStartDepth,
      segmentEndDepth: this.routeSegmentStartDepth + this.routeRoomsPerSegment,
    };
  }

  appendEntrance(): Room {
    return this.append('corridor', false);
  }

  appendRouteNode(node: RouteNode, matchNodeDepth: boolean = false): Room {
    const live = this.routeNodes.find((n) => n.id === node.id);
    if (!live) {
      if (matchNodeDepth) this.depthCount = Math.max(0, node.depth - 1);
      return this.append(node.type);
    }
    if (matchNodeDepth) this.depthCount = Math.max(0, live.depth - 1);
    live.visited = true;
    this.routeCurrentId = live.id;
    const routeDoors = this.routeDoorChoicesFor(live);
    return this.append(live.type, true, routeDoors);
  }

  private routeDoorChoicesFor(current: RouteNode): RouteDoorChoice[] {
    const byId = new Map(this.routeNodes.map((n) => [n.id, n]));
    const targets = current.links
      .map((id) => byId.get(id))
      .filter((n): n is RouteNode => !!n)
      .sort((a, b) => a.lane - b.lane);

    const choices: RouteDoorChoice[] = [];
    const used = new Set<RouteDoorDirection>();
    const naturalDirection = (target: RouteNode): RouteDoorDirection =>
      target.lane < current.lane ? 'left' : target.lane > current.lane ? 'right' : 'center';

    for (const target of targets) {
      const direction = naturalDirection(target);
      if (used.has(direction)) continue;
      used.add(direction);
      choices.push({ direction, node: target });
    }

    const remainingTargets = targets.filter((target) => !choices.some((choice) => choice.node.id === target.id));
    const remainingDirections: RouteDoorDirection[] = ['left', 'center', 'right'].filter((dir) => !used.has(dir)) as RouteDoorDirection[];
    for (let i = 0; i < remainingTargets.length && i < remainingDirections.length; i++) {
      choices.push({ direction: remainingDirections[i], node: remainingTargets[i] });
    }

    return choices;
  }

  private availableRouteChoices(): RouteNode[] {
    if (this.routeCurrentId === null) return this.startRouteChoices();
    const current = this.routeNodes.find((n) => n.id === this.routeCurrentId);
    if (!current || current.links.length === 0) {
      this.generateRouteMap();
      return this.startRouteChoices();
    }
    return current.links
      .map((id) => this.routeNodes.find((n) => n.id === id))
      .filter((n): n is RouteNode => !!n);
  }

  private peekRouteChoices(): RouteNode[] {
    if (this.routeCurrentId === null) return this.startRouteChoices();
    const current = this.routeNodes.find((n) => n.id === this.routeCurrentId);
    if (!current || current.links.length === 0) return [];
    return current.links
      .map((id) => this.routeNodes.find((n) => n.id === id))
      .filter((n): n is RouteNode => !!n);
  }

  private startRouteChoices(): RouteNode[] {
    const start = this.routeNodes.find((n) => n.type === 'corridor' && n.floor === 1);
    if (!start) return [];
    return start.links
      .map((id) => this.routeNodes.find((n) => n.id === id))
      .filter((n): n is RouteNode => !!n);
  }

  private ensureRouteMap(): void {
    if (this.routeNodes.length === 0) this.generateRouteMap();
  }

  private generateRouteMap(): void {
    this.routeSegmentIndex += 1;
    this.routeSegmentStartDepth = this.depthCount;
    let best: RouteMapCandidate | null = null;
    for (let i = 0; i < 120; i++) {
      const candidate = this.buildRouteCandidate();
      if (!best || candidate.fairness < best.fairness) best = candidate;
    }

    this.routeNodes = best ? best.nodes : this.buildRouteCandidate().nodes;
    const start = this.routeNodes.find((n) => n.type === 'corridor' && n.floor === 1);
    this.routeCurrentId = start ? start.id : null;
  }

  private buildRouteCandidate(): RouteMapCandidate {
    const nodes: RouteNode[] = [];
    const addNode = (id: string, floor: number, lane: number, type: RoomType, visited: boolean = false): RouteNode => {
      const depth = this.routeDepthForFloor(floor);
      const node: RouteNode = {
        id,
        type,
        floor,
        lane,
        depth,
        links: [],
        visited,
        risk: this.routeRisk(type),
        reward: this.routeReward(type),
      };
      nodes.push(node);
      return node;
    };

    const segment = this.routeSegmentIndex;
    const start = addNode(`r${segment}-start`, 1, this.routeFixedLane, 'corridor', true);
    const rest = addNode(`r${segment}-rest`, this.routeRestFloor, this.routeFixedLane, 'safehouse');
    const boss = addNode(`r${segment}-boss`, this.routeFloors, this.routeFixedLane, 'boss');

    for (let floor = 2; floor < this.routeFloors; floor++) {
      if (floor === this.routeRestFloor) continue;
      if (floor === this.routeFloors - 1) {
        addNode(`r${segment}-boss-shop`, floor, this.routeFixedLane, 'shop');
        continue;
      }
      const floorTypes = this.rollRouteFloorTypes(floor);
      for (let lane = 0; lane < this.routeLanes; lane++) {
        addNode(`r${segment}-${floor}-${lane}`, floor, lane, floorTypes[lane]);
      }
    }

    const byFloor = (floor: number): RouteNode[] =>
      nodes.filter((n) => n.floor === floor).sort((a, b) => a.lane - b.lane);
    const link = (from: RouteNode, to: RouteNode): void => {
      if (!from.links.includes(to.id)) from.links.push(to.id);
    };
    const linkAll = (from: RouteNode, targets: RouteNode[]): void => {
      for (const target of targets) link(from, target);
    };
    const linkAllToFixed = (fromFloor: number, target: RouteNode): void => {
      for (const node of byFloor(fromFloor)) link(node, target);
    };

    linkAll(start, byFloor(2));
    for (let floor = 2; floor < this.routeRestFloor - 1; floor++) {
      this.wireRandomFloor(nodes, floor, floor + 1);
    }
    linkAllToFixed(this.routeRestFloor - 1, rest);
    linkAll(rest, byFloor(this.routeRestFloor + 1));
    for (let floor = this.routeRestFloor + 1; floor < this.routeFloors - 1; floor++) {
      this.wireRandomFloor(nodes, floor, floor + 1);
    }
    linkAllToFixed(this.routeFloors - 1, boss);

    return this.evaluateRouteCandidate(nodes);
  }

  private wireRandomFloor(nodes: RouteNode[], fromFloor: number, toFloor: number): void {
    const fromNodes = nodes.filter((n) => n.floor === fromFloor).sort((a, b) => a.lane - b.lane);
    const targetNodes = nodes.filter((n) => n.floor === toFloor).sort((a, b) => a.lane - b.lane);
    if (fromNodes.length === 0 || targetNodes.length === 0) return;

    const byLane = (lane: number): RouteNode =>
      targetNodes.slice().sort((a, b) => Math.abs(a.lane - lane) - Math.abs(b.lane - lane))[0];
    const link = (from: RouteNode, to: RouteNode): void => {
      if (!from.links.includes(to.id)) from.links.push(to.id);
    };
    const linkLane = (fromLane: number, toLane: number): void => {
      const from = fromNodes.find((n) => n.lane === fromLane);
      if (!from) return;
      link(from, byLane(toLane));
    };

    for (const from of fromNodes) {
      link(from, byLane(from.lane));
    }

    const pattern = Math.floor(Math.random() * 6);
    if (pattern === 0) {
      linkLane(0, 1);
    } else if (pattern === 1) {
      linkLane(1, 0);
    } else if (pattern === 2) {
      linkLane(1, 2);
    } else if (pattern === 3) {
      linkLane(2, 1);
    } else if (pattern === 4) {
      linkLane(0, 1);
      linkLane(1, 2);
    } else {
      linkLane(2, 1);
      linkLane(1, 0);
    }
  }

  private routeDepthForFloor(floor: number): number {
    if (floor <= 1) return this.routeSegmentStartDepth;
    return this.routeSegmentStartDepth + Math.min(this.routeRoomsPerSegment, floor - 1);
  }

  private rollRouteFloorTypes(floor: number): RoomType[] {
    const depth = this.routeDepthForFloor(floor);
    const requireAllDifferent = floor === 2;
    let best: RoomType[] = [];
    for (let i = 0; i < 12; i++) {
      const types = Array.from({ length: this.routeLanes }, () => this.rollRouteType(floor, depth));
      const unique = new Set(types).size;
      if (requireAllDifferent ? unique === this.routeLanes : unique >= 2) return types;
      if (unique > new Set(best).size) best = types;
    }
    if (new Set(best).size >= 2) return best;

    const fallback: RoomType[] = floor <= 3
      ? ['supply', 'gem', 'blessing']
      : ['supply', 'gem', depth >= 6 ? 'shop' : 'blessing'];
    return fallback.slice(0, this.routeLanes);
  }

  private rollRouteType(floor: number, depth: number): RoomType {
    const weights: { type: RoomType; weight: number }[] = [
      { type: 'supply', weight: floor <= 3 ? 38 : 28 },
      { type: 'gem', weight: floor <= 3 ? 30 : 32 },
      { type: 'blessing', weight: floor <= 3 ? 12 : 18 },
    ];
    if (depth >= 4) weights.push({ type: 'curse', weight: 12 });
    if (depth >= 6 && (depth - this.lastShopDepth) >= 4) weights.push({ type: 'shop', weight: 10 });
    const total = weights.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const item of weights) {
      roll -= item.weight;
      if (roll <= 0) return item.type;
    }
    return weights[weights.length - 1].type;
  }

  private evaluateRouteCandidate(nodes: RouteNode[]): RouteMapCandidate {
    const scores = this.enumerateRouteScores(nodes);
    if (scores.length === 0) return { nodes, fairness: Number.POSITIVE_INFINITY, routeCount: 0 };

    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + (s - mean) * (s - mean), 0) / scores.length;
    const std = Math.sqrt(variance);
    const target = this.routeRoomsPerSegment * 12;
    const routeCountPenalty = scores.length < 12 ? (12 - scores.length) * 15 : 0;
    const typePenalty = this.routeTypeDiversityPenalty(nodes);
    const choicePenalty = this.routeChoiceSimilarityPenalty(nodes);
    const fairness = (max - min) * 5 + std * 3 + Math.abs(mean - target) * 0.7 + routeCountPenalty + typePenalty + choicePenalty;
    return { nodes, fairness, routeCount: scores.length };
  }

  private enumerateRouteScores(nodes: RouteNode[]): number[] {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const start = nodes.find((n) => n.type === 'corridor' && n.floor === 1);
    const boss = nodes.find((n) => n.type === 'boss');
    if (!start || !boss) return [];

    const scores: number[] = [];
    const visit = (node: RouteNode, score: number, guard: number): void => {
      if (scores.length > 2000 || guard > this.routeFloors + 2) return;
      const nextScore = score + this.routeNodeValue(node);
      if (node.id === boss.id) {
        scores.push(nextScore);
        return;
      }
      for (const id of node.links) {
        const next = byId.get(id);
        if (next) visit(next, nextScore, guard + 1);
      }
    };
    visit(start, 0, 0);
    return scores;
  }

  private routeNodeValue(node: RouteNode): number {
    const base: Record<RoomType, number> = {
      corridor: 0,
      supply: 10,
      gem: 15,
      blessing: 19,
      curse: 17,
      safehouse: 10,
      shop: 12,
      boss: 22,
    };
    const riskPenalty = Math.round(sanityCostFor(node.type, node.depth) * 0.35);
    const cursePenalty = node.type === 'curse' ? 2 : 0;
    return base[node.type] - riskPenalty - cursePenalty;
  }

  private routeTypeDiversityPenalty(nodes: RouteNode[]): number {
    const dynamic = nodes.filter((n) => n.type !== 'corridor' && n.type !== 'safehouse' && n.type !== 'boss');
    const counts = new Map<RoomType, number>();
    for (const node of dynamic) counts.set(node.type, (counts.get(node.type) || 0) + 1);
    const typeCount = counts.size;
    const dominant = Math.max(...Array.from(counts.values())) / Math.max(1, dynamic.length);
    return Math.max(0, dominant - 0.48) * 70 + (typeCount < 4 ? (4 - typeCount) * 10 : 0);
  }

  private routeChoiceSimilarityPenalty(nodes: RouteNode[]): number {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    let penalty = 0;

    for (const node of nodes) {
      const targets = node.links
        .map((id) => byId.get(id))
        .filter((n): n is RouteNode => !!n);
      if (targets.length <= 1) continue;

      const uniqueTypes = new Set(targets.map((t) => t.type)).size;
      if (uniqueTypes === 1) {
        penalty += 900;
      } else {
        penalty += (targets.length - uniqueTypes) * 65;
      }

      const profiles = targets.map((target) => this.routeProfileFrom(target, nodes));
      for (let i = 0; i < profiles.length; i++) {
        for (let j = i + 1; j < profiles.length; j++) {
          const distance = this.routeProfileDistance(profiles[i], profiles[j]);
          if (distance < 1.35) penalty += (1.35 - distance) * 240;
          if (distance < 0.85) penalty += 260;
        }
      }
    }

    return penalty;
  }

  private routeProfileFrom(start: RouteNode, nodes: RouteNode[]): RouteProfile {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const boss = nodes.find((n) => n.type === 'boss');
    const focusTypes: RoomType[] = ['supply', 'gem', 'blessing', 'curse', 'shop'];
    if (!boss) return { vector: new Array(16).fill(0), routeCount: 0 };

    const paths: RouteNode[][] = [];
    const visit = (node: RouteNode, path: RouteNode[], guard: number): void => {
      if (paths.length >= 600 || guard > this.routeFloors + 2) return;
      const nextPath = path.concat(node);
      if (node.id === boss.id) {
        paths.push(nextPath);
        return;
      }
      for (const id of node.links) {
        const next = byId.get(id);
        if (next) visit(next, nextPath, guard + 1);
      }
    };
    visit(start, [], 0);

    if (paths.length === 0) return { vector: new Array(16).fill(0), routeCount: 0 };

    const scores = paths.map((path) => path.reduce((sum, node) => sum + this.routeNodeValue(node), 0));
    const meanScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const meanLength = paths.reduce((sum, path) => sum + path.length, 0) / paths.length;

    const immediate = focusTypes.map((type) => start.type === type ? 2.5 : 0);
    const typeRates = focusTypes.map((type) => {
      let total = 0;
      for (const path of paths) {
        const dynamic = path.filter((node) => focusTypes.includes(node.type));
        const count = dynamic.filter((node) => node.type === type).length;
        total += count / Math.max(1, dynamic.length);
      }
      return (total / paths.length) * 4;
    });

    return {
      vector: [
        meanScore / 25,
        minScore / 25,
        maxScore / 25,
        meanLength / 10,
        ...immediate,
        ...typeRates,
        Math.min(2, paths.length / 10),
      ],
      routeCount: paths.length,
    };
  }

  private routeProfileDistance(a: RouteProfile, b: RouteProfile): number {
    const len = Math.max(a.vector.length, b.vector.length);
    let distance = 0;
    for (let i = 0; i < len; i++) {
      distance += Math.abs((a.vector[i] || 0) - (b.vector[i] || 0));
    }
    distance += Math.abs(a.routeCount - b.routeCount) * 0.04;
    return distance;
  }

  private routeRisk(type: RoomType): string {
    if (type === 'corridor') return '入口';
    if (type === 'boss') return '首领战';
    if (type === 'blessing') return '精英镇守';
    if (type === 'curse') return '代价抉择';
    if (type === 'shop' || type === 'safehouse') return '安全节点';
    if (type === 'gem') return '中等战斗';
    return '低压战斗';
  }

  private routeReward(type: RoomType): string {
    if (type === 'corridor') return '选择路径';
    if (type === 'boss') return '圣物/撤离';
    if (type === 'gem') return '高价值藏品';
    if (type === 'supply') return '补给/弹药';
    if (type === 'blessing') return '纯增益';
    if (type === 'curse') return '强增益/代价';
    if (type === 'safehouse') return '回复/检查点';
    if (type === 'shop') return '购买补强';
    return '继续深入';
  }

  private addRouteDoor(
    group: THREE.Group, theme: Theme, choice: RouteDoorChoice,
    w: number, zExit: number, length: number
  ): RouteDoorVisual {
    const door = new THREE.Group();
    const leaf = new THREE.Group();
    door.userData.routeDoor = true;
    door.userData.routeId = choice.node.id;
    door.userData.routeType = choice.node.type;
    door.userData.routeDirection = choice.direction;

    const stoneMat = new THREE.MeshStandardMaterial({
      color: theme.gap, roughness: 0.92,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd8b050, emissive: 0x3a2c08, metalness: 0.55, roughness: 0.38,
    });
    const panelMat = new THREE.MeshStandardMaterial({
      map: getRouteDoorTex(theme, choice.node.type),
      color: 0xbeb4a2,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });

    const opening = new THREE.Mesh(
      new THREE.PlaneGeometry(2.56, 3.34),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    opening.position.z = 0.018;
    door.add(opening);

    const back = new THREE.Mesh(new THREE.BoxGeometry(2.76, 3.58, 0.08), stoneMat);
    back.position.z = -0.03;
    leaf.add(back);

    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 3.18), panelMat);
    panel.position.z = 0.035;
    leaf.add(panel);

    const framePieces = [
      { sx: 0.12, sy: 3.62, x: -1.42, y: 0 },
      { sx: 0.12, sy: 3.62, x: 1.42, y: 0 },
      { sx: 2.84, sy: 0.12, x: 0, y: 1.78 },
      { sx: 2.84, sy: 0.10, x: 0, y: -1.78 },
    ];
    for (const p of framePieces) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(p.sx, p.sy, 0.12), goldMat);
      piece.position.set(p.x, p.y, 0.06);
      leaf.add(piece);
    }

    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), goldMat);
    cap.position.set(0, 1.99, 0.08);
    leaf.add(cap);
    door.add(leaf);

    const sideZ = zExit + 3.0;
    if (choice.direction === 'left') {
      door.position.set(-w / 2 + 0.24, 1.82, sideZ);
      door.rotation.y = Math.PI / 2;
    } else if (choice.direction === 'right') {
      door.position.set(w / 2 - 0.24, 1.82, sideZ);
      door.rotation.y = -Math.PI / 2;
    } else {
      door.position.set(0, 1.82, zExit + 0.24);
    }
    group.add(door);
    return {
      nodeId: choice.node.id,
      direction: choice.direction,
      root: door,
      leaf,
      progress: 0,
      opening: false,
    };
  }

  append(type: RoomType, countDepth: boolean = true, routeDoors: RouteDoorChoice[] = []): Room {
    if (countDepth) this.depthCount += 1;
    if (type === 'shop') this.lastShopDepth = this.depthCount;  // 记录商店深度（控制间隔）
    // 纵深加大（前后空间更大，左右宽度不变）
    const length = type === 'shop' ? 16 : type === 'curse' ? 16 : type === 'safehouse' ? 18 : type === 'boss' ? 34 : 24;
    const zEntry = this.nextZ;
    const zExit = zEntry - length;
    this.nextZ = zExit;

    const group = new THREE.Group();
    const theme = themeForDepth(this.depthCount);
    const tex = getStoneTex(theme);
    const wallMat = new THREE.MeshStandardMaterial({ map: tex, color: theme.wall });
    const floorMat = new THREE.MeshStandardMaterial({ map: tex, color: theme.floor });
    const w = type === 'boss' ? 15 : WIDTH;

    // 地板/天花
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, length), floorMat);
    floor.position.set(0, -0.15, zEntry - length / 2);
    floor.receiveShadow = true;
    group.add(floor);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, length),
      new THREE.MeshStandardMaterial({ map: tex, color: 0x3a3228 }));
    ceil.position.set(0, HEIGHT, zEntry - length / 2);
    group.add(ceil);

    // 侧墙
    const wallGeo = new THREE.BoxGeometry(0.4, HEIGHT, length);
    const wl = new THREE.Mesh(wallGeo, wallMat);
    wl.position.set(-w / 2, HEIGHT / 2, zEntry - length / 2);
    group.add(wl);
    const wr = new THREE.Mesh(wallGeo, wallMat);
    wr.position.set(w / 2, HEIGHT / 2, zEntry - length / 2);
    group.add(wr);

    // 端墙默认保持完整；只有路线存在时才在对应墙面叠加石门刻纹。
    const doorW = 2.2;
    const endWall = new THREE.Mesh(new THREE.BoxGeometry(w, HEIGHT, 0.4), wallMat);
    endWall.position.set(0, HEIGHT / 2, zExit);
    group.add(endWall);
    const doorPanels: THREE.Mesh[] = [];
    const routeDoorVisuals: RouteDoorVisual[] = [];
    for (const choice of routeDoors) routeDoorVisuals.push(this.addRouteDoor(group, theme, choice, w, zExit, length));

    // 火把（带光源，限2个控制性能）
    const torches: THREE.PointLight[] = [];
    const torchGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.6, 6);
    const torchMat = new THREE.MeshStandardMaterial({ color: 0x4a3520 });
    const torchSpots: number[] = [0.24, 0.72];
    for (const frac of torchSpots) {
    for (const side of [-1, 1]) {
      const tz = zEntry - length * frac;
      const torch = new THREE.Mesh(torchGeo, torchMat);
      torch.position.set(side * (w / 2 - 0.35), 2.6, tz);
      torch.rotation.z = -side * 0.3;
      group.add(torch);
      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xffaa33 })
      );
      flame.position.set(side * (w / 2 - 0.42), 2.95, tz);
      group.add(flame);
      const light = new THREE.PointLight(0xff8830, 7, 15, 1.5);
      light.position.copy(flame.position);
      group.add(light);
      torches.push(light);
    }
    }

    // 类型化布置
    const crates: THREE.Mesh[] = [];
    const pickups: THREE.Mesh[] = [];
    // 资源高亮圆环（祭坛/篝火等可点击资源）
    const addPickup = (obj: THREE.Mesh, kind: string, color: number, hx: number, hz: number): void => {
      obj.userData.pickup = kind;
      obj.userData.taken = false;
      obj.userData.active = true;   // 是否可点击（祝福需清场后才激活）
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.06, 6, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.set(hx, 0.06, hz);
      obj.userData.halo = halo;
      group.add(halo);
      pickups.push(obj);
    };

    // 战利品箱：补给房=药品/弹药，宝石房=宝藏；均需清怪后才可搜（清怪时激活高亮）
    // 安全屋可能刷新少量补给（点击篝火后揭示）
    const zMid = zEntry - length / 2;
    const crateCount = type === 'supply' || type === 'gem' ? 1 + Math.floor(Math.random() * 2)
      : type === 'safehouse' ? Math.floor(Math.random() * 2) : 0;
    const crateGeo = new THREE.BoxGeometry(1.1, 0.9, 0.85);
    for (let i = 0; i < crateCount; i++) {
      const content: InvItem = type === 'gem' ? rollGemContent(this.depthCount) : rollSupplyContent(this.depthCount);
      const rcol = new THREE.Color(content.color);
      const crate = new THREE.Mesh(crateGeo, new THREE.MeshStandardMaterial({
        color: 0x7a5a30, emissive: rcol, emissiveIntensity: 0,
      }));
      const dist = 4 + i * 3;                       // 中心前方 4 / 7 / 10…（视野内）
      const side = i % 2 === 0 ? -1 : 1;
      crate.position.set(side * (0.8 + i * 0.45), 0.45, zMid - dist);
      crate.rotation.y = Math.random() * 0.5 - 0.25;
      crate.castShadow = true;
      crate.userData.crate = true;
      crate.userData.searched = false;
      crate.userData.content = content;     // 搜满即得该物品（颜色与高亮一致）
      group.add(crate);
      // 品质高亮：地面发光圆环（清怪/点火后才显示）
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.06, 6, 24),
        new THREE.MeshBasicMaterial({ color: rcol, transparent: true, opacity: 0.85 })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.set(crate.position.x, 0.06, crate.position.z);
      halo.visible = false;
      crate.userData.halo = halo;
      group.add(halo);
      crates.push(crate);
    }

    if (type === 'curse') {
      // 黑暗祭坛 + 可点击宝珠（点击抉择）
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.7, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x3a2030 })
      );
      pillar.position.set(0, 0.8, zMid - 1);
      group.add(pillar);
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0xff6688, emissive: 0x66162e })
      );
      orb.position.set(0, 2.0, zMid - 1);
      group.add(orb);
      addPickup(orb, 'curse', 0xcc4466, 0, zMid - 1);
      const light = new THREE.PointLight(0xaa3366, 4, 10, 1.8);
      light.position.copy(orb.position);
      group.add(light);
    } else if (type === 'safehouse') {
      // 篝火 + 暖光（点击篝火休整）
      const fire = new THREE.Mesh(
        new THREE.ConeGeometry(0.3, 0.5, 6),
        new THREE.MeshBasicMaterial({ color: 0xffaa33 })
      );
      fire.position.set(0, 0.25, zMid);
      group.add(fire);
      addPickup(fire, 'safehouse', 0xffa040, 0, zMid);
      const logs = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.9, 5),
        new THREE.MeshStandardMaterial({ color: 0x5a4025 })
      );
      logs.rotation.z = Math.PI / 2;
      logs.position.set(0, 0.06, zMid);
      group.add(logs);
      const warm = new THREE.PointLight(0xffa040, 8, 14, 1.4);
      warm.position.set(0, 1.4, zMid);
      group.add(warm);
    } else if (type === 'blessing') {
      // 神圣圆台（玩家前方）；精英由 game 生成，清场后才在圆台显示可点击特效
      const pz = zMid + 1;   // 比战斗触发点更靠前 → 在玩家前方
      const ped = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.9, 0.5, 16),
        new THREE.MeshStandardMaterial({ color: 0xb8a060, emissive: 0x3a2e08 })
      );
      ped.position.set(0, 0.25, pz);
      group.add(ped);
      const gold = new THREE.PointLight(0xffd24d, 4, 16, 1.4);
      gold.position.set(0, 2.6, pz);
      group.add(gold);
      // 祝福特效：圆台上方的金色光环（区别于掉落光点的小球），清场后激活
      const fx = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.13, 10, 28),
        new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.95 })
      );
      fx.position.set(0, 1.5, pz);
      group.add(fx);
      addPickup(fx, 'blessing', 0xffd24d, 0, pz);
      fx.visible = false;                 // 清场后才显示
      (fx.userData.halo as THREE.Mesh).visible = false;
      fx.userData.active = false;         // 清场后才可点击
    } else if (type === 'shop') {
      // 商店摊位 + 暖灯
      const table = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.9, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x5a3a22 })
      );
      table.position.set(0, 0.45, zMid);
      group.add(table);
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.5, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xc8a23c, emissive: 0x3a2e08 })
      );
      sign.position.set(0, 2.4, zMid);
      group.add(sign);
      const lamp = new THREE.PointLight(0xffe0a0, 6, 14, 1.4);
      lamp.position.set(0, 2.2, zMid);
      group.add(lamp);
    } else if (type === 'boss') {
      // 王座 + 双红炬
      const throne = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 2.6, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x3a3030 })
      );
      throne.position.set(0, 1.3, zExit + 2);
      group.add(throne);
      for (const sx of [-3.5, 3.5]) {
        const brazier = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.2, 0.8, 8),
          new THREE.MeshStandardMaterial({ color: 0x444444 })
        );
        brazier.position.set(sx, 0.4, zMid);
        group.add(brazier);
        const fl = new THREE.PointLight(0xff3322, 7, 14, 1.5);
        fl.position.set(sx, 1.4, zMid);
        group.add(fl);
      }
    }
    if (type === 'supply' || type === 'gem') {
      // 残骸装饰
      const boneMat = new THREE.MeshStandardMaterial({ color: 0xd8cfb8 });
      for (let i = 0; i < 3; i++) {
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 5), boneMat);
        bone.position.set(
          (Math.random() - 0.5) * (w - 3), 0.06,
          zEntry - 2 - Math.random() * (length - 4)
        );
        bone.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);
        group.add(bone);
      }
    }

    this.scene.add(group);
    const room: Room = {
      type,
      depth: this.depthCount,
      group,
      zEntry,
      zCenter: zEntry - length / 2,
      zExit,
      length,
      crates,
      pickups,
      searched: 0,
      torches,
      cleared: false,
      doorPanels,
      doorProgress: 0,
      doorRumbled: false,
      doorW,
      routeDoors: routeDoorVisuals,
    };
    this.rooms.push(room);

    // 只保留最近4个房间
    while (this.rooms.length > 3) {
      const old = this.rooms.shift()!;
      this.scene.remove(old.group);
      old.group.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    }
    return room;
  }

  beginRouteDoorOpen(room: Room | null, nodeId: string): boolean {
    if (!room) return false;
    let found = false;
    for (const door of room.routeDoors) {
      const selected = door.nodeId === nodeId;
      door.opening = selected;
      if (selected) {
        found = true;
      } else {
        door.progress = 0;
        door.leaf.position.y = 0;
        door.leaf.rotation.z = 0;
      }
    }
    return found;
  }

  routeDoorView(room: Room | null, nodeId: string): { center: THREE.Vector3; direction: RouteDoorDirection } | null {
    if (!room) return null;
    const door = room.routeDoors.find((d) => d.nodeId === nodeId);
    if (!door) return null;
    const center = new THREE.Vector3();
    door.root.getWorldPosition(center);
    center.y += 0.35;
    return { center, direction: door.direction };
  }

  updateRouteDoorOpen(room: Room | null, nodeId: string, dt: number, duration: number): boolean {
    if (!room) return true;
    const door = room.routeDoors.find((d) => d.nodeId === nodeId);
    if (!door) return true;
    door.opening = true;
    door.progress = Math.min(1, door.progress + dt / Math.max(0.01, duration));
    const t = door.progress;
    const ease = 1 - Math.pow(1 - t, 3);
    door.leaf.position.y = ease * 3.65;
    door.leaf.rotation.z = Math.sin(ease * Math.PI) * 0.025;
    return door.progress >= 1;
  }

  // 石门开启：靠近时缓缓滑入墙内（带回调播放隆隆声）
  updateDoors(dt: number, playerZ: number, onRumble: () => void): void {
    for (const room of this.rooms) {
      if (room.doorPanels.length < 2) continue;
      if (room.doorProgress >= 1) continue;
      const dist = playerZ - room.zExit;
      if (dist < 6.5 && dist > -2) {
        if (!room.doorRumbled) {
          room.doorRumbled = true;
          onRumble();
        }
        room.doorProgress = Math.min(1, room.doorProgress + dt / 1.4);
        // 缓动：先慢后快的开门感
        const t = room.doorProgress;
        const ease = t * t * (3 - 2 * t);
        const slide = ease * (room.doorW / 2 + 0.25);
        room.doorPanels[0].position.x = -room.doorW / 4 - slide;
        room.doorPanels[1].position.x = room.doorW / 4 + slide;
      }
    }
  }

  // 火把闪烁
  flicker(time: number): void {
    for (const room of this.rooms) {
      for (let i = 0; i < room.torches.length; i++) {
        const t = room.torches[i];
        t.intensity = 5 + Math.sin(time * 9 + i * 2.7 + room.depth) * 1.2 + Math.random() * 0.6;
      }
      // 可交互战利品箱的高亮脉动（按品质着色）
      for (const c of room.crates) {
        const halo = c.userData.halo as THREE.Mesh | undefined;
        if (halo && halo.visible) {
          const pulse = 0.5 + 0.5 * Math.sin(time * 4 + c.position.x);
          (halo.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.45 * pulse;
          const mat = c.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.15 + 0.25 * pulse;
        }
      }
      // 可点击资源（祭坛/篝火/祝福特效）高亮脉动
      for (const p of room.pickups) {
        const halo = p.userData.halo as THREE.Mesh | undefined;
        if (halo && halo.visible) {
          const pulse = 0.5 + 0.5 * Math.sin(time * 3.5 + p.position.z);
          (halo.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.45 * pulse;
        }
        // 祝福特效旋转 + 上下浮动
        if (p.userData.pickup === 'blessing' && p.visible) {
          p.rotation.y += 0.03;
          p.position.y = 1.5 + Math.sin(time * 2) * 0.12;
        }
      }
    }
  }
}
