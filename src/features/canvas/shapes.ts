// Study Split shape pack (decided 2026-11-22: built-in pack, option 2).
// Pure data: each shape is a list of Excalidraw "element skeletons" (the format convertToExcalidrawElements
// accepts), drawn around (0,0) in the hand-drawn style with the Study Split palette. Inserting is done by
// insertShape() in excalidraw.ts, which converts, centres on the current slide and groups the parts.

export interface Skeleton {
  type: 'rectangle' | 'ellipse' | 'diamond' | 'text' | 'arrow' | 'line';
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  points?: [number, number][];
  label?: { text: string; fontSize?: number; fontFamily?: number; strokeColor?: string };
  start?: { id: string };
  end?: { id: string };
  [style: string]: unknown;
}

export type ShapeCategory = 'system' | 'data';
export interface ShapeDef { key: string; name: string; category: ShapeCategory; build: () => Skeleton[] }

const C = {
  ink: '#1e1e1e', teal: '#0e7c6b', mint: '#e3f3ef', amber: '#e9a23b', sand: '#fbefd9', blue: '#2557d6', sky: '#e0e9ff',
  purple: '#7c3aed', lilac: '#ede4ff', grey: '#6b6760', paper: '#eeece7', red: '#c2410c', peach: '#fde4dc', green: '#15803d', leaf: '#dcfce7'
};
const STYLE = { roughness: 1, strokeWidth: 2, fillStyle: 'solid' } as const;
const FONT = 5;   // Excalifont (hand-drawn)

// ---------------------------------------------------------------- building blocks
function box(id: string, x: number, y: number, width: number, height: number, text: string | null, stroke: string, fill: string, extra: Partial<Skeleton> = {}): Skeleton {
  return {
    type: 'rectangle', id, x, y, width, height, strokeColor: stroke, backgroundColor: fill, roundness: { type: 3 }, ...STYLE,
    ...(text ? { label: { text, fontSize: 20, fontFamily: FONT, strokeColor: C.ink } } : {}), ...extra
  };
}
function oval(id: string, x: number, y: number, width: number, height: number, text: string | null, stroke: string, fill: string): Skeleton {
  return {
    type: 'ellipse', id, x, y, width, height, strokeColor: stroke, backgroundColor: fill, ...STYLE,
    ...(text ? { label: { text, fontSize: 20, fontFamily: FONT, strokeColor: C.ink } } : {})
  };
}
function label(x: number, y: number, text: string, size = 20, color = C.ink): Skeleton {
  return { type: 'text', x, y, text, fontSize: size, fontFamily: FONT, strokeColor: color };
}
function arrow(x: number, y: number, dx: number, dy: number, from?: string, to?: string, color = C.ink, head: 'arrow' | null = 'arrow'): Skeleton {
  return {
    type: 'arrow', x, y, points: [[0, 0], [dx, dy]], strokeColor: color, ...STYLE, endArrowhead: head,
    ...(from ? { start: { id: from } } : {}), ...(to ? { end: { id: to } } : {})
  };
}
function line(x: number, y: number, points: [number, number][], color: string, extra: Partial<Skeleton> = {}): Skeleton {
  return { type: 'line', x, y, points, strokeColor: color, ...STYLE, ...extra };
}

/** Half-ellipse as a smooth polyline (cylinder bottoms, bucket rims). */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps = 10): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / steps;
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)] as [number, number];
  });
}

/** An edge between two circular nodes that starts and ends on their rims (not their centres). */
function edge(a: [string, number, number], b: [string, number, number], d: number, head: 'arrow' | null): Skeleton {
  const r = d / 2;
  const [ida, ax, ay] = a;
  const [idb, bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const sx = ax + r + ux * (r + 4), sy = ay + r + uy * (r + 4);
  const ex = bx + r - ux * (r + 4), ey = by + r - uy * (r + 4);
  return arrow(sx, sy, ex - sx, ey - sy, ida, idb, C.ink, head);
}

/** A row of labelled cells (array, queue). */
function cells(prefix: string, values: string[], x: number, y: number, w: number, h: number, stroke: string, fill: string): Skeleton[] {
  return values.map((v, i) => box(`${prefix}${i}`, x + i * w, y, w, h, v, stroke, fill, { roundness: null }));
}

// ---------------------------------------------------------------- system design
const database = (): Skeleton[] => {
  const w = 170, h = 180, ry = 22;
  // Body outline: down the left side, along the bottom curve (left → right), up the right side, closed.
  const bottom = arc(w / 2, h - ry, w / 2, ry, Math.PI, 0);
  return [
    line(0, 0, [[0, ry], [0, h - ry], ...bottom, [w, ry], [0, ry]], C.blue, { backgroundColor: C.sky }),
    oval('top', 0, 0, w, ry * 2, null, C.blue, C.sky),
    label(w / 2 - 44, h / 2, 'Database')
  ];
};

const user = (): Skeleton[] => [
  oval('head', 30, 0, 44, 44, null, C.ink, C.paper),
  line(52, 44, [[0, 0], [0, 60]], C.ink),
  line(18, 64, [[0, 0], [68, 0]], C.ink),
  line(22, 140, [[0, 0], [30, -36], [60, 0]], C.ink),
  label(30, 150, 'User')
];

const server = (): Skeleton[] => [
  ...[0, 1, 2].flatMap(i => [
    box(`rack${i}`, 0, i * 42, 210, 36, null, C.teal, C.mint, { roundness: { type: 3 } }),
    oval(`led${i}`, 180, i * 42 + 12, 12, 12, null, C.green, C.leaf),
    line(16, i * 42 + 18, [[0, 0], [90, 0]], C.teal, { strokeWidth: 1 })
  ]),
  label(70, 134, 'Server')
];

const loadBalancer = (): Skeleton[] => [
  box('lb', 0, 40, 200, 80, 'Load balancer', C.purple, C.lilac),
  arrow(204, 60, 90, -50, 'lb'), arrow(204, 80, 90, 0, 'lb'), arrow(204, 100, 90, 50, 'lb')
];

const queue = (): Skeleton[] => [
  label(70, 0, 'Message queue'),
  box('q', 0, 36, 300, 70, null, C.teal, C.mint, { roundness: { type: 3 } }),
  ...[1, 2, 3, 4].map(i => line(i * 60, 46, [[0, 0], [0, 50]], C.teal)),
  arrow(-90, 71, 84, 0, undefined, 'q'),
  arrow(306, 71, 84, 0, 'q')
];

const objectStorage = (): Skeleton[] => {
  // Bucket: tapered sides, curved bottom (left → right), closed; the rim ellipse sits on top.
  return [
    line(0, 0, [[0, 20], [22, 170], ...arc(100, 170, 78, 16, Math.PI, 0), [200, 20], [0, 20]], C.amber, { backgroundColor: C.sand }),
    oval('rim', 0, 0, 200, 40, null, C.amber, C.sand),
    label(40, 90, 'Object storage', 20)
  ];
};

const SYSTEM: ShapeDef[] = [
  { key: 'client', name: 'Client', category: 'system', build: () => [box('c', 0, 0, 180, 90, 'Client', C.blue, C.sky)] },
  { key: 'user', name: 'User', category: 'system', build: user },
  { key: 'service', name: 'Service', category: 'system', build: () => [box('s', 0, 0, 200, 90, 'Service', C.teal, C.mint)] },
  { key: 'server', name: 'Server', category: 'system', build: server },
  { key: 'load-balancer', name: 'Load balancer', category: 'system', build: loadBalancer },
  { key: 'api-gateway', name: 'API gateway', category: 'system', build: () => [box('g', 0, 0, 150, 220, 'API\ngateway', C.teal, C.paper)] },
  { key: 'database', name: 'Database', category: 'system', build: database },
  { key: 'cache', name: 'Cache', category: 'system', build: () => [box('k', 0, 0, 180, 90, 'Cache', C.amber, C.sand)] },
  { key: 'message-queue', name: 'Message queue', category: 'system', build: queue },
  { key: 'object-storage', name: 'Object storage', category: 'system', build: objectStorage },
  { key: 'cdn', name: 'CDN', category: 'system', build: () => [oval('cdn', 0, 0, 230, 120, 'CDN', C.blue, C.sky)] }
];

// ---------------------------------------------------------------- data structures
const array = (): Skeleton[] => {
  const vals = ['5', '2', '9', '1', '7'];
  return [...cells('a', vals, 0, 0, 64, 64, C.teal, C.mint), ...vals.map((_, i) => label(i * 64 + 26, 72, String(i), 16, C.grey))];
};

const stack = (): Skeleton[] => {
  const vals = ['4', '7', '1', '3'];
  return [
    ...vals.map((v, i) => box(`st${i}`, 0, i * 50, 150, 50, v, C.purple, C.lilac, { roundness: null })),
    label(-112, 12, 'top', 18, C.grey),
    arrow(-64, 25, 58, 0, undefined, 'st0', C.grey)
  ];
};

const dsQueue = (): Skeleton[] => {
  const vals = ['3', '8', '2', '6'];
  const w = 64;
  return [
    ...cells('dq', vals, 0, 0, w, 64, C.teal, C.mint),
    arrow(w / 2, 120, 0, -50, undefined, 'dq0', C.grey), label(w / 2 - 22, 124, 'front', 16, C.grey),
    arrow(w * 3.5, 120, 0, -50, undefined, 'dq3', C.grey), label(w * 3.5 - 16, 124, 'rear', 16, C.grey)
  ];
};

const linkedList = (): Skeleton[] => {
  const vals = ['1', '4', '9'];
  return [
    ...vals.flatMap((v, i) => [
      box(`n${i}`, i * 150, 0, 90, 56, v, C.blue, C.sky),
      ...(i < vals.length - 1 ? [arrow(i * 150 + 94, 28, 52, 0, `n${i}`, `n${i + 1}`)] : [])
    ]),
    arrow(2 * 150 + 94, 28, 52, 0, 'n2'),
    label(2 * 150 + 154, 16, 'null', 18, C.grey)
  ];
};

const hashMap = (): Skeleton[] => {
  const rows: [string, string][] = [['"apple"', '3'], ['"pear"', '7'], ['"fig"', '1']];
  return [
    box('hk', 0, 0, 140, 44, 'key', C.grey, C.paper, { roundness: null }),
    box('hv', 140, 0, 100, 44, 'value', C.grey, C.paper, { roundness: null }),
    ...rows.flatMap(([k, v], i) => [
      box(`k${i}`, 0, 44 + i * 50, 140, 50, k, C.amber, C.sand, { roundness: null }),
      box(`v${i}`, 140, 44 + i * 50, 100, 50, v, C.amber, '#ffffff', { roundness: null })
    ])
  ];
};

const binaryTree = (): Skeleton[] => {
  const d = 60;   // node diameter
  const nodes: [string, string, number, number][] = [
    ['t0', '8', 270, 0],
    ['t1', '3', 130, 110], ['t2', '10', 410, 110],
    ['t3', '1', 60, 220], ['t4', '6', 200, 220], ['t5', '9', 340, 220], ['t6', '14', 480, 220]
  ];
  const edges: [number, number][] = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]];
  return [
    ...nodes.map(([id, v, x, y]) => oval(id, x, y, d, d, v, C.teal, C.mint)),
    ...edges.map(([p, c]) => edge([nodes[p]![0], nodes[p]![2], nodes[p]![3]], [nodes[c]![0], nodes[c]![2], nodes[c]![3]], d, null))
  ];
};

const graph = (): Skeleton[] => {
  const d = 64;
  const nodes: [string, string, number, number][] = [['gA', 'A', 0, 100], ['gB', 'B', 180, 0], ['gC', 'C', 180, 200], ['gD', 'D', 360, 100], ['gE', 'E', 530, 100]];
  const edges: [number, number][] = [[0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [3, 4]];
  return [
    ...nodes.map(([id, v, x, y]) => oval(id, x, y, d, d, v, C.purple, C.lilac)),
    ...edges.map(([a, b]) => edge([nodes[a]![0], nodes[a]![2], nodes[a]![3]], [nodes[b]![0], nodes[b]![2], nodes[b]![3]], d, null))
  ];
};

const DATA: ShapeDef[] = [
  { key: 'array', name: 'Array', category: 'data', build: array },
  { key: 'stack', name: 'Stack', category: 'data', build: stack },
  { key: 'queue', name: 'Queue', category: 'data', build: dsQueue },
  { key: 'linked-list', name: 'Linked list', category: 'data', build: linkedList },
  { key: 'hash-map', name: 'Hash map', category: 'data', build: hashMap },
  { key: 'binary-tree', name: 'Binary tree', category: 'data', build: binaryTree },
  { key: 'graph', name: 'Graph', category: 'data', build: graph }
];

export const SHAPES: ShapeDef[] = [...SYSTEM, ...DATA];

/** Rough bounds of a skeleton list (used by tests and for centring checks). */
export function skeletonBounds(items: Skeleton[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of items) {
    if (s.points) for (const [px, py] of s.points) { xs.push(s.x + px); ys.push(s.y + py); }
    else { xs.push(s.x, s.x + (s.width ?? (s.text ? s.text.length * 10 : 0))); ys.push(s.y, s.y + (s.height ?? 24)); }
  }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
