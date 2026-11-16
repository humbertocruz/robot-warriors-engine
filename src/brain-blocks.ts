// Cérebro programável por blocos: regras "SE <condições> ENTÃO <ações>".
// Dados puros (JSON): dá para salvar, exportar e compartilhar. O interpretador é determinístico
// (sem Math.random / Date.now), então a mesma luta com os mesmos cérebros sempre dá o mesmo resultado.
import { clearance, lineOfSight, type Pt } from "./arenas";
import { angDiff, BOOST, dist, emptyInput, type Input, type Match, type Robot } from "./engine";

// ---------- sensores ----------
export type SensorId =
  | "dist" | "angle" | "side" | "myHp" | "foeHp" | "myEn" | "foeEn"
  | "wall" | "hazard" | "sight" | "turbo" | "burning" | "time"
  | "ready1" | "ready2" | "ready3" | "range1" | "range2" | "range3";

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
}

export const SENSORS: SensorDef[] = [
  { id: "dist", label: "Distância do inimigo", kind: "num", unit: "px", min: 0, max: 1200, step: 10, def: 150, hint: "Entre as bordas dos dois robôs." },
  { id: "angle", label: "Inimigo fora da frente", kind: "num", unit: "°", min: 0, max: 180, step: 5, def: 30, hint: "0° = de frente para ele; 180° = ele está atrás." },
  { id: "side", label: "Lado do inimigo", kind: "num", unit: "°", min: -180, max: 180, step: 5, def: 0, hint: "Positivo = à direita, negativo = à esquerda." },
  { id: "myHp", label: "Minha vida", kind: "num", unit: "%", min: 0, max: 100, step: 5, def: 30, hint: "Percentual da vida máxima." },
  { id: "foeHp", label: "Vida do inimigo", kind: "num", unit: "%", min: 0, max: 100, step: 5, def: 30, hint: "Percentual da vida máxima." },
  { id: "myEn", label: "Minha energia", kind: "num", unit: "%", min: 0, max: 100, step: 5, def: 30, hint: "Armas e turbo gastam energia." },
  { id: "foeEn", label: "Energia do inimigo", kind: "num", unit: "%", min: 0, max: 100, step: 5, def: 30, hint: "Sem energia ele não ataca nem usa turbo." },
  { id: "wall", label: "Distância da parede", kind: "num", unit: "px", min: 0, max: 600, step: 10, def: 80, hint: "Até a parede ou obstáculo mais próximo." },
  { id: "hazard", label: "Distância de espinho/fogo", kind: "num", unit: "px", min: 0, max: 600, step: 10, def: 100, hint: "Espinhos sempre; vents só quando avisam ou ativam." },
  { id: "sight", label: "Vejo o inimigo", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Há linha reta livre até ele?" },
  { id: "turbo", label: "Turbo pronto", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Recarregado e com energia." },
  { id: "burning", label: "Estou pegando fogo", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "" },
  { id: "time", label: "Tempo restante", kind: "num", unit: "s", min: 0, max: 99, step: 5, def: 20, hint: "Segundos até o fim da luta." },
  { id: "ready1", label: "Arma 1 pronta", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Fora de recarga e com energia." },
  { id: "ready2", label: "Arma 2 pronta", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Fora de recarga e com energia." },
  { id: "ready3", label: "Arma 3 pronta", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Fora de recarga e com energia." },
  { id: "range1", label: "Inimigo ao alcance da arma 1", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Na distância e na direção em que ela acerta." },
  { id: "range2", label: "Inimigo ao alcance da arma 2", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Na distância e na direção em que ela acerta." },
  { id: "range3", label: "Inimigo ao alcance da arma 3", kind: "bool", min: 0, max: 1, step: 1, def: 1, hint: "Na distância e na direção em que ela acerta." },
];
export const sensorById = Object.fromEntries(SENSORS.map((s) => [s.id, s])) as Record<SensorId, SensorDef>;

// ---------- ações ----------
export type ActionId = "approach" | "flee" | "circle" | "keep" | "escape" | "center" | "aim" | "fire" | "boost";
export type ParamKind = "none" | "dist" | "orbit" | "weapon";

export interface ActionDef {
  id: ActionId;
  label: string;
  kind: "move" | "attack" | "turbo";
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
  { id: "fire", label: "Atacar com", kind: "attack", param: "weapon", def: 0, hint: "Aciona a arma enquanto a regra valer." },
  { id: "boost", label: "Usar turbo", kind: "turbo", param: "none", def: 0, hint: "Arrancada na direção em que está indo." },
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

export const TEMPLATES: { name: string; desc: string; make: () => Program }[] = [
  {
    name: "Lutador",
    desc: "Parte para cima e ataca com tudo. Foge só quando está quase morto.",
    make: () => mk("Lutador", [
      [[C("hazard", "<", 90)], [A("escape")]],
      [[C("myHp", "<", 25), C("dist", "<", 200)], [A("flee"), A("boost")]],
      [[C("range1", "=", 1)], [A("fire", 1)]],
      [[C("range2", "=", 1)], [A("fire", 2)]],
      [[C("range3", "=", 1)], [A("fire", 3)]],
      [[C("dist", ">", 350), C("turbo", "=", 1)], [A("approach"), A("boost")]],
      [[], [A("approach")]],
    ]),
  },
  {
    name: "Atirador",
    desc: "Mantém distância e dispara de longe; foge quando o inimigo chega perto.",
    make: () => mk("Atirador", [
      [[C("hazard", "<", 90)], [A("escape")]],
      [[C("dist", "<", 140), C("turbo", "=", 1)], [A("flee"), A("boost")]],
      [[C("angle", "<", 15)], [A("fire", 0)]],
      [[C("dist", "<", 180)], [A("keep", 320)]],
      [[], [A("keep", 320)]],
    ]),
  },
  {
    name: "Toureiro",
    desc: "Orbita o inimigo, ataca de lado e usa o turbo para escapar de encostos.",
    make: () => mk("Toureiro", [
      [[C("hazard", "<", 90)], [A("escape")]],
      [[C("dist", "<", 90), C("turbo", "=", 1)], [A("flee"), A("boost")]],
      [[C("range1", "=", 1)], [A("fire", 1)]],
      [[C("range2", "=", 1)], [A("fire", 2)]],
      [[C("range3", "=", 1)], [A("fire", 3)]],
      [[C("dist", "<", 260)], [A("circle", 1)]],
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
  m.arena.vents.forEach((v, i) => {
    const st = m.vent(i);
    if (st.warn || st.active) consider(v.x, v.y, v.r);
  });
  return best;
}

function weaponInRange(me: Robot, foe: Robot, i: number, toFoe: number): boolean {
  const ws = me.weapons[i];
  if (!ws) return false;
  const w = ws.def;
  const edge = dist(me, foe) - foe.stats.radius - me.stats.radius;
  const facing = Math.abs(angDiff(toFoe, me.angle));
  switch (w.kind) {
    case "saw": case "drill": return edge < w.range - 6 && facing < 0.8;
    case "flame": return edge < w.range - 20 && facing < 0.5;
    case "shock": return edge < w.range - 10;
    case "hammer": case "flipper": return edge < w.range - 6 && facing < 0.5;
    case "missile": return facing < 0.25 && dist(me, foe) > 120;
    default: return false; // passivas (espinhos) não têm gatilho
  }
}

export function readSensors(m: Match, me: Robot, foe: Robot): { s: Sensors; ctx: Ctx } {
  const toFoe = Math.atan2(foe.y - me.y, foe.x - me.x);
  const d = dist(me, foe);
  const hz = nearestHazard(m, me);
  const rel = angDiff(toFoe, me.angle);
  const ready = (i: number) => {
    const ws = me.weapons[i];
    if (!ws || ws.def.mode === "passive") return 0;
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
    sight: lineOfSight(m.walls, me, foe) ? 1 : 0,
    turbo: me.boostCd <= 0 && me.energy >= BOOST.energy ? 1 : 0,
    burning: me.burn > 0 ? 1 : 0,
    time: m.time,
    ready1: ready(0), ready2: ready(1), ready3: ready(2),
    range1: weaponInRange(me, foe, 0, toFoe) ? 1 : 0,
    range2: weaponInRange(me, foe, 1, toFoe) ? 1 : 0,
    range3: weaponInRange(me, foe, 2, toFoe) ? 1 : 0,
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
        else if (act.v === 0) fire[0] = fire[1] = fire[2] = true;
        else fire[act.v - 1] = true;
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
    const { m, me } = c;
    const need = me.stats.radius + 6;
    const reach = 110;
    const free = (a: number) => [55, reach].every((r) => clearance(m.arena, m.walls, { x: me.x + Math.cos(a) * r, y: me.y + Math.sin(a) * r }) > need);
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
export const PUBLIC_URL = "https://robot-warriors.vercel.app/";

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
