// Simulação pura (sem render). Emite eventos de efeito para o renderer (PixiJS).
import { buildStats, equippedWeapons, levelOf, mulberry, REPAIR_CAP, scaledWeapon, slotLayout, WEAPON_HP, WEAPON_SHARE, weaponById, type BuildStats, type Mount, type RobotBuild, type Weapon } from "./parts";
import { arenaById, closestOnSegment, isOpen, lineOfSight, ventState, wallSegments, type ArenaDef, type Pt } from "./arenas";
const STEP = 1 / 60;
const MATCH_TIME = 99;

export interface Input {
  throttle: number; // -1..1 (modo tanque)
  turn: number; // -1..1
  heading: number | null; // modo joystick: ângulo desejado
  headingMag: number; // 0..1
  fire: boolean[];
  boost: boolean; // turbo: arrancada curta para abrir distância
  /** false = segurar a ré continua de ré (não faz meia-volta) */
  autoUTurn?: boolean;
}
export const emptyInput = (): Input => ({ throttle: 0, turn: 0, heading: null, headingMag: 0, fire: [false, false, false], boost: false });

/** Segundos depois de sair do desnorteio em que um robô não pode ser desnorteado de novo. */
export const DAZE_IMMUNITY = 3;

export const BOOST = { energy: 25, cooldown: 2.2, duration: 0.35, power: 1.6 };
/** Quanto tempo o robô dá ré antes de fazer meia-volta e seguir de frente. */
export const REVERSE_TIME = 0.45;

export interface WeaponState {
  def: Weapon;
  cd: number;
  active: boolean; // hold ativo ou animação em curso
  anim: number; // 0..1 animação de golpe
  prevFire: boolean;
  pendingHit: number; // tempo até o golpe do martelo conectar
  hitT: number; // segundos desde o último contato da arma (som de corte)
  mount: Mount;
  /** ângulo do lado da arma, relativo à frente do robô */
  mountAngle: number;
  /** posição da arma no referencial do robô */
  lx: number; ly: number;
  /** 0..100. Em 0 a arma está quebrada e não funciona até ser consertada. */
  integrity: number;
}

export const isBroken = (ws: WeaponState) => ws.integrity <= 0;

export interface Robot {
  id: number;
  build: RobotBuild;
  stats: BuildStats;
  x: number; y: number; angle: number;
  vx: number; vy: number;
  hp: number; energy: number;
  burn: number; // segundos queimando
  stun: number;
  flash: number;
  hazardCd: number;
  ramCd: number;
  weapons: WeaponState[];
  dead: boolean;
  wheelSpin: number;
  dmgDealt: number;
  speedScale: number;
  boostCd: number;
  boostT: number;
  boostDir: number;
  prevBoost: boolean;
  revT: number; // tempo de ré contínua
  /** vida que o Kit de Reparo ainda pode consertar nesta luta */
  repairLeft: number;
  /** segundos desnorteado (sensores embaralhados) e há quanto tempo começou */
  dazed: number;
  dazedAge: number;
  /** segundos até poder ser desnorteado de novo */
  dazeImmune: number;
  /** multiplicador da recarga de energia (reforço "Bateria turbinada") */
  regen: number;
  uTurn: boolean; // fazendo meia-volta (não volta a dar ré até alinhar ou soltar o controle)
  uTurnTarget: number; // modo tanque: ângulo final da meia-volta
  uTurnDir: number;
  uTurnDone: boolean;
}

export interface Missile { x: number; y: number; vx: number; vy: number; owner: number; life: number; angle: number; damage: number }
/** Nuvem de fumaça: corta a linha de visão. */
export interface Cloud { x: number; y: number; r: number; life: number }
/** Ataque orbital marcado: explode em `t` segundos no ponto e fere só o alvo. */
export interface Strike { x: number; y: number; r: number; t: number; owner: number; damage: number }

export type FxEvent =
  | { t: "sparks"; x: number; y: number; angle: number; n: number; color?: number }
  | { t: "flame"; x: number; y: number; angle: number; range: number }
  | { t: "burning"; x: number; y: number }
  | { t: "shock"; x: number; y: number; r: number; hits: { x: number; y: number }[] }
  | { t: "explosion"; x: number; y: number; big: boolean }
  | { t: "damage"; x: number; y: number; amount: number; kind: DamageKind }
  | { t: "smoke"; x: number; y: number }
  | { t: "trail"; x: number; y: number }
  | { t: "vent"; x: number; y: number; r: number }
  | { t: "shake"; power: number }
  | { t: "drill"; x: number; y: number; angle: number }
  | { t: "boost"; x: number; y: number; angle: number }
  | { t: "laser"; x1: number; y1: number; x2: number; y2: number }
  | { t: "heal"; x: number; y: number }
  | { t: "block"; x: number; y: number; angle: number }
  | { t: "pulse"; x: number; y: number; angle: number; range: number; hit: { x: number; y: number } | null }
  | { t: "cloud"; x: number; y: number; r: number; life: number }
  | { t: "sfx"; name: SfxName; x: number; y: number; power?: number };

export type SfxName =
  | "hammer_swing" | "hammer_hit" | "hammer_miss" | "flipper" | "flipper_hit" | "missile_launch"
  | "boost" | "robot_collide" | "ram_hit" | "wall_hit" | "spike_hit";

export type DamageKind = "phys" | "fire" | "shock" | "pierce";

export class Match {
  robots: Robot[];
  missiles: Missile[] = [];
  clouds: Cloud[] = [];
  strikes: Strike[] = [];
  fx: FxEvent[] = [];
  time = MATCH_TIME;
  ventTimer = 0;
  readonly arena: ArenaDef;
  readonly walls: [Pt, Pt][];
  over = false;
  winner: number | null = null; // id ou null (empate)
  endDelay = 1.8;
  private acc = 0;
  private dmgAcc = new Map<number, number>();
  /** sorteios da simulação (antimíssil): semente fixa, então a mesma luta dá sempre o mesmo resultado */
  private rng: () => number;

  /** speedScale: multiplicador de velocidade por robô (a IA usa < 1 para não grudar no jogador). */
  constructor(a: RobotBuild, b: RobotBuild, opts: { speedScale?: [number, number]; arena?: string; seed?: number } = {}) {
    this.rng = mulberry(opts.seed ?? 0x5eed);
    this.arena = arenaById[opts.arena ?? "classica"] ?? arenaById.classica;
    this.walls = wallSegments(this.arena);
    const [s0, s1] = this.arena.spawns;
    this.robots = [
      makeRobot(0, a, s0.x, s0.y, Math.atan2(s1.y - s0.y, s1.x - s0.x)),
      makeRobot(1, b, s1.x, s1.y, Math.atan2(s0.y - s1.y, s0.x - s1.x)),
    ];
    if (opts.speedScale) this.robots.forEach((r, i) => (r.speedScale = opts.speedScale![i]));
  }

  /** Avança dt real com passo fixo. Retorna true quando a partida terminou de vez. */
  update(dt: number, inputs: Input[]): boolean {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) {
      this.step(STEP, inputs);
      this.acc -= STEP;
    }
    return this.over && this.endDelay <= 0;
  }

  step(dt: number, inputs: Input[]) {
    const [r0, r1] = this.robots;
    if (this.over) {
      this.endDelay -= dt;
      for (const r of this.robots) if (r.dead && Math.random() < 0.3) this.fx.push({ t: "smoke", x: r.x, y: r.y });
      inputs = [emptyInput(), emptyInput()];
    } else {
      this.time -= dt;
    }

    this.updateVent(dt);

    for (let i = 0; i < 2; i++) {
      const r = this.robots[i];
      const other = this.robots[1 - i];
      if (r.dead) { r.vx *= 0.9; r.vy *= 0.9; r.x += r.vx * dt; r.y += r.vy * dt; continue; }
      this.drive(r, inputs[i], dt);
      this.weapons(r, other, inputs[i], dt);
      // status
      r.energy = Math.min(100, r.energy + 24 * dt * r.regen);
      r.flash = Math.max(0, r.flash - dt * 4);
      r.hazardCd = Math.max(0, r.hazardCd - dt);
      r.ramCd = Math.max(0, r.ramCd - dt);
      if (r.burn > 0) {
        r.burn -= dt;
        this.damage(r, 5 * dt, "fire", other);
        if (Math.random() < 0.5) this.fx.push({ t: "burning", x: r.x + (Math.random() - 0.5) * r.stats.radius, y: r.y + (Math.random() - 0.5) * r.stats.radius });
      }
      if (r.stun > 0) r.stun -= dt;
      if (r.dazed > 0) {
        r.dazed = Math.max(0, r.dazed - dt);
        r.dazedAge += dt;
        if (r.dazed === 0) r.dazeImmune = DAZE_IMMUNITY; // respiro antes do próximo
      } else r.dazeImmune = Math.max(0, r.dazeImmune - dt);
      if (r.hp < r.stats.hp * 0.35 && Math.random() < 0.08) this.fx.push({ t: "smoke", x: r.x, y: r.y });
    }

    this.clouds = this.clouds.filter((c) => (c.life -= dt) > 0);
    this.updateStrikes(dt);
    this.collideRobots(r0, r1);
    for (const r of this.robots) this.collideArena(r);
    this.updateMissiles(dt);
    this.flushDamageNumbers();

    if (!this.over) {
      const dead = this.robots.filter((r) => r.hp <= 0);
      for (const r of dead) {
        if (!r.dead) {
          r.dead = true;
          this.fx.push({ t: "explosion", x: r.x, y: r.y, big: true }, { t: "shake", power: 18 });
        }
      }
      if (dead.length) {
        this.over = true;
        this.winner = dead.length === 2 ? null : this.robots.find((r) => !r.dead)!.id;
      } else if (this.time <= 0) {
        this.time = 0;
        this.over = true;
        const p0 = r0.hp / r0.stats.hp, p1 = r1.hp / r1.stats.hp;
        this.winner = Math.abs(p0 - p1) < 0.01 ? null : p0 > p1 ? 0 : 1;
      }
    }
  }

  private drive(r: Robot, inp: Input, dt: number) {
    let throttle = inp.throttle, turn = inp.turn;
    if (inp.heading !== null && inp.headingMag > 0.15) {
      const raw = angDiff(inp.heading, r.angle);
      const behind = Math.abs(raw) > Math.PI * 0.62;
      // alinhou de novo para frente: libera a ré para a próxima vez
      if (Math.abs(raw) < Math.PI * 0.3) r.uTurn = false;
      if (behind && !r.uTurn) {
        // ré curta...
        r.revT += dt;
        if (r.revT > REVERSE_TIME && inp.autoUTurn !== false) { r.uTurn = true; r.revT = 0; }
        const diff = angDiff(inp.heading + Math.PI, r.angle);
        turn = clamp(diff * 3.2, -1, 1);
        throttle = -inp.headingMag * Math.max(0, Math.cos(diff)) ** 2;
      } else if (r.uTurn && Math.abs(raw) > Math.PI / 2) {
        // ...depois meia-volta: gira no eixo ainda recuando um pouco (curva em J)
        r.revT = 0;
        turn = Math.sign(raw) || 1;
        throttle = -0.3 * inp.headingMag;
      } else {
        r.revT = 0;
        turn = clamp(raw * 3.2, -1, 1);
        throttle = inp.headingMag * Math.max(0, Math.cos(raw)) ** 2;
      }
    } else if (inp.heading !== null) { throttle = 0; turn = 0; r.revT = 0; r.uTurn = false; }
    else {
      // modo tanque (teclado): frente/ré + girar. Segurando a ré: ré curta, meia-volta e segue de frente.
      if (throttle < -0.1) {
        if (!r.uTurn) {
          r.revT += dt;
          if (r.revT > REVERSE_TIME && inp.autoUTurn !== false) {
            r.uTurn = true; r.uTurnDone = false; r.revT = 0;
            r.uTurnTarget = normAng(r.angle + Math.PI);
            r.uTurnDir = turn !== 0 ? Math.sign(turn) : 1;
          }
        } else if (!r.uTurnDone) {
          const left = angDiff(r.uTurnTarget, r.angle);
          if (Math.abs(left) < 0.08) r.uTurnDone = true;
          else {
            turn = Math.abs(left) > 2.6 ? r.uTurnDir : clamp(left * 3, -1, 1);
            throttle = -0.3;
          }
        }
        // meia-volta concluída: continua segurando = anda de frente (girar ainda funciona)
        if (r.uTurnDone) throttle = Math.abs(throttle);
      } else {
        r.revT = 0; r.uTurn = false; r.uTurnDone = false;
      }
    }
    if (r.stun > 0) { throttle = 0; turn = 0; }

    const s = r.stats;
    // consertando ou com escudo ligado o robô fica mais lento
    const slow = r.weapons.reduce((k, w) => (w.active && w.def.kind === "repair" ? k * 0.5 : w.active && w.def.kind === "shield" ? k * 0.7 : k), 1);
    const maxSpeed = s.speed * r.speedScale * slow;

    // turbo (borda de subida do botão)
    r.boostCd = Math.max(0, r.boostCd - dt);
    const boostPressed = inp.boost && !r.prevBoost;
    r.prevBoost = inp.boost;
    if (boostPressed && r.boostCd <= 0 && r.energy >= BOOST.energy && r.stun <= 0 && !this.over) {
      r.energy -= BOOST.energy;
      r.boostCd = BOOST.cooldown;
      r.boostT = BOOST.duration;
      this.fx.push({ t: "sfx", name: "boost", x: r.x, y: r.y });
      // vai para onde o jogador aponta (ou para frente)
      r.boostDir = inp.heading !== null && inp.headingMag > 0.15 ? inp.heading : r.angle;
      r.vx = Math.cos(r.boostDir) * maxSpeed * BOOST.power;
      r.vy = Math.sin(r.boostDir) * maxSpeed * BOOST.power;
    }

    // giro no próprio eixo: quanto mais devagar, mais rápido gira
    const spd = Math.hypot(r.vx, r.vy);
    const pivot = 1 + 0.9 * (1 - Math.min(1, spd / Math.max(1, maxSpeed)));
    r.angle = normAng(r.angle + turn * s.turn * pivot * dt);
    const fx = Math.cos(r.angle), fy = Math.sin(r.angle);
    let tvx = fx * throttle * maxSpeed * (throttle < 0 ? 0.85 : 1);
    let tvy = fy * throttle * maxSpeed * (throttle < 0 ? 0.85 : 1);
    if (r.boostT > 0) {
      r.boostT -= dt;
      tvx = Math.cos(r.boostDir) * maxSpeed * BOOST.power;
      tvy = Math.sin(r.boostDir) * maxSpeed * BOOST.power;
      this.fx.push({ t: "boost", x: r.x - Math.cos(r.angle) * s.radius, y: r.y - Math.sin(r.angle) * s.radius, angle: r.angle + Math.PI });
    }
    const k = r.stun > 0 ? 1.4 : 3 + 6 * s.grip;
    const a = 1 - Math.exp(-k * dt);
    r.vx += (tvx - r.vx) * a;
    r.vy += (tvy - r.vy) * a;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.wheelSpin += (r.vx * fx + r.vy * fy) * dt * 0.08 + turn * dt * 2;
  }

  private weapons(r: Robot, t: Robot, inp: Input, dt: number) {
    r.weapons.forEach((ws, i) => {
      const w = ws.def;
      const firing = !!inp.fire[i] && r.stun <= 0 && !this.over && !isBroken(ws);
      ws.cd = Math.max(0, ws.cd - dt);
      const mount = mountPoint(r, i);
      const aim = r.angle + ws.mountAngle;

      if (w.kind === "repair") {
        const hurt = r.repairLeft > 0 && r.hp < r.stats.hp;
        const worst = this.mostDamaged(r);
        ws.active = firing && r.energy > 1 && (hurt || worst !== null);
        ws.anim = (ws.anim + dt * (ws.active ? 1 : 0.15)) % 1000;
        if (ws.active) {
          r.energy = Math.max(0, r.energy - w.energy * dt);
          if (hurt) {
            const heal = Math.min(r.repairLeft, (w.power ?? 0) * dt, r.stats.hp - r.hp);
            r.hp += heal;
            r.repairLeft -= heal;
          }
          if (worst) worst.integrity = Math.min(100, worst.integrity + 15 * dt);
          if (Math.floor(ws.anim * 6) !== Math.floor((ws.anim - dt) * 6)) this.fx.push({ t: "heal", x: r.x, y: r.y });
        }
        return;
      }
      if (w.kind === "shield") {
        ws.active = firing && r.energy > 1;
        ws.anim = Math.max(0, Math.min(1, ws.anim + (ws.active ? dt * 6 : -dt * 6)));
        if (ws.active) r.energy = Math.max(0, r.energy - w.energy * dt);
        return;
      }

      if (w.mode === "hold") {
        ws.active = firing && r.energy > 1;
        ws.anim = (ws.anim + dt * (ws.active ? 1 : 0.15)) % 1000;
        ws.hitT += dt;
        if (ws.active) {
          r.energy = Math.max(0, r.energy - w.energy * dt);
          if (w.kind === "flame") {
            this.fx.push({ t: "flame", x: mount.x, y: mount.y, angle: aim, range: w.range });
            if (inArc(aim, t, mount, w.range, w.arc)) {
              this.damage(t, w.damage * dt, "fire", r);
              ws.hitT = 0;
              t.burn = Math.max(t.burn, 3 * (1 - t.stats.fireRes));
            }
          } else if (inArc(aim, t, mount, w.range, w.arc)) {
            const kind: DamageKind = w.kind === "drill" ? "pierce" : "phys";
            this.damage(t, w.damage * dt, kind, r, mount);
            ws.hitT = 0;
            const cx = (mount.x + t.x) / 2, cy = (mount.y + t.y) / 2;
            if (w.kind === "drill") this.fx.push({ t: "drill", x: cx, y: cy, angle: aim });
            this.fx.push({ t: "sparks", x: cx, y: cy, angle: aim + Math.PI, n: 2, color: w.kind === "drill" ? 0xffa040 : undefined });
            // serra empurra levemente o alvo
            t.vx += Math.cos(aim) * 60 * dt; t.vy += Math.sin(aim) * 60 * dt;
          }
        }
      } else if (w.mode === "press") {
        const pressed = firing && !ws.prevFire;
        ws.prevFire = firing;
        if (ws.anim > 0) ws.anim = Math.max(0, ws.anim - dt * (w.kind === "hammer" ? 2.2 : 3));
        if (ws.pendingHit > 0) {
          ws.pendingHit -= dt;
          if (ws.pendingHit <= 0) this.hammerHit(r, t, ws, i);
        }
        if (pressed && ws.cd <= 0 && r.energy >= w.energy) {
          r.energy -= w.energy;
          ws.cd = w.cooldown;
          this.fire(r, t, ws, i);
        }
      } else if (ws.anim > 0) {
        ws.anim = Math.max(0, ws.anim - dt * 4);
      }
    });
  }

  private fire(r: Robot, t: Robot, ws: WeaponState, i: number) {
    const w = ws.def;
    const m = mountPoint(r, i);
    const aim = r.angle + ws.mountAngle;
    switch (w.kind) {
      case "shock": {
        ws.anim = 1;
        const hits: { x: number; y: number }[] = [];
        if (dist(r, t) < w.range + t.stats.radius + r.stats.radius) {
          this.damage(t, w.damage, "shock", r);
          t.stun = Math.max(t.stun, 1.3 * (1 - t.stats.shockRes) * (1 - grounding(t)));
          hits.push({ x: t.x, y: t.y });
        }
        this.fx.push({ t: "shock", x: r.x, y: r.y, r: w.range + r.stats.radius, hits }, { t: "shake", power: 4 });
        break;
      }
      case "hammer":
        ws.anim = 1;
        this.fx.push({ t: "sfx", name: "hammer_swing", x: m.x, y: m.y });
        ws.pendingHit = 0.16;
        break;
      case "flipper": {
        ws.anim = 1;
        this.fx.push({ t: "sfx", name: "flipper", x: m.x, y: m.y });
        if (inArc(aim, t, m, w.range, w.arc)) {
          this.fx.push({ t: "sfx", name: "flipper_hit", x: t.x, y: t.y, power: t.stats.flipImmune ? 0.4 : 1 });
          this.damage(t, w.damage, "phys", r, m);
          if (!t.stats.flipImmune) {
            const power = 780 / (t.stats.totalMass / 70);
            t.vx += Math.cos(aim) * power; t.vy += Math.sin(aim) * power;
            t.stun = Math.max(t.stun, 0.8);
          } else {
            t.vx += Math.cos(aim) * 120; t.vy += Math.sin(aim) * 120;
          }
          this.fx.push({ t: "sparks", x: (m.x + t.x) / 2, y: (m.y + t.y) / 2, angle: aim, n: 14 }, { t: "shake", power: 8 });
        }
        break;
      }
      case "disruptor": {
        ws.anim = 1;
        const hit = inArc(aim, t, m, w.range, w.arc);
        if (hit) {
          this.damage(t, w.damage, "shock", r);
          const dur = (w.power ?? 0) * (1 - t.stats.shockRes * 0.5) * (1 - grounding(t));
          // não acumula e dá um respiro de DAZE_IMMUNITY s depois do efeito acabar
          if (t.dazed <= 0 && t.dazeImmune <= 0 && dur > 0) { t.dazed = dur; t.dazedAge = 0; }
        }
        this.fx.push({ t: "pulse", x: m.x, y: m.y, angle: aim, range: w.range, hit: hit ? { x: t.x, y: t.y } : null }, { t: "shake", power: 3 });
        break;
      }
      case "smoke": {
        ws.anim = 1;
        const c = { x: r.x, y: r.y, r: w.range, life: w.power ?? 3 };
        this.clouds.push(c);
        this.fx.push({ t: "cloud", ...c });
        break;
      }
      case "missile":
        ws.anim = 1;
        this.missiles.push({ x: m.x, y: m.y, vx: Math.cos(aim) * 420 + r.vx * 0.3, vy: Math.sin(aim) * 420 + r.vy * 0.3, owner: r.id, life: 2.5, angle: aim, damage: w.damage });
        r.vx -= Math.cos(aim) * 40; r.vy -= Math.sin(aim) * 40;
        this.fx.push({ t: "sfx", name: "missile_launch", x: m.x, y: m.y });
        break;
    }
  }

  private hammerHit(r: Robot, t: Robot, ws: WeaponState, i: number) {
    const m = mountPoint(r, i);
    const w = ws.def;
    const aim = r.angle + ws.mountAngle;
    const hx = m.x + Math.cos(aim) * w.range * 0.6, hy = m.y + Math.sin(aim) * w.range * 0.6;
    if (inArc(aim, t, m, w.range, w.arc)) {
      this.damage(t, w.damage, "phys", r, { x: hx, y: hy });
      t.stun = Math.max(t.stun, 0.25);
      this.fx.push({ t: "sparks", x: hx, y: hy, angle: aim + Math.PI, n: 18 }, { t: "shake", power: 10 }, { t: "sfx", name: "hammer_hit", x: hx, y: hy, power: 1 });
    } else {
      this.fx.push({ t: "sparks", x: hx, y: hy, angle: aim + Math.PI, n: 5, color: 0x999999 }, { t: "sfx", name: "hammer_miss", x: hx, y: hy });
    }
  }

  /** `from`: de onde veio o golpe (decide escudo e qual arma leva parte do dano). */
  damage(t: Robot, amount: number, kind: DamageKind, src?: Robot, from?: { x: number; y: number }) {
    if (t.dead || amount <= 0) return;
    const s = t.stats;
    let mult = 1;
    if (kind === "phys") mult = 1 - s.reduction;
    if (kind === "fire") mult = 1 - s.fireRes;
    if (kind === "shock") mult = 1 - s.shockRes * 0.8;
    const physical = kind === "phys" || kind === "pierce";
    const hit = from ? Math.atan2(from.y - t.y, from.x - t.x) : null;
    if (physical && hit !== null) {
      // escudo ligado do lado do golpe
      const shield = t.weapons.find((w) => w.def.kind === "shield" && w.active && Math.abs(angDiff(hit, t.angle + w.mountAngle)) <= w.def.arc);
      if (shield) {
        mult *= 1 - (shield.def.power ?? 0);
        if (amount * mult > 0.5 || Math.random() < 0.1) this.fx.push({ t: "block", x: t.x + Math.cos(hit) * t.stats.radius, y: t.y + Math.sin(hit) * t.stats.radius, angle: hit });
      }
    }
    const d = amount * mult;
    if (physical && hit !== null) this.wearWeapon(t, hit, from!, d);
    t.hp = Math.max(0, t.hp - d);
    t.flash = Math.min(1, t.flash + (d > 3 ? 1 : d * 0.4));
    if (src && src !== t) src.dmgDealt += d;
    this.dmgAcc.set(t.id, (this.dmgAcc.get(t.id) ?? 0) + d);
    this.lastKind.set(t.id, kind);
  }
  private lastKind = new Map<number, DamageKind>();

  /** Parte do golpe vai para a arma do lado atingido; em 0 ela quebra. */
  private wearWeapon(t: Robot, hit: number, from: { x: number; y: number }, d: number) {
    let best: WeaponState | null = null, bestD = Infinity;
    t.weapons.forEach((w, i) => {
      if (isBroken(w) || Math.abs(angDiff(hit, t.angle + w.mountAngle)) > Math.PI / 4 + 1e-6) return;
      const p = mountPoint(t, i);
      const dd = Math.hypot(p.x - from.x, p.y - from.y);
      if (dd < bestD) { bestD = dd; best = w; }
    });
    if (!best) return;
    const w = best as WeaponState;
    w.integrity = Math.max(0, w.integrity - (d * WEAPON_SHARE * 100) / WEAPON_HP);
    if (w.integrity <= 0) {
      w.active = false;
      const p = mountPoint(t, t.weapons.indexOf(w));
      this.fx.push({ t: "sparks", x: p.x, y: p.y, angle: hit + Math.PI, n: 22, color: 0xaaaaaa }, { t: "smoke", x: p.x, y: p.y }, { t: "shake", power: 5 });
    }
  }

  /** Arma mais danificada (para o reparo), ou null se todas estão inteiras. */
  private mostDamaged(r: Robot): WeaponState | null {
    let worst: WeaponState | null = null;
    for (const w of r.weapons) if (w.integrity < 100 && (!worst || w.integrity < worst.integrity)) worst = w;
    return worst;
  }
  private dmgTimer = 0;

  private flushDamageNumbers() {
    this.dmgTimer -= STEP;
    for (const [id, amt] of this.dmgAcc) {
      // números grandes saem na hora, contínuos acumulam e saem a cada 0.35s
      if (amt >= 6 || (this.dmgTimer <= 0 && amt >= 1)) {
        const r = this.robots[id];
        this.fx.push({ t: "damage", x: r.x, y: r.y - r.stats.radius - 10, amount: Math.round(amt), kind: this.lastKind.get(id) ?? "phys" });
        this.dmgAcc.set(id, 0);
      }
    }
    if (this.dmgTimer <= 0) this.dmgTimer = 0.35;
  }

  private collideRobots(a: Robot, b: Robot) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const min = a.stats.radius + b.stats.radius;
    if (d >= min) return;
    const nx = dx / d, ny = dy / d;
    const ma = a.stats.totalMass * a.stats.push, mb = b.stats.totalMass * b.stats.push;
    const overlap = min - d;
    a.x -= nx * overlap * (mb / (ma + mb)); a.y -= ny * overlap * (mb / (ma + mb));
    b.x += nx * overlap * (ma / (ma + mb)); b.y += ny * overlap * (ma / (ma + mb));
    const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (rel > 0) {
      const j = (1.35 * rel) / (1 / ma + 1 / mb);
      a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny;
      b.vx += (j / mb) * nx; b.vy += (j / mb) * ny;
      if (rel > 90) this.fx.push({ t: "sfx", name: "robot_collide", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, power: Math.min(1, rel / 450) });
      if (rel > 120) {
        this.fx.push({ t: "sparks", x: a.x + nx * a.stats.radius, y: a.y + ny * a.stats.radius, angle: Math.atan2(-ny, -nx), n: Math.min(12, rel / 25) });
        if (rel > 220) this.fx.push({ t: "shake", power: rel / 60 });
      }
      this.ram(a, b, rel, nx, ny);
      this.ram(b, a, rel, -nx, -ny);
    }
  }

  private ram(att: Robot, tgt: Robot, rel: number, nx: number, ny: number) {
    if (att.ramCd > 0 || rel < 90) return;
    // só se bater com o lado onde estão os espinhos
    const hit = Math.atan2(ny, nx);
    const spikes = att.weapons.find((w) => w.def.kind === "spikes" && !isBroken(w) && Math.abs(angDiff(hit, att.angle + w.mountAngle)) <= w.def.arc);
    if (!spikes) return;
    att.ramCd = spikes.def.cooldown;
    this.fx.push({ t: "sfx", name: "ram_hit", x: tgt.x, y: tgt.y, power: Math.min(1, rel / 400) });
    this.damage(tgt, rel * spikes.def.damage * (att.stats.totalMass / 70), "phys", att, att);
    this.fx.push({ t: "sparks", x: (att.x + tgt.x) / 2, y: (att.y + tgt.y) / 2, angle: hit + Math.PI, n: 10 });
  }

  /** Vent ativo/avisando agora? */
  vent(i: number) { return ventState(this.arena.vents[i], this.ventTimer); }

  private collideArena(r: Robot) {
    const rad = r.stats.radius;
    // paredes: empurra o círculo para fora de cada segmento (borda e obstáculos)
    for (let pass = 0; pass < 2; pass++) {
      for (const [a, b] of this.walls) {
        const c = closestOnSegment(r, a, b);
        let dx = r.x - c.x, dy = r.y - c.y;
        let d = Math.hypot(dx, dy);
        if (d >= rad) continue;
        if (d < 0.001) { dx = -(b.y - a.y); dy = b.x - a.x; d = Math.hypot(dx, dy); }
        let nx = dx / d, ny = dy / d;
        // se o centro escapou para dentro da parede, inverte a normal
        if (!isOpen(this.arena, r)) { nx = -nx; ny = -ny; d = -d; }
        r.x += nx * (rad - d); r.y += ny * (rad - d);
        const vn = r.vx * nx + r.vy * ny;
        if (vn < 0) {
          if (-vn > 180) this.fx.push({ t: "sparks", x: r.x - nx * rad, y: r.y - ny * rad, angle: Math.atan2(ny, nx), n: 6 });
          if (-vn > 110) this.fx.push({ t: "sfx", name: "wall_hit", x: r.x - nx * rad, y: r.y - ny * rad, power: Math.min(1, -vn / 500) });
          if (-vn > 350) this.damage(r, (-vn - 350) * 0.04, "phys");
          r.vx -= 1.4 * vn * nx; r.vy -= 1.4 * vn * ny;
        }
      }
    }

    // zonas de espinhos
    for (const z of this.arena.spikes) {
      const d = Math.hypot(r.x - z.x, r.y - z.y) || 1;
      if (d < z.r + rad * 0.5 && r.hazardCd <= 0 && !r.dead) {
        r.hazardCd = 0.6;
        this.fx.push({ t: "sfx", name: "spike_hit", x: r.x, y: r.y });
        this.damage(r, 14, "phys");
        // empurra para longe do centro da zona (ou para o spawn mais próximo se estiver em cima)
        let nx = (r.x - z.x) / d, ny = (r.y - z.y) / d;
        if (!isOpen(this.arena, { x: r.x + nx * 60, y: r.y + ny * 60 })) {
          const sp = this.arena.spawns[0];
          const k = Math.hypot(sp.x - r.x, sp.y - r.y) || 1;
          nx = (sp.x - r.x) / k; ny = (sp.y - r.y) / k;
        }
        r.vx = nx * 420; r.vy = ny * 420;
        r.stun = Math.max(r.stun, 0.3);
        this.fx.push({ t: "sparks", x: r.x - nx * rad, y: r.y - ny * rad, angle: Math.atan2(ny, nx), n: 16 }, { t: "shake", power: 7 });
      }
    }
    // vents de fogo
    this.arena.vents.forEach((v, i) => {
      if (this.vent(i).active && Math.hypot(r.x - v.x, r.y - v.y) < v.r + rad * 0.5) {
        r.burn = Math.max(r.burn, 2 * (1 - r.stats.fireRes));
        this.damage(r, 12 * STEP, "fire");
      }
    });
  }

  private updateVent(dt: number) {
    this.ventTimer += dt;
    this.arena.vents.forEach((v, i) => {
      if (this.vent(i).active) this.fx.push({ t: "vent", x: v.x, y: v.y, r: v.r });
    });
  }

  private updateMissiles(dt: number) {
    const keep: Missile[] = [];
    for (const m of this.missiles) {
      m.life -= dt;
      // leve teleguiagem
      const tgt = this.robots[1 - m.owner];
      // na fumaça o míssil perde o alvo e segue reto
      if (!tgt.dead && !this.smokeBetween(m, tgt)) {
        const want = Math.atan2(tgt.y - m.y, tgt.x - m.x);
        m.angle = normAng(m.angle + clamp(angDiff(want, m.angle), -1, 1) * 1.6 * dt);
        const sp = Math.min(640, Math.hypot(m.vx, m.vy) + 500 * dt);
        m.vx = Math.cos(m.angle) * sp; m.vy = Math.sin(m.angle) * sp;
      }
      m.x += m.vx * dt; m.y += m.vy * dt;
      this.fx.push({ t: "trail", x: m.x - Math.cos(m.angle) * 10, y: m.y - Math.sin(m.angle) * 10 });
      if (!tgt.dead && this.intercept(tgt, m)) {
        this.fx.push({ t: "explosion", x: m.x, y: m.y, big: false });
        continue;
      }
      let boom = m.life <= 0 || !isOpen(this.arena, m);
      for (const r of this.robots) {
        if (r.id === m.owner || r.dead) continue;
        if (Math.hypot(r.x - m.x, r.y - m.y) < r.stats.radius + 6) {
          this.damage(r, m.damage, "phys", this.robots[m.owner], m);
          r.vx += m.vx * 0.25; r.vy += m.vy * 0.25;
          boom = true;
        }
      }
      if (boom) this.fx.push({ t: "explosion", x: m.x, y: m.y, big: false }, { t: "shake", power: 6 });
      else keep.push(m);
    }
    this.missiles = keep;
  }

  // ---------- reforços da Carreira (nunca usados no ranking) ----------

  /** Reforço de antes da luta, aplicado logo depois de criar a partida. */
  applyPreBoost(id: "armor" | "battery" | "sabotage", who = 0) {
    const me = this.robots[who], foe = this.robots[1 - who];
    if (id === "armor") { me.stats = { ...me.stats, hp: Math.round(me.stats.hp * 1.25) }; me.hp = me.stats.hp; }
    if (id === "battery") me.regen = 1.5;
    if (id === "sabotage") foe.hp = Math.round(foe.hp * 0.85);
  }

  /** Reforço usado durante a luta. false se não deu para usar agora. */
  useLiveBoost(id: "repair" | "freeze" | "orbital", who = 0): boolean {
    const me = this.robots[who], foe = this.robots[1 - who];
    if (this.over || me.dead) return false;
    if (id === "repair") {
      me.hp = Math.min(me.stats.hp, me.hp + me.stats.hp * 0.3);
      for (let k = 0; k < 4; k++) this.fx.push({ t: "heal", x: me.x, y: me.y });
    }
    if (id === "freeze") {
      foe.stun = Math.max(foe.stun, 2);
      this.fx.push({ t: "shock", x: foe.x, y: foe.y, r: foe.stats.radius * 1.6, hits: [{ x: foe.x, y: foe.y }] });
    }
    if (id === "orbital") this.strikes.push({ x: foe.x, y: foe.y, r: 70, t: 1, owner: who, damage: 40 });
    return true;
  }

  /** "Continuar" depois de perder: o robô volta com `hpPct` da vida e a luta segue (+30 s se o tempo acabou). */
  revive(who = 0, hpPct = 0.4) {
    const me = this.robots[who];
    me.dead = false;
    me.hp = Math.max(1, me.stats.hp * hpPct);
    me.burn = 0; me.stun = 0; me.vx = 0; me.vy = 0;
    this.over = false;
    this.winner = null;
    this.endDelay = 1.8;
    if (this.time <= 0.5) this.time = 30;
  }

  private updateStrikes(dt: number) {
    for (const s of this.strikes) {
      s.t -= dt;
      if (s.t > 0) continue;
      const tgt = this.robots[1 - s.owner];
      this.fx.push({ t: "explosion", x: s.x, y: s.y, big: true }, { t: "shake", power: 14 });
      if (!tgt.dead && Math.hypot(tgt.x - s.x, tgt.y - s.y) < s.r + tgt.stats.radius) this.damage(tgt, s.damage, "phys", this.robots[s.owner]);
    }
    this.strikes = this.strikes.filter((s) => s.t > 0);
  }

  /** Alguma nuvem de fumaça corta a linha entre os dois pontos (ou cobre um deles)? */
  smokeBetween(p: { x: number; y: number }, q: { x: number; y: number }): boolean {
    for (const c of this.clouds) {
      const cl = closestOnSegment(c, p, q);
      if (Math.hypot(cl.x - c.x, cl.y - c.y) < c.r) return true;
    }
    return false;
  }

  /** Dá para ver o alvo: sem parede nem fumaça no caminho. */
  sees(p: { x: number; y: number }, q: { x: number; y: number }): boolean {
    return lineOfSight(this.walls, p, q) && !this.smokeBetween(p, q);
  }

  /** Antimíssil do alvo tenta derrubar o míssil. true = derrubou. */
  private intercept(r: Robot, m: Missile): boolean {
    const i = r.weapons.findIndex((w) => w.def.kind === "antimissile");
    if (i < 0 || this.over) return false;
    const ws = r.weapons[i];
    if (isBroken(ws) || ws.cd > 0 || r.energy < ws.def.energy || r.stun > 0) return false;
    if (Math.hypot(m.x - r.x, m.y - r.y) > ws.def.range + r.stats.radius) return false;
    ws.cd = ws.def.cooldown;
    ws.anim = 1;
    r.energy -= ws.def.energy;
    const p = mountPoint(r, i);
    this.fx.push({ t: "laser", x1: p.x, y1: p.y, x2: m.x, y2: m.y });
    return this.rng() < (ws.def.power ?? 0);
  }

  drainFx(): FxEvent[] {
    const f = this.fx;
    this.fx = [];
    return f;
  }
}

function makeRobot(id: number, build: RobotBuild, x: number, y: number, angle: number): Robot {
  const stats = buildStats(build);
  return {
    id, build, stats, x, y, angle, vx: 0, vy: 0,
    hp: stats.hp, energy: 100, burn: 0, stun: 0, flash: 0, hazardCd: 0, ramCd: 0,
    weapons: makeWeapons(build, stats.radius),
    dead: false, wheelSpin: 0, dmgDealt: 0,
    speedScale: 1, boostCd: 0, boostT: 0, boostDir: angle, prevBoost: false, revT: 0, uTurn: false, uTurnTarget: 0, uTurnDir: 1, uTurnDone: false,
    repairLeft: stats.hp * REPAIR_CAP, dazed: 0, dazedAge: 0, dazeImmune: 0, regen: 1,
  };
}

function makeWeapons(build: RobotBuild, radius: number): WeaponState[] {
  const list = equippedWeapons(build);
  const places = slotLayout(list.map((w) => ({ kind: weaponById[w.id].kind, mount: w.mount })), radius);
  return list.map((w, i) => ({
    def: scaledWeapon(weaponById[w.id], levelOf(build, w.id)), cd: 0, active: false, anim: 0, prevFire: false, pendingHit: 0, hitT: 9,
    mount: w.mount, mountAngle: places[i].angle, lx: places[i].lx, ly: places[i].ly, integrity: 100,
  }));
}

/**
 * Erro dos sensores de um robô desnorteado: quanto ele erra o ângulo (rad) e a distância (fator).
 * Muda a cada ~0,7 s e é determinístico (depende só do tempo da luta e do robô).
 */
export function dazeError(m: Match, r: Robot): { angle: number; dist: number } {
  if (r.dazed <= 0) return { angle: 0, dist: 1 };
  const k = Math.floor(m.time * 1.5) + r.id * 97;
  const h = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  return { angle: (h(k) * 2 - 1) * Math.PI * 0.55, dist: 0.5 + h(k + 31) * 1.1 };
}

/** Proteção do Aterramento (0..1) contra paralisia e desnorteio. */
function grounding(t: Robot): number {
  const g = t.weapons.find((w) => w.def.kind === "grounding" && !isBroken(w));
  return g ? g.def.power ?? 0 : 0;
}

/** Ponto da arma `i` no mundo. */
export function mountPoint(r: Robot, i: number) {
  const ws = r.weapons[i];
  const c = Math.cos(r.angle), s = Math.sin(r.angle);
  return { x: r.x + ws.lx * c - ws.ly * s, y: r.y + ws.lx * s + ws.ly * c };
}

/** Ângulo para onde a arma `i` aponta, no mundo. */
export const weaponAim = (r: Robot, i: number) => r.angle + (r.weapons[i]?.mountAngle ?? 0);

function inArc(aim: number, t: Robot, from: { x: number; y: number }, range: number, arc: number) {
  const dx = t.x - from.x, dy = t.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d - t.stats.radius > range) return false;
  const ang = Math.abs(angDiff(Math.atan2(dy, dx), aim));
  // tolerância pelo tamanho do alvo
  return ang < arc + Math.atan2(t.stats.radius, Math.max(d, 1)) * 0.8;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const normAng = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const angDiff = (a: number, b: number) => normAng(a - b);
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
