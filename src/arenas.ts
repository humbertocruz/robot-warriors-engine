// Arenas: borda em polígono qualquer + obstáculos + armadilhas. Tudo em coordenadas de mundo.

export interface Pt { x: number; y: number }
export interface Zone { x: number; y: number; r: number }
export interface Vent extends Zone { offset: number }

export interface ArenaDef {
  id: string;
  name: string;
  desc: string;
  w: number;
  h: number;
  boundary: Pt[]; // área jogável
  obstacles: Pt[][]; // blocos sólidos dentro da arena
  spikes: Zone[];
  vents: Vent[];
  spawns: [Pt, Pt];
  /** pontos de passagem para a IA contornar paredes quando não vê o adversário */
  waypoints: Pt[];
  floor: [number, number]; // duas cores das placas
}

// ---------- construtores de forma ----------
const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];
const regular = (cx: number, cy: number, r: number, n: number, rot = 0): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
const polar = (cx: number, cy: number, d: number, a: number) => ({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d });

// ---------- arenas ----------
const W = 24; // espessura visual da parede

const classica: ArenaDef = {
  id: "classica", name: "Clássica", desc: "Retângulo com espinhos nos cantos e fogo no centro.",
  w: 1100, h: 720,
  boundary: rect(W, W, 1100 - 2 * W, 720 - 2 * W),
  obstacles: [],
  spikes: [{ x: W, y: W, r: 95 }, { x: 1100 - W, y: W, r: 95 }, { x: W, y: 720 - W, r: 95 }, { x: 1100 - W, y: 720 - W, r: 95 }],
  vents: [{ x: 550, y: 360, r: 75, offset: 0 }],
  spawns: [{ x: 275, y: 360 }, { x: 825, y: 360 }],
  waypoints: [],
  floor: [0x262b33, 0x2a2f38],
};

const octogono: ArenaDef = (() => {
  const c = 760, r = 740;
  const spikes = [1, 3, 5, 7].map((k) => ({ ...polar(c, c, r * Math.cos(Math.PI / 8), (k * Math.PI) / 4), r: 95 }));
  return {
    id: "octogono", name: "Octógono", desc: "Oito lados, espinhos nas diagonais e dois vents.",
    w: c * 2, h: c * 2,
    boundary: regular(c, c, r, 8, Math.PI / 8),
    obstacles: [],
    spikes,
    vents: [{ x: c - 300, y: c, r: 70, offset: 0 }, { x: c + 300, y: c, r: 70, offset: 4.5 }],
    spawns: [{ x: c - 480, y: c }, { x: c + 480, y: c }],
    waypoints: [],
    floor: [0x272b31, 0x2c3037],
  };
})();

const coliseu: ArenaDef = (() => {
  const c = 860, r = 830;
  return {
    id: "coliseu", name: "Coliseu", desc: "Arena redonda com pilar central para se esconder.",
    w: c * 2, h: c * 2,
    boundary: regular(c, c, r, 44),
    obstacles: [regular(c, c, 150, 18)],
    spikes: Array.from({ length: 6 }, (_, k) => ({ ...polar(c, c, r - 10, Math.PI / 6 + (k * Math.PI) / 3), r: 80 })),
    vents: [{ x: c, y: c - 450, r: 75, offset: 0 }, { x: c, y: c + 450, r: 75, offset: 4.5 }],
    spawns: [{ x: c - 520, y: c }, { x: c + 520, y: c }],
    waypoints: [{ x: c - 420, y: c }, { x: c + 420, y: c }, ...[1, 3, 5, 7].map((k) => polar(c, c, 420, (k * Math.PI) / 4))],
    floor: [0x2d2a26, 0x322e29],
  };
})();

const cruz: ArenaDef = (() => {
  const c = 960, a = 330, L = 940;
  return {
    id: "cruz", name: "Cruz", desc: "Quatro corredores e um centro em chamas.",
    w: c * 2, h: c * 2,
    boundary: [
      { x: c - a, y: c - L }, { x: c + a, y: c - L }, { x: c + a, y: c - a }, { x: c + L, y: c - a },
      { x: c + L, y: c + a }, { x: c + a, y: c + a }, { x: c + a, y: c + L }, { x: c - a, y: c + L },
      { x: c - a, y: c + a }, { x: c - L, y: c + a }, { x: c - L, y: c - a }, { x: c - a, y: c - a },
    ],
    obstacles: [],
    spikes: [{ x: c, y: c - L, r: 110 }, { x: c + L, y: c, r: 110 }, { x: c, y: c + L, r: 110 }, { x: c - L, y: c, r: 110 }],
    vents: [{ x: c, y: c, r: 95, offset: 0 }],
    spawns: [{ x: c - 640, y: c }, { x: c + 640, y: c }],
    waypoints: [{ x: c - 200, y: c - 200 }, { x: c + 200, y: c - 200 }, { x: c + 200, y: c + 200 }, { x: c - 200, y: c + 200 }],
    floor: [0x24292f, 0x292e35],
  };
})();

const fabrica: ArenaDef = {
  id: "fabrica", name: "Fábrica", desc: "Galpão enorme cheio de caixotes para emboscar.",
  w: 2300, h: 1500,
  boundary: rect(W, W, 2300 - 2 * W, 1500 - 2 * W),
  obstacles: [
    rect(480, 260, 240, 170), rect(1560, 230, 260, 150), rect(1000, 640, 300, 220),
    rect(380, 1060, 190, 230), rect(1640, 1020, 250, 210), rect(1080, 1210, 150, 130),
  ],
  spikes: [{ x: W, y: 750, r: 100 }, { x: 2300 - W, y: 750, r: 100 }, { x: 1150, y: W, r: 100 }, { x: 1150, y: 1500 - W, r: 100 }],
  vents: [{ x: 720, y: 750, r: 75, offset: 0 }, { x: 1580, y: 720, r: 75, offset: 3 }, { x: 1150, y: 300, r: 65, offset: 6 }],
  spawns: [{ x: 200, y: 750 }, { x: 2100, y: 750 }],
  waypoints: [
    { x: 850, y: 560 }, { x: 1450, y: 560 }, { x: 850, y: 950 }, { x: 1450, y: 950 }, { x: 1150, y: 480 },
    { x: 350, y: 620 }, { x: 1950, y: 620 }, { x: 800, y: 1350 }, { x: 1450, y: 1350 }, { x: 1150, y: 1050 },
  ],
  floor: [0x23272b, 0x272b30],
};

const corredor: ArenaDef = {
  id: "corredor", name: "Corredor em L", desc: "Um L comprido: quem domina a curva domina a luta.",
  w: 2000, h: 1600,
  boundary: [
    { x: W, y: W }, { x: 900, y: W }, { x: 900, y: 1000 }, { x: 2000 - W, y: 1000 },
    { x: 2000 - W, y: 1600 - W }, { x: W, y: 1600 - W },
  ],
  obstacles: [rect(1280, 1220, 160, 160)],
  spikes: [{ x: W, y: W, r: 100 }, { x: 900, y: W, r: 100 }, { x: 2000 - W, y: 1000, r: 100 }, { x: 2000 - W, y: 1600 - W, r: 100 }],
  vents: [{ x: 462, y: 600, r: 75, offset: 0 }, { x: 462, y: 1290, r: 85, offset: 3 }, { x: 1750, y: 1290, r: 70, offset: 6 }],
  spawns: [{ x: 462, y: 250 }, { x: 1800, y: 1290 }],
  waypoints: [{ x: 650, y: 1250 }, { x: 300, y: 1300 }, { x: 700, y: 760 }, { x: 1100, y: 1150 }],
  floor: [0x262a2f, 0x2b2f35],
};

export const ARENAS: ArenaDef[] = [classica, octogono, coliseu, cruz, fabrica, corredor];
export const arenaById = Object.fromEntries(ARENAS.map((a) => [a.id, a])) as Record<string, ArenaDef>;
/** arena de cada luta da campanha, em ordem */
export const CAMPAIGN_ARENAS = ["classica", "octogono", "coliseu", "cruz", "fabrica", "corredor"];

// ---------- geometria ----------
export function closestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

export function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Todos os segmentos de parede (borda + obstáculos). */
export function wallSegments(a: ArenaDef): [Pt, Pt][] {
  const segs: [Pt, Pt][] = [];
  for (const poly of [a.boundary, ...a.obstacles]) {
    for (let i = 0; i < poly.length; i++) segs.push([poly[i], poly[(i + 1) % poly.length]]);
  }
  return segs;
}

/** Ponto está em área livre (dentro da borda, fora dos obstáculos)? */
export function isOpen(a: ArenaDef, p: Pt): boolean {
  return pointInPoly(p, a.boundary) && !a.obstacles.some((o) => pointInPoly(p, o));
}

/** Distância livre até a parede mais próxima (negativa se fora da área livre). */
export function clearance(a: ArenaDef, segs: [Pt, Pt][], p: Pt): number {
  let d = Infinity;
  for (const [s, e] of segs) {
    const c = closestOnSegment(p, s, e);
    d = Math.min(d, Math.hypot(p.x - c.x, p.y - c.y));
  }
  return isOpen(a, p) ? d : -d;
}

function segIntersect(p: Pt, q: Pt, a: Pt, b: Pt): boolean {
  const d = (q.x - p.x) * (b.y - a.y) - (q.y - p.y) * (b.x - a.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((a.x - p.x) * (b.y - a.y) - (a.y - p.y) * (b.x - a.x)) / d;
  const u = ((a.x - p.x) * (q.y - p.y) - (a.y - p.y) * (q.x - p.x)) / d;
  return t > 0 && t < 1 && u >= 0 && u <= 1;
}

/** Existe linha reta livre entre p e q? */
export function lineOfSight(segs: [Pt, Pt][], p: Pt, q: Pt): boolean {
  for (const [a, b] of segs) if (segIntersect(p, q, a, b)) return false;
  return true;
}

/** Estado do vent no tempo t: ciclo de 9s, avisa 1.5s antes, fica ativo 2s. */
export function ventState(v: Vent, t: number) {
  const c = (t + v.offset) % 9;
  return { warn: c > 5.5 && c < 7, active: c >= 7 };
}
