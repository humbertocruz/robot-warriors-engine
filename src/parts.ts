// Catálogo de peças. Tudo é dado puro — fácil de balancear ou mover para JSON.

export type WeaponKind =
  | "saw"
  | "flame"
  | "shock"
  | "hammer"
  | "flipper"
  | "missile"
  | "drill"
  | "spikes";

export interface Chassis {
  id: string;
  name: string;
  desc: string;
  hp: number;
  mass: number;
  maxMass: number; // limite de peso total
  slots: number; // slots de arma
  radius: number;
  cost: number;
}

export interface Drive {
  id: string;
  name: string;
  desc: string;
  speed: number;
  turn: number; // rad/s
  grip: number; // 0..1 — quão rápido a velocidade obedece ao comando
  push: number; // multiplicador de massa em colisões
  mass: number;
  cost: number;
}

export interface Armor {
  id: string;
  name: string;
  desc: string;
  reduction: number; // dano físico
  fireRes: number;
  shockRes: number;
  mass: number;
  cost: number;
  tint: number;
}

export interface Weapon {
  id: string;
  kind: WeaponKind;
  name: string;
  desc: string;
  mode: "hold" | "press" | "passive";
  damage: number; // por golpe ou por segundo (hold)
  range: number;
  arc: number; // meia-abertura em rad
  cooldown: number;
  energy: number; // por uso ou por segundo (hold)
  mass: number;
  cost: number;
}

export const CHASSIS: Chassis[] = [
  { id: "striker", name: "Striker", desc: "Equilibrado. Bom para começar.", hp: 180, mass: 30, maxMass: 85, slots: 2, radius: 30, cost: 0 },
  { id: "vespa", name: "Vespa", desc: "Leve e rápido, aguenta pouco.", hp: 130, mass: 18, maxMass: 70, slots: 2, radius: 25, cost: 600 },
  { id: "cunha", name: "Cunha", desc: "Perfil baixo: imune a flipper.", hp: 200, mass: 32, maxMass: 95, slots: 2, radius: 30, cost: 1000 },
  { id: "tita", name: "Titã", desc: "Tanque pesado com 3 slots.", hp: 280, mass: 50, maxMass: 135, slots: 3, radius: 36, cost: 1600 },
];

export const DRIVES: Drive[] = [
  { id: "wheels", name: "Rodas", desc: "Rápidas, aderência média.", speed: 250, turn: 3.6, grip: 0.8, push: 1, mass: 8, cost: 0 },
  { id: "treads", name: "Esteiras", desc: "Lentas, mas empurram muito.", speed: 195, turn: 3.0, grip: 1, push: 1.6, mass: 16, cost: 750 },
  { id: "omni", name: "Rodas Omni", desc: "Giro absurdo e velocidade alta.", speed: 290, turn: 5.2, grip: 0.7, push: 0.9, mass: 10, cost: 1200 },
];

export const ARMORS: Armor[] = [
  { id: "steel", name: "Aço", desc: "Proteção básica.", reduction: 0.1, fireRes: 0, shockRes: 0, mass: 10, cost: 0, tint: 0x8a96a3 },
  { id: "aluminio", name: "Alumínio", desc: "Leve, protege pouco.", reduction: 0.04, fireRes: 0, shockRes: 0, mass: 4, cost: 300, tint: 0xc7d0d9 },
  { id: "ceramica", name: "Cerâmica Térmica", desc: "Resiste a fogo (60%).", reduction: 0.12, fireRes: 0.6, shockRes: 0, mass: 12, cost: 900, tint: 0xd98c5f },
  { id: "isolante", name: "Blindagem Isolante", desc: "Resiste a choque (70%).", reduction: 0.12, fireRes: 0, shockRes: 0.7, mass: 12, cost: 900, tint: 0x5f8fd9 },
  { id: "titanio", name: "Titânio", desc: "A melhor proteção física.", reduction: 0.26, fireRes: 0.15, shockRes: 0.15, mass: 18, cost: 1400, tint: 0xe6e9ee },
];

export const WEAPONS: Weapon[] = [
  { id: "saw", kind: "saw", name: "Serra Circular", desc: "Segure para triturar. Dano contínuo alto.", mode: "hold", damage: 17, range: 34, arc: 0.6, cooldown: 0, energy: 14, mass: 12, cost: 0 },
  { id: "flame", kind: "flame", name: "Lança-chamas", desc: "Cone de fogo. Deixa o alvo queimando.", mode: "hold", damage: 7, range: 150, arc: 0.38, cooldown: 0, energy: 18, mass: 10, cost: 0 },
  { id: "shock", kind: "shock", name: "Bobina de Choque", desc: "Descarga em área que paralisa.", mode: "press", damage: 11, range: 95, arc: Math.PI, cooldown: 3, energy: 35, mass: 14, cost: 450 },
  { id: "spikes", kind: "spikes", name: "Espinhos de Aríete", desc: "Passivo: batidas causam dano.", mode: "passive", damage: 0.06, range: 0, arc: 0.9, cooldown: 0.35, energy: 0, mass: 8, cost: 350 },
  { id: "hammer", kind: "hammer", name: "Martelo Pneumático", desc: "Golpe pesado com recarga.", mode: "press", damage: 24, range: 70, arc: 0.55, cooldown: 1.7, energy: 20, mass: 18, cost: 750 },
  { id: "flipper", kind: "flipper", name: "Flipper Hidráulico", desc: "Arremessa o inimigo longe.", mode: "press", damage: 6, range: 46, arc: 0.7, cooldown: 2.4, energy: 25, mass: 16, cost: 900 },
  { id: "drill", kind: "drill", name: "Broca", desc: "Ignora blindagem.", mode: "hold", damage: 13, range: 40, arc: 0.4, cooldown: 0, energy: 16, mass: 14, cost: 1050 },
  { id: "missile", kind: "missile", name: "Lança-mísseis", desc: "Ataque à distância.", mode: "press", damage: 15, range: 900, arc: 0, cooldown: 2.1, energy: 24, mass: 15, cost: 1200 },
];

export const ALL_PARTS = [...CHASSIS, ...DRIVES, ...ARMORS, ...WEAPONS];
export const STARTER_PARTS = ["striker", "wheels", "steel", "saw", "flame"];

const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((p) => [p.id, p])) as Record<string, T>;
export const chassisById = byId(CHASSIS);
export const driveById = byId(DRIVES);
export const armorById = byId(ARMORS);
export const weaponById = byId(WEAPONS);

export interface RobotBuild {
  name: string;
  color: number;
  chassis: string;
  drive: string;
  armor: string;
  weapons: string[];
  /** nível de cada peça (id -> 1..MAX_LEVEL). Ausente = 1 */
  levels?: Record<string, number>;
}

// ---------- Níveis de peça ----------
export const MAX_LEVEL = 5;
export const levelOf = (b: { levels?: Record<string, number> }, id: string) => Math.max(1, Math.min(MAX_LEVEL, b.levels?.[id] ?? 1));
/**
 * Custo para subir do nível `lvl` para `lvl+1`.
 * Cresce 80% por nível: os primeiros upgrades são acessíveis, o nível máximo é meta de longo prazo.
 */
export const UPGRADE_GROWTH = 1.8;
export const upgradeCost = (part: { cost: number }, lvl: number) =>
  Math.round(((150 + part.cost * 0.4) * Math.pow(UPGRADE_GROWTH, lvl - 1)) / 10) * 10;

/** Bônus por nível, para exibir na UI */
export function levelBonusText(id: string): string {
  if (chassisById[id]) return "+12% vida por nível";
  if (driveById[id]) return "+5% velocidade e giro por nível";
  if (armorById[id]) return "+3% blindagem e +5% resistências por nível";
  const w = weaponById[id];
  if (w?.kind === "spikes") return "+15% dano de batida por nível";
  return "+12% dano e −5% recarga/energia por nível";
}

export function scaledWeapon(w: Weapon, lvl: number): Weapon {
  const up = lvl - 1;
  return {
    ...w,
    damage: w.damage * (1 + (w.kind === "spikes" ? 0.15 : 0.12) * up),
    cooldown: w.cooldown * (1 - 0.05 * up),
    energy: w.energy * (1 - 0.05 * up),
  };
}

export const ROBOT_COLORS = [0xf5b700, 0xe84a2f, 0x2fb8e8, 0x6ad15a, 0xb36ae8, 0xf2f2f2, 0xff7ab8, 0x3f4a5a];

export interface BuildStats {
  hp: number;
  totalMass: number;
  maxMass: number;
  overweight: boolean;
  speed: number;
  turn: number;
  grip: number;
  push: number;
  radius: number;
  reduction: number;
  fireRes: number;
  shockRes: number;
  flipImmune: boolean;
}

export function buildStats(b: RobotBuild): BuildStats {
  const c = chassisById[b.chassis];
  const d = driveById[b.drive];
  const a = armorById[b.armor];
  const ws = b.weapons.map((w) => weaponById[w]).filter(Boolean);
  const lc = levelOf(b, c.id) - 1, ld = levelOf(b, d.id) - 1, la = levelOf(b, a.id) - 1;
  const totalMass = c.mass + d.mass + a.mass + ws.reduce((s, w) => s + w.mass, 0);
  const load = totalMass / c.maxMass;
  const speedMult = Math.max(0.55, Math.min(1.12, 1.25 - load * 0.55));
  return {
    hp: Math.round((c.hp + a.mass * 2) * 1.35 * (1 + 0.12 * lc)),
    totalMass,
    maxMass: c.maxMass,
    overweight: totalMass > c.maxMass,
    speed: d.speed * speedMult * (1 + 0.05 * ld),
    turn: d.turn * (0.75 + 0.35 * (1 - load)) * (1 + 0.05 * ld),
    grip: d.grip,
    push: d.push,
    radius: c.radius,
    reduction: Math.min(0.5, a.reduction + 0.03 * la),
    fireRes: Math.min(0.85, a.fireRes + (a.fireRes > 0 ? 0.05 * la : 0)),
    shockRes: Math.min(0.9, a.shockRes + (a.shockRes > 0 ? 0.05 * la : 0)),
    flipImmune: c.id === "cunha",
  };
}

export function validateBuild(b: RobotBuild): string | null {
  const c = chassisById[b.chassis];
  if (!c) return "Chassi inválido";
  const filled = b.weapons.filter(Boolean);
  if (filled.length === 0) return "Equipe pelo menos uma arma";
  if (buildStats(b).overweight) return "Robô acima do peso máximo do chassi";
  return null;
}

// Campanha: oponentes em ordem de dificuldade
export interface Opponent {
  build: RobotBuild;
  difficulty: number; // 0..1
  reward: number;
  quote: string;
}

export const CAMPAIGN: Opponent[] = [
  { build: { name: "Ferrugem", color: 0x9a6b4a, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw"] }, difficulty: 0.25, reward: 150, quote: "Ainda funciono... às vezes." },
  { build: { name: "Churrasqueira", color: 0xe84a2f, chassis: "striker", drive: "wheels", armor: "ceramica", weapons: ["flame", "spikes"] }, difficulty: 0.4, reward: 200, quote: "Ao ponto ou bem passado?" },
  { build: { name: "Faísca", color: 0x2fb8e8, chassis: "vespa", drive: "omni", armor: "isolante", weapons: ["shock", "saw"] }, difficulty: 0.5, reward: 250, quote: "Zzzzt." },
  { build: { name: "Marreta", color: 0x6ad15a, chassis: "cunha", drive: "treads", armor: "steel", weapons: ["hammer", "flipper"] }, difficulty: 0.62, reward: 320, quote: "Bate que é sucesso." },
  { build: { name: "Vulcão", color: 0xff7a1a, chassis: "tita", drive: "treads", armor: "ceramica", weapons: ["flame", "missile", "shock"] }, difficulty: 0.78, reward: 420, quote: "A arena vai derreter." },
  { build: { name: "ÔMEGA", color: 0xb36ae8, chassis: "tita", drive: "omni", armor: "titanio", weapons: ["drill", "missile", "hammer"] }, difficulty: 0.95, reward: 700, quote: "Fim da linha." },
];

/** Oponentes ficam mais fortes ao longo da campanha (e em revanches). */
export function opponentWithLevels(o: Opponent, stage: number, wins = 0): RobotBuild {
  const lvl = Math.min(MAX_LEVEL, 1 + Math.floor(stage * 0.7) + wins);
  const b = o.build;
  const levels: Record<string, number> = {};
  for (const id of [b.chassis, b.drive, b.armor, ...b.weapons]) levels[id] = lvl;
  return { ...b, levels };
}

export function randomBuild(seed = Math.random()): RobotBuild {
  const pick = <T,>(arr: T[], r: number) => arr[Math.floor(r * arr.length) % arr.length];
  const rnd = mulberry(Math.floor(seed * 1e9));
  const chassis = pick(CHASSIS, rnd());
  const weapons: string[] = [];
  const pool = WEAPONS.map((w) => w.id);
  for (let i = 0; i < chassis.slots; i++) {
    const w = pick(pool, rnd());
    if (!weapons.includes(w)) weapons.push(w);
  }
  const names = ["Trator", "Picadinho", "Rebimboca", "Parafusão", "Curto-Circuito", "Bigorna", "Torradeira", "Moedor"];
  return {
    name: pick(names, rnd()),
    color: pick(ROBOT_COLORS, rnd()),
    chassis: chassis.id,
    drive: pick(DRIVES, rnd()).id,
    armor: pick(ARMORS, rnd()).id,
    weapons,
  };
}

export function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
