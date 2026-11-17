// Catálogo de peças. Tudo é dado puro — fácil de balancear ou mover para JSON.

export type WeaponKind =
  | "saw"
  | "flame"
  | "shock"
  | "hammer"
  | "flipper"
  | "missile"
  | "drill"
  | "spikes"
  // defesa e suporte
  | "repair"
  | "shield"
  | "antimissile"
  | "disruptor"
  | "smoke"
  | "grounding"
  | "mines";

/** Peças de defesa/suporte: não entram em "atacar com todas as armas". */
export const SUPPORT_KINDS: ReadonlySet<WeaponKind> = new Set<WeaponKind>(["repair", "shield", "antimissile", "smoke", "grounding"]);
export const isSupport = (kind: string) => SUPPORT_KINDS.has(kind as WeaponKind);

/** Integridade das armas: quanto de dano uma arma aguenta antes de quebrar. */
export const WEAPON_HP = 60;
/** Parte do dano físico/perfurante recebido que também vai para a arma do lado do golpe. */
export const WEAPON_SHARE = 0.4;
/** O Kit de Reparo conserta no máximo esta fração da vida máxima por luta. */
export const REPAIR_CAP = 0.35;

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
  /** efeito das peças de suporte: reparo = vida/s, escudo = fração bloqueada, antimíssil = chance de derrubar */
  power?: number;
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
  // range = raio da explosão; power = distância do arremesso (docs/specs/lanca-minas.md)
  { id: "mines", kind: "mines", name: "Lança-minas", desc: "Solta minas que armam em 0,8 s e explodem em quem passar por cima, inclusive você. Até 3 no chão.", mode: "press", damage: 28, power: 70, range: 75, arc: 0, cooldown: 2.5, energy: 25, mass: 13, cost: 1150 },
  // defesa e suporte (ocupam slot como as armas)
  { id: "repair", kind: "repair", name: "Kit de Reparo", desc: "Segure para consertar a vida e a arma mais danificada. Anda devagar enquanto conserta; até 35% da vida por luta.", mode: "hold", damage: 0, power: 14, range: 0, arc: 0, cooldown: 0, energy: 22, mass: 12, cost: 800 },
  { id: "shield", kind: "shield", name: "Escudo", desc: "Segure para bloquear 75% do dano físico vindo do lado dele. Deixa o robô mais lento.", mode: "hold", damage: 0, power: 0.75, range: 0, arc: 0.61, cooldown: 0, energy: 15, mass: 16, cost: 950 },
  { id: "disruptor", kind: "disruptor", name: "Pulso Desnorteador", desc: "Descarga curta à frente que embaralha os sensores do alvo: ele erra para onde vai. Em você, inverte esquerda e direita.", mode: "press", damage: 4, power: 1.6, range: 110, arc: 0.6, cooldown: 6, energy: 35, mass: 11, cost: 1100 },
  { id: "smoke", kind: "smoke", name: "Fumaça", desc: "Solta uma nuvem que corta a linha de visão por 3 s: mísseis perdem o alvo e a IA para de ver.", mode: "press", damage: 0, power: 3, range: 120, arc: 0, cooldown: 8, energy: 25, mass: 8, cost: 650 },
  { id: "grounding", kind: "grounding", name: "Aterramento", desc: "Passivo: reduz 60% da paralisia do choque e do tempo desnorteado.", mode: "passive", damage: 0, power: 0.6, range: 0, arc: 0, cooldown: 0, energy: 0, mass: 6, cost: 500 },
  { id: "antimissile", kind: "antimissile", name: "Antimíssil", desc: "Passivo: atira sozinho nos mísseis que chegam perto.", mode: "passive", damage: 0, power: 0.6, range: 160, arc: 0, cooldown: 1.5, energy: 10, mass: 9, cost: 700 },
];

export const ALL_PARTS = [...CHASSIS, ...DRIVES, ...ARMORS, ...WEAPONS];
export const STARTER_PARTS = ["striker", "wheels", "steel", "saw", "flame"];

const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((p) => [p.id, p])) as Record<string, T>;
export const chassisById = byId(CHASSIS);
export const driveById = byId(DRIVES);
export const armorById = byId(ARMORS);
export const weaponById = byId(WEAPONS);

/** Lado do robô onde a arma fica. */
export type Mount = "front" | "left" | "right" | "back";
/** Ângulo de cada lado, relativo à frente do robô (y para baixo: esquerda = −90°). */
export const MOUNTS: readonly { id: Mount; label: string; short: string; angle: number }[] = [
  { id: "front", label: "Frente", short: "↑", angle: 0 },
  { id: "left", label: "Esquerda", short: "←", angle: -Math.PI / 2 },
  { id: "right", label: "Direita", short: "→", angle: Math.PI / 2 },
  { id: "back", label: "Trás", short: "↓", angle: Math.PI },
];
export const mountAngle = (m: Mount | undefined) => MOUNTS.find((x) => x.id === m)?.angle ?? 0;
export const isMount = (v: unknown): v is Mount => MOUNTS.some((m) => m.id === v);

export interface RobotBuild {
  name: string;
  color: number;
  chassis: string;
  drive: string;
  armor: string;
  weapons: string[];
  /** lado de cada slot, alinhado com `weapons`. Ausente = frente (saves antigos) */
  mounts?: Mount[];
  /** nível de cada peça (id -> 1..MAX_LEVEL). Ausente = 1 */
  levels?: Record<string, number>;
}

/** Armas equipadas (sem os slots vazios), com o lado de cada uma. É a ordem de "Arma 1, 2, 3" na luta. */
export function equippedWeapons(b: RobotBuild): { id: string; mount: Mount }[] {
  return b.weapons
    .map((id, i) => ({ id, mount: isMount(b.mounts?.[i]) ? b.mounts![i] : ("front" as Mount) }))
    .filter((w) => w.id && weaponById[w.id]);
}

export interface SlotPlace {
  /** ângulo do lado, relativo à frente do robô */
  angle: number;
  /** posição no referencial do lado (como se a arma estivesse na frente): usada para desenhar */
  fx: number; fy: number;
  /** posição no referencial do robô (frente = +x) */
  lx: number; ly: number;
}

/**
 * Onde cada arma fica no robô. Armas do mesmo lado se espalham ao longo dele.
 * Com todas na frente, dá exatamente as posições de antes (saves e ranking não mudam).
 */
export function slotLayout(list: { kind: string; mount: Mount }[], R: number): SlotPlace[] {
  return list.map((w, i) => {
    const group = list.map((x, k) => (x.mount === w.mount ? k : -1)).filter((k) => k >= 0);
    const j = group.indexOf(i), n = group.length;
    const ext = w.mount === "left" || w.mount === "right" ? 0.75 : 0.92;
    let fx: number, fy: number;
    if (w.kind === "shock") { fx = -R * 0.15; fy = n === 1 ? 0 : (j - (n - 1) / 2) * R * 0.5; }
    else if (w.kind === "spikes" || w.kind === "flipper") { fx = R * ext; fy = 0; }
    else { fx = R * ext; fy = n === 1 ? 0 : (j - (n - 1) / 2) * (R * 1.25) / Math.max(1, n - 1); }
    const angle = mountAngle(w.mount);
    const c = Math.cos(angle), s = Math.sin(angle);
    // frente: sem rotação, para não introduzir diferença de ponto flutuante
    const lx = angle === 0 ? fx : fx * c - fy * s;
    const ly = angle === 0 ? fy : fx * s + fy * c;
    return { angle, fx, fy, lx, ly };
  });
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
  if (w?.kind === "repair") return "+12% conserto por segundo e −5% energia por nível";
  if (w?.kind === "shield") return "+3% bloqueio e −5% energia por nível";
  if (w?.kind === "antimissile") return "+5% chance de derrubar e −5% recarga por nível";
  if (w?.kind === "disruptor") return "+8% tempo desnorteado e −5% recarga/energia por nível";
  if (w?.kind === "smoke") return "+8% duração da nuvem e −5% recarga por nível";
  if (w?.kind === "grounding") return "+5% de proteção por nível";
  return "+12% dano e −5% recarga/energia por nível";
}

export function scaledWeapon(w: Weapon, lvl: number): Weapon {
  const up = lvl - 1;
  return {
    ...w,
    damage: w.damage * (1 + (w.kind === "spikes" ? 0.15 : 0.12) * up),
    cooldown: w.cooldown * (1 - 0.05 * up),
    energy: w.energy * (1 - 0.05 * up),
    power: w.power === undefined ? undefined
      : w.kind === "repair" ? w.power * (1 + 0.12 * up)
      : w.kind === "shield" ? Math.min(0.9, w.power + 0.03 * up)
      : w.kind === "antimissile" ? Math.min(0.9, w.power + 0.05 * up)
      : w.kind === "disruptor" || w.kind === "smoke" ? w.power * (1 + 0.08 * up)
      : w.kind === "grounding" ? Math.min(0.85, w.power + 0.05 * up)
      : w.power,
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
  if (!filled.some((id) => weaponById[id] && !isSupport(weaponById[id].kind))) return "Equipe pelo menos uma arma de ataque";
  if (b.mounts && b.mounts.some((m) => m !== undefined && !isMount(m))) return "Posição de arma inválida";
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
  { build: { name: "Vulcão", color: 0xff7a1a, chassis: "tita", drive: "treads", armor: "ceramica", weapons: ["flame", "shock", "antimissile"] }, difficulty: 0.78, reward: 420, quote: "A arena vai derreter." },
  { build: { name: "ÔMEGA", color: 0xb36ae8, chassis: "tita", drive: "omni", armor: "titanio", weapons: ["drill", "missile", "shield"], mounts: ["front", "front", "back"] }, difficulty: 0.95, reward: 700, quote: "Fim da linha." },
];

/** Oponentes ficam mais fortes ao longo da campanha (e em revanches). */
export function opponentWithLevels(o: Opponent, stage: number, wins = 0): RobotBuild {
  const lvl = Math.min(MAX_LEVEL, 1 + Math.floor(stage * 0.7) + wins);
  const b = o.build;
  const levels: Record<string, number> = {};
  for (const id of [b.chassis, b.drive, b.armor, ...b.weapons]) levels[id] = lvl;
  return { ...b, levels };
}

/** Robô sorteado (Arena livre). `allowed`: só usa estas peças (ex.: as liberadas na Carreira). Sempre dentro do peso. */
export function randomBuild(seed = Math.random(), allowed?: ReadonlySet<string>): RobotBuild {
  const pick = <T,>(arr: T[], r: number) => arr[Math.floor(r * arr.length) % arr.length];
  const ok = (id: string) => !allowed || allowed.has(id);
  const rnd = mulberry(Math.floor(seed * 1e9));
  const names = ["Trator", "Picadinho", "Rebimboca", "Parafusão", "Curto-Circuito", "Bigorna", "Torradeira", "Moedor"];
  const name = pick(names, rnd());
  const color = pick(ROBOT_COLORS, rnd());
  const attack = WEAPONS.filter((w) => !isSupport(w.kind) && ok(w.id)).map((w) => w.id);
  const pool = WEAPONS.filter((w) => ok(w.id)).map((w) => w.id);
  for (let attempt = 0; attempt < 30; attempt++) {
    const chassis = pick(CHASSIS.filter((c) => ok(c.id)), rnd());
    const weapons: string[] = [];
    for (let i = 0; i < chassis.slots; i++) {
      // a primeira é sempre de ataque: robô só com defesa não luta
      const w = pick(i === 0 ? attack : pool, rnd());
      if (!weapons.includes(w)) weapons.push(w);
    }
    const b: RobotBuild = { name, color, chassis: chassis.id, drive: pick(DRIVES.filter((d) => ok(d.id)), rnd()).id, armor: pick(ARMORS.filter((a) => ok(a.id)), rnd()).id, weapons };
    // pesado demais: tira armas do fim (a de ataque fica) antes de sortear outro robô
    while (buildStats(b).overweight && b.weapons.length > 1) b.weapons = b.weapons.slice(0, -1);
    if (!validateBuild(b)) return b;
  }
  return { name, color, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw"] };
}

/** Nível médio das peças equipadas (1 a MAX_LEVEL). */
export function avgLevel(b: RobotBuild): number {
  const ids = [b.chassis, b.drive, b.armor, ...b.weapons.filter(Boolean)];
  return ids.reduce((s, id) => s + levelOf(b, id), 0) / ids.length;
}

/** Peças no nível médio `avg`: cada uma arredonda para cima ou para baixo por sorteio. */
export function withAvgLevel(b: RobotBuild, avg: number, rnd: () => number): RobotBuild {
  const a = Math.max(1, Math.min(MAX_LEVEL, avg));
  const base = Math.floor(a), frac = a - base;
  const levels: Record<string, number> = {};
  for (const id of [b.chassis, b.drive, b.armor, ...b.weapons.filter(Boolean)]) levels[id] = Math.min(MAX_LEVEL, base + (rnd() < frac ? 1 : 0));
  return { ...b, levels };
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
