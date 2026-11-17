// Cérebro programável por blocos: regras "SE <condições> ENTÃO <ações>".
// Dados puros (JSON): dá para salvar, exportar e compartilhar. O interpretador é determinístico
// (sem Math.random / Date.now), então a mesma luta com os mesmos cérebros sempre dá o mesmo resultado.
import { clearance, lineOfSight, type Pt } from "./arenas";
import { angDiff, BOOST, dazeError, dist, emptyInput, isBroken, mountPoint, weaponAim, type Input, type Match, type Robot } from "./engine";
import { isSupport, REPAIR_CAP } from "./parts";

// ---------- sensores ----------
export type SensorId =
  | "dist" | "angle" | "side" | "myHp" | "foeHp" | "myEn" | "foeEn"
  | "wall" | "hazard" | "sight" | "turbo" | "burning" | "time"
  | "ready1" | "ready2" | "ready3" | "range1" | "range2" | "range3" | "behind"
  | "missile" | "foeShield" | "foeRepair" | "repairLeft" | "int1" | "int2" | "int3" | "dazed" | "myMines";

export interface SensorDef {
  id: SensorId;
  label: string;
  kind: "num" | "bool";
  unit?: string;
  min: number;
  max: number;
  step: number;
  /** valor sugerido ao criar a condição */
  def: number;
  hint: string;
  /** grupo no menu do editor */
  group: SensorGroup;
}

export type SensorGroup = "Inimigo" | "Eu" | "Armas" | "Defesas" | "Arena";
/** Ordem dos grupos no menu de sensores. */
export const SENSOR_GROUPS: readonly SensorGroup[] = ["Inimigo", "Eu", "Armas", "Defesas", "Arena"];

export const SENSORS: SensorDef[] = [
  { id: "dist", label: "Distância do inimigo", kind: "num", unit: "px", min: 0, max: 1200, step: 10, def: 150, hint: "Entre as bordas dos dois robôs.", group: "Inimigo" },
  { id: "angle", label: "Inimigo fora da frente", kind: "num", unit: "°", min: 0, max: 180, step: 5, def: 30, hint: "0° = de frente para ele; 180° = ele está atrás.", group: "Inimigo" },
  { id: "side", label: "Lado do inimigo", kind: "num", unit: "°", min: -180, max: 180, step: 5, def: 0, hint: "Positivo = à direita, negativo = à esquerda.", group: "Inimigo" },
  { id: "myHp", label: "Minha vida", kind: "num", unit: "%", min: 0, max: 100, step: 5, def: 30, hint: "Percentual da vida máxima.", group: "Eu" },
  { id: "foeHp", label: "Vida do inimigo", kind: "num", unit: "%", min: 0, max: 100, step: 5, def: 30, hint: "Percentual da vida máxima.", group: "Inimigo" },
  { id: "myEn", label: "Minha energia", kind: "num", unit: "%", min: 0, max: 100, step: 5, def: 30, hint: "Armas e turbo gastam energia.", group: "Eu" },
  { id: "foeEn", label: "Energia do inimigo", kind: "num", unit: "%", min: 0, max: 100, step: 5, def: 30, hint: "Sem energia ele não ataca nem usa turbo.", group: "Inimigo" },
  { id: "wall", label: "Distância da parede", kind: "num", unit: "px", min: 0, max: 600, step: 10, def: 80, hint: "Até a parede ou obstáculo mais próximo.", group: "Arena" },
  { id: "hazard", label: "Distância de perigo (espinho, fogo, mina)", kind: "num", unit: "px", min: 0, max: 600, step: 10, def: 100, hint: "Espinhos sempre; vents só quando avisam ou ativam; minas armadas (inclusive as suas).", group: "Arena" },
  { id: "sight", label: "Vejo o inimigo", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Há linha reta livre até ele?", group: "Inimigo" },
  { id: "turbo", label: "Turbo pronto", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Recarregado e com energia.", group: "Eu" },
  { id: "burning", label: "Estou pegando fogo", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "", group: "Eu" },
  { id: "time", label: "Tempo restante", kind: "num", unit: "s", min: 0, max: 99, step: 5, def: 20, hint: "Segundos até o fim da luta.", group: "Arena" },
  { id: "ready1", label: "Arma 1 pronta", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Fora de recarga e com energia.", group: "Armas" },
  { id: "ready2", label: "Arma 2 pronta", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Fora de recarga e com energia.", group: "Armas" },
  { id: "ready3", label: "Arma 3 pronta", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Fora de recarga e com energia.", group: "Armas" },
  { id: "range1", label: "Inimigo ao alcance da arma 1", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Na distância e na direção em que ela acerta.", group: "Armas" },
  { id: "range2", label: "Inimigo ao alcance da arma 2", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Na distância e na direção em que ela acerta.", group: "Armas" },
  { id: "range3", label: "Inimigo ao alcance da arma 3", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Na distância e na direção em que ela acerta.", group: "Armas" },
  { id: "behind", label: "Inimigo atrás de mim", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Mais de 135° fora da frente: bom para armas na traseira.", group: "Inimigo" },
  { id: "missile", label: "Míssil vindo em mim", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Um míssil do inimigo a menos de 350px, vindo na minha direção.", group: "Defesas" },
  { id: "foeShield", label: "Inimigo com escudo ligado", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "", group: "Defesas" },
  { id: "foeRepair", label: "Inimigo consertando", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Enquanto conserta ele anda devagar.", group: "Defesas" },
  { id: "repairLeft", label: "Reparo restante", kind: "num", unit: "%", min: 0, max: 100, step: 5, def: 50, hint: "Quanto do limite de conserto da luta ainda sobra (0 sem Kit de Reparo).", group: "Defesas" },
  { id: "int1", label: "Arma 1 inteira", kind: "num", unit: "%", min: 0, max: 100, step: 5, def: 40, hint: "Em 0% ela quebra até ser consertada.", group: "Armas" },
  { id: "int2", label: "Arma 2 inteira", kind: "num", unit: "%", min: 0, max: 100, step: 5, def: 40, hint: "Em 0% ela quebra até ser consertada.", group: "Armas" },
  { id: "dazed", label: "Estou desnorteado", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Levei um Pulso Desnorteador: distância, ângulo e lado do inimigo estão errados.", group: "Eu" },
  { id: "int3", label: "Arma 3 inteira", kind: "num", unit: "%", min: 0, max: 100, step: 5, def: 40, hint: "Em 0% ela quebra até ser consertada.", group: "Armas" },
  { id: "myMines", label: "Minhas minas ativas", kind: "num", min: 0, max: 3, step: 1, def: 2, hint: "Minas do Lança-minas no chão (até 3). A 4ª faz a mais antiga sumir.", group: "Armas" },
];
export const sensorById = Object.fromEntries(SENSORS.map((s) => [s.id, s])) as Record<SensorId, SensorDef>;

// ---------- ações ----------
export type ActionId = "approach" | "flee" | "circle" | "keep" | "escape" | "center" | "aim" | "aimWith" | "fire" | "boost" | "repair" | "shield" | "smoke";
export type ParamKind = "none" | "dist" | "orbit" | "weapon" | "slot";

export interface ActionDef {
  id: ActionId;
  label: string;
  kind: "move" | "attack" | "turbo" | "defense";
  param: ParamKind;
  def: number;
  hint: string;
}

export const ACTIONS: ActionDef[] = [
  { id: "approach", label: "Ir até o inimigo", kind: "move", param: "none", def: 0, hint: "Contorna paredes sozinho." },
  { id: "flee", label: "Fugir do inimigo", kind: "move", param: "none", def: 0, hint: "Vai na direção oposta." },
  { id: "circle", label: "Circular em volta", kind: "move", param: "orbit", def: 1, hint: "Orbita o inimigo, sempre de lado." },
  { id: "keep", label: "Manter distância de", kind: "move", param: "dist", def: 300, hint: "Aproxima se estiver longe, recua se estiver perto." },
  { id: "escape", label: "Sair do perigo", kind: "move", param: "none", def: 0, hint: "Afasta do espinho ou vent mais próximo." },
  { id: "center", label: "Ir para o centro", kind: "move", param: "none", def: 0, hint: "Centro da arena." },
  { id: "aim", label: "Parar e mirar", kind: "move", param: "none", def: 0, hint: "Fica parado, só gira para o inimigo." },
  { id: "aimWith", label: "Mirar com", kind: "move", param: "slot", def: 1, hint: "Fica parado e gira até o lado dessa arma apontar para o inimigo." },
  { id: "fire", label: "Atacar com", kind: "attack", param: "weapon", def: 0, hint: "Aciona a arma enquanto a regra valer." },
  { id: "boost", label: "Usar turbo", kind: "turbo", param: "none", def: 0, hint: "Arrancada na direção em que está indo." },
  { id: "repair", label: "Consertar", kind: "defense", param: "none", def: 0, hint: "Usa o Kit de Reparo enquanto a regra valer. Anda devagar." },
  { id: "shield", label: "Ligar escudo", kind: "defense", param: "none", def: 0, hint: "Liga o escudo enquanto a regra valer. Anda mais devagar." },
  { id: "smoke", label: "Soltar fumaça", kind: "defense", param: "none", def: 0, hint: "Solta a nuvem de fumaça (se tiver e estiver pronta)." },
];
export const actionById = Object.fromEntries(ACTIONS.map((a) => [a.id, a])) as Record<ActionId, ActionDef>;

// ---------- programa ----------
export type Op = "<" | ">" | "=";
export interface Cond { s: SensorId; op: Op; v: number }
export interface Act { a: ActionId; v: number }
export interface Rule { id: string; on: boolean; conds: Cond[]; acts: Act[] }
export interface Program { id: string; name: string; rules: Rule[] }

export const MAX_RULES = 16;
export const MAX_CONDS = 4;
export const MAX_ACTS = 4;

let seq = 0;
export const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export const newCond = (s: SensorId = "dist"): Cond => {
  const d = sensorById[s];
  return { s, op: d.kind === "bool" ? "=" : "<", v: d.def };
};
export const newAct = (a: ActionId = "approach"): Act => ({ a, v: actionById[a].def });
export const newRule = (conds: Cond[] = [], acts: Act[] = [newAct()]): Rule => ({ id: newId(), on: true, conds, acts });

export function condText(c: Cond): string {
  const d = sensorById[c.s];
  if (d.kind === "bool") return `${d.label}: ${c.v ? "sim" : "não"}`;
  return `${d.label} ${c.op} ${c.v}${d.unit ?? ""}`;
}

// ---------- modelos prontos ----------
const mk = (name: string, rules: [Cond[], Act[]][]): Program => ({
  id: newId(), name, rules: rules.map(([c, a]) => newRule(c, a)),
});
const C = (s: SensorId, op: Op, v: number): Cond => ({ s, op, v });
const A = (a: ActionId, v = actionById[a].def): Act => ({ a, v });

/** As 3 regras do guia do primeiro cérebro, na ordem em que o jogador as adiciona.
 *  Juntas vencem o Tonto (o robô do jogador com a IA 0,15) na maioria das arenas: ver tests/editor-cerebro.test.ts. */
export function guideRules(): Rule[] {
  return [
    { id: newId(), on: true, conds: [{ s: "hazard", op: "<", v: 90 }], acts: [{ a: "escape", v: 0 }] },
    { id: newId(), on: true, conds: [{ s: "range1", op: "=", v: 1 }], acts: [{ a: "fire", v: 0 }] },
    { id: newId(), on: true, conds: [], acts: [{ a: "approach", v: 0 }] },
  ];
}
/** Dificuldade da IA do Tonto, o adversário do fim do guia. */
export const GUIDE_FOE_DIFFICULTY = 0.15;

export const TEMPLATES: { name: string; desc: string; make: () => Program }[] = [
  {
    name: "Lutador",
    desc: "Parte para cima e ataca com tudo, sem recuar.",
    make: () => mk("Lutador", [
      [[C("hazard", "<", 90)], [A("escape")]],
      [[C("range1", "=", 1)], [A("fire", 1)]],
      [[C("range2", "=", 1)], [A("fire", 2)]],
      [[C("range3", "=", 1)], [A("fire", 3)]],
      [[C("dist", ">", 350), C("turbo", "=", 1)], [A("approach"), A("boost")]],
      [[], [A("approach")]],
    ]),
  },
  {
    name: "Atirador",
    desc: "Fica longe e dispara. Se o inimigo encosta, para e briga; se ele não vem, vai atrás.",
    make: () => mk("Atirador", [
      [[C("hazard", "<", 90)], [A("escape")]],
      [[C("range1", "=", 1)], [A("fire", 1)]],
      [[C("range2", "=", 1)], [A("fire", 2)]],
      [[C("range3", "=", 1)], [A("fire", 3)]],
      [[C("dist", "<", 150)], [A("aim")]],
      [[C("time", "<", 60)], [A("approach")]],
      [[], [A("keep", 320)]],
    ]),
  },
  {
    name: "Toureiro",
    desc: "Rodeia o inimigo a meia distância e investe de turbo quando dá.",
    make: () => mk("Toureiro", [
      [[C("hazard", "<", 90)], [A("escape")]],
      [[C("range1", "=", 1)], [A("fire", 1)]],
      [[C("range2", "=", 1)], [A("fire", 2)]],
      [[C("range3", "=", 1)], [A("fire", 3)]],
      [[C("dist", "<", 90)], [A("approach")]],
      [[C("dist", "<", 260), C("turbo", "=", 1), C("angle", "<", 20)], [A("approach"), A("boost")]],
      [[C("dist", "<", 260), C("angle", "<", 60)], [A("circle", 1)]],
      [[], [A("approach")]],
    ]),
  },
  {
    name: "Guardião",
    desc: "Liga o escudo quando o inimigo encosta e se conserta quando está longe e machucado.",
    make: () => mk("Guardião", [
      [[C("hazard", "<", 90)], [A("escape")]],
      [[C("myHp", "<", 55), C("repairLeft", ">", 5), C("dist", ">", 110)], [A("repair"), A("flee")]],
      [[C("int1", "<", 30), C("repairLeft", ">", 5), C("dist", ">", 110)], [A("repair"), A("flee")]],
      [[C("myHp", "<", 45), C("repairLeft", ">", 5), C("turbo", "=", 1)], [A("flee"), A("boost")]],
      [[C("dist", "<", 120), C("angle", "<", 60)], [A("shield")]],
      [[C("range1", "=", 1)], [A("fire", 1)]],
      [[], [A("approach")]],
    ]),
  },
  {
    name: "Traseiro",
    desc: "Chega de frente e, colado, gira para usar a arma de trás.",
    make: () => mk("Traseiro", [
      [[C("hazard", "<", 90)], [A("escape")]],
      [[C("range1", "=", 1)], [A("fire", 1)]],
      [[C("range2", "=", 1)], [A("fire", 2)]],
      [[C("range3", "=", 1)], [A("fire", 3)]],
      [[C("dist", "<", 100)], [A("aimWith", 2)]],
      [[], [A("approach")]],
    ]),
  },
];

// ---------- leitura de sensores ----------
export type Sensors = Record<SensorId, number>;

interface Ctx {
  m: Match; me: Robot; foe: Robot;
  toFoe: number; dist: number;
  hazard: { d: number; x: number; y: number } | null;
}

function nearestHazard(m: Match, me: Robot): { d: number; x: number; y: number } | null {
  let best: { d: number; x: number; y: number } | null = null;
  const rad = me.stats.radius;
  const consider = (x: number, y: number, r: number) => {
    const d = Math.hypot(me.x - x, me.y - y) - r - rad;
    if (!best || d < best.d) best = { d, x, y };
  };
  for (const z of m.arena.spikes) consider(z.x, z.y, z.r);
  for (const mi of m.mines) if (mi.armed) consider(mi.x, mi.y, 12);
  m.arena.vents.forEach((v, i) => {
    const st = m.vent(i);
    if (st.warn || st.active) consider(v.x, v.y, v.r);
  });
  return best;
}

/** A arma `i` acerta o inimigo (na posição em que eu acho que ele está) daqui? Mesma conta do motor, medida do ponto da arma. */
function weaponInRange(me: Robot, foe: Robot, i: number, toFoe: number, d: number): boolean {
  const ws = me.weapons[i];
  if (!ws || isBroken(ws)) return false;
  const w = ws.def;
  const fx = me.x + Math.cos(toFoe) * d, fy = me.y + Math.sin(toFoe) * d; // onde eu acho que ele está
  const mp = mountPoint(me, i);
  const dmc = Math.hypot(fx - mp.x, fy - mp.y);
  const dm = dmc - foe.stats.radius;
  const facing = Math.abs(angDiff(Math.atan2(fy - mp.y, fx - mp.x), weaponAim(me, i)));
  const tol = Math.atan2(foe.stats.radius, Math.max(dmc, 1)) * 0.8;
  switch (w.kind) {
    case "saw": case "drill": return dm < w.range + 8 && facing < w.arc + tol + 0.15;
    case "flame": return dm < w.range - 4 && facing < w.arc + tol;
    case "shock": return d - foe.stats.radius - me.stats.radius < w.range - 10;
    case "hammer": case "flipper": case "disruptor": return dm < w.range * 0.95 && facing < w.arc + tol;
    case "missile": return facing < 0.25 && d > 120;
    case "mines": {
      // o inimigo está perto de onde a mina vai cair
      const reach = w.power ?? 70, aim = weaponAim(me, i);
      return Math.hypot(fx - (mp.x + Math.cos(aim) * reach), fy - (mp.y + Math.sin(aim) * reach)) < 110 + foe.stats.radius;
    }
    default: return false; // passivas (espinhos) e defesas não têm gatilho de alcance
  }
}

export function readSensors(m: Match, me: Robot, foe: Robot): { s: Sensors; ctx: Ctx } {
  // desnorteado: acha que o inimigo está em outro lugar (e age em cima disso)
  const err = dazeError(m, me);
  const toFoe = Math.atan2(foe.y - me.y, foe.x - me.x) + err.angle;
  const d = dist(me, foe) * err.dist;
  const hz = nearestHazard(m, me);
  const rel = angDiff(toFoe, me.angle);
  const ready = (i: number) => {
    const ws = me.weapons[i];
    if (!ws || ws.def.mode === "passive" || isBroken(ws)) return 0;
    return ws.cd <= 0 && me.energy >= Math.min(ws.def.energy, 10) ? 1 : 0;
  };
  const s: Sensors = {
    dist: Math.max(0, d - me.stats.radius - foe.stats.radius),
    angle: Math.abs(rel) * (180 / Math.PI),
    side: rel * (180 / Math.PI),
    myHp: (me.hp / me.stats.hp) * 100,
    foeHp: (foe.hp / foe.stats.hp) * 100,
    myEn: me.energy,
    foeEn: foe.energy,
    wall: Math.max(0, clearance(m.arena, m.walls, me) - me.stats.radius),
    hazard: hz ? Math.max(0, hz.d) : 999,
    sight: m.sees(me, foe) ? 1 : 0,
    turbo: me.boostCd <= 0 && me.energy >= BOOST.energy ? 1 : 0,
    burning: me.burn > 0 ? 1 : 0,
    time: m.time,
    ready1: ready(0), ready2: ready(1), ready3: ready(2),
    range1: weaponInRange(me, foe, 0, toFoe, d) ? 1 : 0,
    range2: weaponInRange(me, foe, 1, toFoe, d) ? 1 : 0,
    range3: weaponInRange(me, foe, 2, toFoe, d) ? 1 : 0,
    behind: Math.abs(rel) > (Math.PI * 3) / 4 ? 1 : 0,
    missile: m.missiles.some((mi) => {
      if (mi.owner === me.id) return false;
      const dx = me.x - mi.x, dy = me.y - mi.y;
      return Math.hypot(dx, dy) < 350 && Math.abs(angDiff(Math.atan2(dy, dx), Math.atan2(mi.vy, mi.vx))) < 0.5;
    }) ? 1 : 0,
    foeShield: foe.weapons.some((w) => w.def.kind === "shield" && w.active) ? 1 : 0,
    foeRepair: foe.weapons.some((w) => w.def.kind === "repair" && w.active) ? 1 : 0,
    repairLeft: me.weapons.some((w) => w.def.kind === "repair") ? (me.repairLeft / (me.stats.hp * REPAIR_CAP)) * 100 : 0,
    int1: me.weapons[0]?.integrity ?? 0,
    int2: me.weapons[1]?.integrity ?? 0,
    int3: me.weapons[2]?.integrity ?? 0,
    dazed: me.dazed > 0 ? 1 : 0,
    myMines: m.mines.reduce((n, mi) => n + (mi.owner === me.id ? 1 : 0), 0),
  };
  return { s, ctx: { m, me, foe, toFoe, dist: d, hazard: hz } };
}

export function testCond(c: Cond, s: Sensors): boolean {
  const v = s[c.s];
  if (c.op === "<") return v < c.v;
  if (c.op === ">") return v > c.v;
  return sensorById[c.s].kind === "bool" ? (v >= 0.5) === (c.v >= 0.5) : Math.abs(v - c.v) < 0.5;
}

// ---------- interpretador ----------
export class ProgramBrain {
  /** regras que valeram no último passo (para destacar na tela) */
  active: boolean[] = [];
  /** ação de movimento escolhida no último passo */
  moving: ActionId | null = null;
  private prevFire = [false, false, false];
  private prevBoost = false;
  private wp: Pt | null = null;
  private wpT = 0;
  private side = 0;
  private sideT = 0;

  constructor(public program: Program) {
    this.active = program.rules.map(() => false);
  }

  think(m: Match, me: Robot, foe: Robot, dt: number): Input {
    const inp = emptyInput();
    this.active = this.program.rules.map(() => false);
    this.moving = null;
    if (me.dead || foe.dead) return inp;

    const { s, ctx } = readSensors(m, me, foe);
    let move: Act | null = null;
    const fire = [false, false, false];
    let boost = false;

    this.program.rules.forEach((rule, i) => {
      if (!rule.on || !rule.conds.every((c) => testCond(c, s))) return;
      this.active[i] = true;
      for (const act of rule.acts) {
        const def = actionById[act.a];
        if (def.kind === "move") { if (!move) move = act; }
        else if (def.kind === "turbo") boost = true;
        else if (def.kind === "defense") me.weapons.forEach((w, k) => { if (w.def.kind === act.a) fire[k] = true; });
        else if (act.v === 0) me.weapons.forEach((w, k) => { if (!isSupport(w.def.kind)) fire[k] = true; });
        else if (act.v >= 1 && act.v <= 3) fire[act.v - 1] = true;
      }
    });

    if (move) {
      this.moving = (move as Act).a;
      this.drive(inp, move as Act, ctx, dt);
    }

    // armas: "press" precisa de borda de subida, então alterna (igual à IA padrão)
    me.weapons.forEach((ws, i) => {
      const want = fire[i] && ws.def.mode !== "passive";
      if (ws.def.mode === "press") {
        inp.fire[i] = want && !this.prevFire[i];
        this.prevFire[i] = inp.fire[i];
      } else {
        inp.fire[i] = want;
      }
    });
    inp.boost = boost && !this.prevBoost;
    this.prevBoost = inp.boost;
    return inp;
  }

  private drive(inp: Input, act: Act, c: Ctx, dt: number) {
    const { me, toFoe, dist: d } = c;
    let heading: number | null = null;
    let mag = 1;
    switch (act.a) {
      case "approach": heading = this.pathTo(c, toFoe); break;
      case "flee": heading = toFoe + Math.PI; break;
      case "circle": {
        const side = act.v < 0 ? -1 : 1;
        heading = toFoe + side * (d < 260 ? 1.45 : 1.0);
        break;
      }
      case "keep": {
        const want = act.v + me.stats.radius + c.foe.stats.radius;
        if (d > want + 30) heading = this.pathTo(c, toFoe);
        else if (d < want - 30) heading = toFoe + Math.PI;
        else { this.aimOnly(inp, me, toFoe); return; }
        break;
      }
      case "escape": {
        if (c.hazard) heading = Math.atan2(me.y - c.hazard.y, me.x - c.hazard.x);
        else heading = this.toCenter(c);
        break;
      }
      case "center": {
        const p = this.center(c);
        if (Math.hypot(p.x - me.x, p.y - me.y) < 60) { this.aimOnly(inp, me, toFoe); return; }
        heading = Math.atan2(p.y - me.y, p.x - me.x);
        break;
      }
      case "aim": this.aimOnly(inp, me, toFoe); return;
      case "aimWith": {
        // gira para o lado da arma ficar de frente para o inimigo
        const ws = me.weapons[Math.max(1, Math.min(3, Math.round(act.v))) - 1];
        this.aimOnly(inp, me, toFoe - (ws?.mountAngle ?? 0));
        return;
      }
    }
    if (heading === null) return;
    heading = this.steer(c, heading, dt);
    inp.heading = heading;
    inp.headingMag = mag;
  }

  /** Parado: sem andar, só gira (modo tanque) para encarar o inimigo. */
  private aimOnly(inp: Input, me: Robot, toFoe: number) {
    const diff = angDiff(toFoe, me.angle);
    inp.throttle = 0;
    inp.turn = Math.max(-1, Math.min(1, diff * 3));
  }

  private center(c: Ctx): Pt {
    const [a, b] = c.m.arena.spawns;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  private toCenter(c: Ctx): number {
    const p = this.center(c);
    return Math.atan2(p.y - c.me.y, p.x - c.me.x);
  }

  /** Sem linha reta até o inimigo, segue pelos pontos de passagem da arena. */
  private pathTo(c: Ctx, direct: number): number {
    const { m, me, foe } = c;
    const wps = m.arena.waypoints;
    if (!wps.length || lineOfSight(m.walls, me, foe)) { this.wp = null; return direct; }
    this.wpT -= 1 / 60;
    if (this.wp && this.wpT > 0 && Math.hypot(this.wp.x - me.x, this.wp.y - me.y) > 50) return Math.atan2(this.wp.y - me.y, this.wp.x - me.x);
    let best: Pt | null = null, bestScore = Infinity;
    for (const w of wps) {
      if (Math.hypot(w.x - me.x, w.y - me.y) < 50) continue;
      if (!lineOfSight(m.walls, me, w)) continue;
      const score = Math.hypot(w.x - me.x, w.y - me.y) + Math.hypot(foe.x - w.x, foe.y - w.y) + (lineOfSight(m.walls, w, foe) ? 0 : 600);
      if (score < bestScore) { bestScore = score; best = w; }
    }
    this.wp = best;
    this.wpT = 0.6;
    return best ? Math.atan2(best.y - me.y, best.x - me.x) : direct;
  }

  /** Contorna paredes e obstáculos (físico, não é estratégia): testa à frente e escolhe um lado fixo por um tempo. */
  private steer(c: Ctx, heading: number, dt: number): number {
    const { m, me, toFoe, dist: foeDist } = c;
    const need = me.stats.radius + 6;
    // indo na direção do inimigo, só olha até ele: a parede atrás dele não é obstáculo
    const towardFoe = Math.abs(angDiff(heading, toFoe)) < 0.5;
    const reach = towardFoe ? Math.min(110, foeDist - 20) : 110;
    if (reach < 30 && towardFoe) return heading;
    const probes = reach < 55 ? [reach] : [55, reach];
    const free = (a: number) => probes.every((r) => clearance(m.arena, m.walls, { x: me.x + Math.cos(a) * r, y: me.y + Math.sin(a) * r }) > need);
    this.sideT -= dt;
    if (free(heading) && this.sideT <= 0) return heading;
    if (this.sideT <= 0) {
      // lado determinístico: o que estiver mais livre
      const L = clearance(m.arena, m.walls, { x: me.x + Math.cos(heading - 1) * 80, y: me.y + Math.sin(heading - 1) * 80 });
      const R = clearance(m.arena, m.walls, { x: me.x + Math.cos(heading + 1) * 80, y: me.y + Math.sin(heading + 1) * 80 });
      this.side = R >= L ? 1 : -1;
      this.sideT = 0.7;
    }
    for (const k of [0.45, 0.9, 1.35, 1.8, 2.3, 2.8]) {
      if (free(heading + this.side * k)) return heading + this.side * k;
    }
    this.side = -this.side;
    return heading + this.side * 1.35;
  }
}

// ---------- validação / importação ----------
export function sanitizeProgram(raw: unknown): Program | null {
  try {
    const p = raw as Program;
    if (!p || typeof p !== "object" || !Array.isArray(p.rules)) return null;
    const rules: Rule[] = p.rules.slice(0, MAX_RULES).map((r) => ({
      id: typeof r.id === "string" ? r.id : newId(),
      on: r.on !== false,
      conds: (Array.isArray(r.conds) ? r.conds : []).filter((c) => c && sensorById[c.s]).slice(0, MAX_CONDS)
        .map((c) => ({ s: c.s, op: (["<", ">", "="] as Op[]).includes(c.op) ? c.op : "<", v: Number.isFinite(+c.v) ? +c.v : sensorById[c.s].def })),
      acts: (Array.isArray(r.acts) ? r.acts : []).filter((a) => a && actionById[a.a]).slice(0, MAX_ACTS)
        .map((a) => ({ a: a.a, v: Number.isFinite(+a.v) ? +a.v : actionById[a.a].def })),
    }));
    return { id: typeof p.id === "string" ? p.id : newId(), name: String(p.name ?? "Cérebro").slice(0, 28) || "Cérebro", rules };
  } catch {
    return null;
  }
}

export const PROGRAM_PREFIX = "RWB1-"; // formato antigo (JSON completo), ainda aceito na importação
export const PROGRAM_PREFIX2 = "RWB2-"; // formato compacto, usado nos links
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

/** Compacto para caber bem num link: [nome, [[ligada, [[sensor, op, valor]…], [[ação, valor]…]]…]] */
export function exportProgram(p: Program): string {
  const rules = p.rules.map((r) => [r.on ? 1 : 0, r.conds.map((c) => [c.s, c.op, c.v]), r.acts.map((a) => [a.a, a.v])]);
  return PROGRAM_PREFIX2 + b64(JSON.stringify([p.name, rules]));
}

export function importProgram(code: string): Program | null {
  try {
    const t = code.trim();
    if (t.startsWith(PROGRAM_PREFIX2)) {
      const [name, rules] = JSON.parse(unb64(t.slice(PROGRAM_PREFIX2.length)));
      return sanitizeProgram({
        id: newId(), name,
        rules: (rules as [number, [string, string, number][], [string, number][]][]).map(([on, conds, acts]) => ({
          on: on !== 0,
          conds: conds.map(([s, op, v]) => ({ s, op, v })),
          acts: acts.map(([a, v]) => ({ a, v })),
        })),
      });
    }
    if (t.startsWith(PROGRAM_PREFIX)) return sanitizeProgram({ ...JSON.parse(unb64(t.slice(PROGRAM_PREFIX.length))), id: newId() });
    return null;
  } catch {
    return null;
  }
}

// ---------- link de compartilhamento ----------
const HASH_KEY = "cerebro=";
/** Endereço público do jogo: o link compartilhado sempre aponta para ele (previews da Vercel exigem login). */
export const PUBLIC_URL = "https://www.robotwarriors.app/";

/** Link que abre o jogo já com este cérebro. Vai no fragmento (#), que não é enviado a servidor nenhum. */
export function shareLink(p: Program, base = PUBLIC_URL): string {
  return `${base.split("#")[0]}#${HASH_KEY}${exportProgram(p)}`;
}

/** Lê um cérebro do fragmento da URL (ou null se não houver / for inválido). */
export function programFromHash(hash: string): Program | null {
  const h = hash.replace(/^#/, "");
  if (!h.startsWith(HASH_KEY)) return null;
  try { return importProgram(decodeURIComponent(h.slice(HASH_KEY.length))); } catch { return null; }
}

export const hasProgramHash = (hash: string) => hash.replace(/^#/, "").startsWith(HASH_KEY);

const sameRules = (a: Program, b: Program) =>
  JSON.stringify(a.rules.map(({ on, conds, acts }) => [on, conds, acts])) === JSON.stringify(b.rules.map(({ on, conds, acts }) => [on, conds, acts]));

/** Guarda o cérebro recebido como novo e o deixa ativo. Se já tiver um idêntico, só o ativa. */
export function addImported(store: ProgramStore, p: Program): { store: ProgramStore; existed: boolean } {
  const twin = store.programs.find((x) => x.name === p.name && sameRules(x, p));
  if (twin) return { store: { ...store, active: twin.id }, existed: true };
  return { store: { programs: [...store.programs, p], active: p.id }, existed: false };
}

// ---------- guardar no navegador (separado do save principal) ----------
const KEY = "robot-warriors-programs-v1";
export interface ProgramStore { programs: Program[]; active: string }

export function loadPrograms(): ProgramStore {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    const programs = (Array.isArray(raw?.programs) ? raw.programs : []).map(sanitizeProgram).filter(Boolean) as Program[];
    if (programs.length) return { programs, active: programs.some((p) => p.id === raw.active) ? raw.active : programs[0].id };
  } catch { /* usa o modelo */ }
  const first = TEMPLATES[0].make();
  return { programs: [first], active: first.id };
}
export function savePrograms(s: ProgramStore) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem storage: vale só nesta sessão */ }
}
