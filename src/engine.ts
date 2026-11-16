// Simulação pura (sem render). Emite eventos de efeito para o renderer (PixiJS).
import { buildStats, levelOf, scaledWeapon, weaponById, type BuildStats, type RobotBuild, type Weapon } from "./parts";
import { arenaById, closestOnSegment, isOpen, ventState, wallSegments, type ArenaDef, type Pt } from "./arenas";
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
}

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
  uTurn: boolean; // fazendo meia-volta (não volta a dar ré até alinhar ou soltar o controle)
  uTurnTarget: number; // modo tanque: ângulo final da meia-volta
  uTurnDir: number;
  uTurnDone: boolean;
}

export interface Missile { x: number; y: number; vx: number; vy: number; owner: number; life: number; angle: number; damage: number }

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
  | { t: "sfx"; name: SfxName; x: number; y: number; power?: number };

export type SfxName =
  | "hammer_swing" | "hammer_hit" | "hammer_miss" | "flipper" | "flipper_hit" | "missile_launch"
  | "boost" | "robot_collide" | "ram_hit" | "wall_hit" | "spike_hit";

export type DamageKind = "phys" | "fire" | "shock" | "pierce";

export class Match {
  robots: Robot[];
  missiles: Missile[] = [];
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

  /** speedScale: multiplicador de velocidade por robô (a IA usa < 1 para não grudar no jogador). */
  constructor(a: RobotBuild, b: RobotBuild, opts: { speedScale?: [number, number]; arena?: string } = {}) {
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
      r.energy = Math.min(100, r.energy + 24 * dt);
      r.flash = Math.max(0, r.flash - dt * 4);
      r.hazardCd = Math.max(0, r.hazardCd - dt);
      r.ramCd = Math.max(0, r.ramCd - dt);
      if (r.burn > 0) {
        r.burn -= dt;
        this.damage(r, 5 * dt, "fire", other);
        if (Math.random() < 0.5) this.fx.push({ t: "burning", x: r.x + (Math.random() - 0.5) * r.stats.radius, y: r.y + (Math.random() - 0.5) * r.stats.radius });
      }
      if (r.stun > 0) r.stun -= dt;
      if (r.hp < r.stats.hp * 0.35 && Math.random() < 0.08) this.fx.push({ t: "smoke", x: r.x, y: r.y });
    }

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
    const maxSpeed = s.speed * r.speedScale;

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
    const n = r.weapons.length;
    r.weapons.forEach((ws, i) => {
      const w = ws.def;
      const firing = !!inp.fire[i] && r.stun <= 0 && !this.over;
      ws.cd = Math.max(0, ws.cd - dt);
      const mount = mountPoint(r, i, n);

      if (w.mode === "hold") {
        ws.active = firing && r.energy > 1;
        ws.anim = (ws.anim + dt * (ws.active ? 1 : 0.15)) % 1000;
        ws.hitT += dt;
        if (ws.active) {
          r.energy = Math.max(0, r.energy - w.energy * dt);
          if (w.kind === "flame") {
            this.fx.push({ t: "flame", x: mount.x, y: mount.y, angle: r.angle, range: w.range });
            if (inArc(r, t, mount, w.range, w.arc)) {
              this.damage(t, w.damage * dt, "fire", r);
              ws.hitT = 0;
              t.burn = Math.max(t.burn, 3 * (1 - t.stats.fireRes));
            }
          } else if (inArc(r, t, mount, w.range, w.arc)) {
            const kind: DamageKind = w.kind === "drill" ? "pierce" : "phys";
            this.damage(t, w.damage * dt, kind, r);
            ws.hitT = 0;
            const cx = (mount.x + t.x) / 2, cy = (mount.y + t.y) / 2;
            if (w.kind === "drill") this.fx.push({ t: "drill", x: cx, y: cy, angle: r.angle });
            this.fx.push({ t: "sparks", x: cx, y: cy, angle: r.angle + Math.PI, n: 2, color: w.kind === "drill" ? 0xffa040 : undefined });
            // serra empurra levemente o alvo
            t.vx += Math.cos(r.angle) * 60 * dt; t.vy += Math.sin(r.angle) * 60 * dt;
          }
        }
      } else if (w.mode === "press") {
        const pressed = firing && !ws.prevFire;
        ws.prevFire = firing;
        if (ws.anim > 0) ws.anim = Math.max(0, ws.anim - dt * (w.kind === "hammer" ? 2.2 : 3));
        if (ws.pendingHit > 0) {
          ws.pendingHit -= dt;
          if (ws.pendingHit <= 0) this.hammerHit(r, t, ws, i, n);
        }
        if (pressed && ws.cd <= 0 && r.energy >= w.energy) {
          r.energy -= w.energy;
          ws.cd = w.cooldown;
          this.fire(r, t, ws, i, n);
        }
      }
    });
  }

  private fire(r: Robot, t: Robot, ws: WeaponState, i: number, n: number) {
    const w = ws.def;
    const m = mountPoint(r, i, n);
    switch (w.kind) {
      case "shock": {
        ws.anim = 1;
        const hits: { x: number; y: number }[] = [];
        if (dist(r, t) < w.range + t.stats.radius + r.stats.radius) {
          this.damage(t, w.damage, "shock", r);
          t.stun = Math.max(t.stun, 1.3 * (1 - t.stats.shockRes));
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
        if (inArc(r, t, m, w.range, w.arc)) {
          this.fx.push({ t: "sfx", name: "flipper_hit", x: t.x, y: t.y, power: t.stats.flipImmune ? 0.4 : 1 });
          this.damage(t, w.damage, "phys", r);
          if (!t.stats.flipImmune) {
            const power = 780 / (t.stats.totalMass / 70);
            t.vx += Math.cos(r.angle) * power; t.vy += Math.sin(r.angle) * power;
            t.stun = Math.max(t.stun, 0.8);
          } else {
            t.vx += Math.cos(r.angle) * 120; t.vy += Math.sin(r.angle) * 120;
          }
          this.fx.push({ t: "sparks", x: (m.x + t.x) / 2, y: (m.y + t.y) / 2, angle: r.angle, n: 14 }, { t: "shake", power: 8 });
        }
        break;
      }
      case "missile":
        ws.anim = 1;
        this.missiles.push({ x: m.x, y: m.y, vx: Math.cos(r.angle) * 420 + r.vx * 0.3, vy: Math.sin(r.angle) * 420 + r.vy * 0.3, owner: r.id, life: 2.5, angle: r.angle, damage: w.damage });
        r.vx -= Math.cos(r.angle) * 40; r.vy -= Math.sin(r.angle) * 40;
        this.fx.push({ t: "sfx", name: "missile_launch", x: m.x, y: m.y });
        break;
    }
  }

  private hammerHit(r: Robot, t: Robot, ws: WeaponState, i: number, n: number) {
    const m = mountPoint(r, i, n);
    const w = ws.def;
    const hx = m.x + Math.cos(r.angle) * w.range * 0.6, hy = m.y + Math.sin(r.angle) * w.range * 0.6;
    if (inArc(r, t, m, w.range, w.arc)) {
      this.damage(t, w.damage, "phys", r);
      t.stun = Math.max(t.stun, 0.25);
      this.fx.push({ t: "sparks", x: hx, y: hy, angle: r.angle + Math.PI, n: 18 }, { t: "shake", power: 10 }, { t: "sfx", name: "hammer_hit", x: hx, y: hy, power: 1 });
    } else {
      this.fx.push({ t: "sparks", x: hx, y: hy, angle: r.angle + Math.PI, n: 5, color: 0x999999 }, { t: "sfx", name: "hammer_miss", x: hx, y: hy });
    }
  }

  damage(t: Robot, amount: number, kind: DamageKind, src?: Robot) {
    if (t.dead || amount <= 0) return;
    const s = t.stats;
    let mult = 1;
    if (kind === "phys") mult = 1 - s.reduction;
    if (kind === "fire") mult = 1 - s.fireRes;
    if (kind === "shock") mult = 1 - s.shockRes * 0.8;
    const d = amount * mult;
    t.hp = Math.max(0, t.hp - d);
    t.flash = Math.min(1, t.flash + (d > 3 ? 1 : d * 0.4));
    if (src && src !== t) src.dmgDealt += d;
    this.dmgAcc.set(t.id, (this.dmgAcc.get(t.id) ?? 0) + d);
    this.lastKind.set(t.id, kind);
  }
  private lastKind = new Map<number, DamageKind>();
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
    const spikes = att.weapons.find((w) => w.def.kind === "spikes");
    if (!spikes || att.ramCd > 0 || rel < 90) return;
    // só se bater com a frente
    if (Math.abs(angDiff(Math.atan2(ny, nx), att.angle)) > spikes.def.arc) return;
    att.ramCd = spikes.def.cooldown;
    this.fx.push({ t: "sfx", name: "ram_hit", x: tgt.x, y: tgt.y, power: Math.min(1, rel / 400) });
    this.damage(tgt, rel * spikes.def.damage * (att.stats.totalMass / 70), "phys", att);
    this.fx.push({ t: "sparks", x: (att.x + tgt.x) / 2, y: (att.y + tgt.y) / 2, angle: att.angle + Math.PI, n: 10 });
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
      if (!tgt.dead) {
        const want = Math.atan2(tgt.y - m.y, tgt.x - m.x);
        m.angle = normAng(m.angle + clamp(angDiff(want, m.angle), -1, 1) * 1.6 * dt);
        const sp = Math.min(640, Math.hypot(m.vx, m.vy) + 500 * dt);
        m.vx = Math.cos(m.angle) * sp; m.vy = Math.sin(m.angle) * sp;
      }
      m.x += m.vx * dt; m.y += m.vy * dt;
      this.fx.push({ t: "trail", x: m.x - Math.cos(m.angle) * 10, y: m.y - Math.sin(m.angle) * 10 });
      let boom = m.life <= 0 || !isOpen(this.arena, m);
      for (const r of this.robots) {
        if (r.id === m.owner || r.dead) continue;
        if (Math.hypot(r.x - m.x, r.y - m.y) < r.stats.radius + 6) {
          this.damage(r, m.damage, "phys", this.robots[m.owner]);
          r.vx += m.vx * 0.25; r.vy += m.vy * 0.25;
          boom = true;
        }
      }
      if (boom) this.fx.push({ t: "explosion", x: m.x, y: m.y, big: false }, { t: "shake", power: 6 });
      else keep.push(m);
    }
    this.missiles = keep;
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
    weapons: build.weapons.filter(Boolean).map((wid) => ({ def: scaledWeapon(weaponById[wid], levelOf(build, wid)), cd: 0, active: false, anim: 0, prevFire: false, pendingHit: 0, hitT: 9 })),
    dead: false, wheelSpin: 0, dmgDealt: 0,
    speedScale: 1, boostCd: 0, boostT: 0, boostDir: angle, prevBoost: false, revT: 0, uTurn: false, uTurnTarget: 0, uTurnDir: 1, uTurnDone: false,
  };
}

/** Posição local (relativa ao centro, robô olhando para +x) do slot de arma. */
export function mountLocal(i: number, n: number, radius: number, kind: string) {
  if (kind === "shock") return { x: -radius * 0.15, y: n === 1 ? 0 : (i - (n - 1) / 2) * radius * 0.5 };
  if (kind === "spikes" || kind === "flipper") return { x: radius * 0.92, y: 0 };
  const spread = n === 1 ? 0 : (i - (n - 1) / 2) * (radius * 1.25) / Math.max(1, n - 1);
  return { x: radius * 0.92, y: spread };
}

export function mountPoint(r: Robot, i: number, n: number) {
  const l = mountLocal(i, n, r.stats.radius, r.weapons[i].def.kind);
  const c = Math.cos(r.angle), s = Math.sin(r.angle);
  return { x: r.x + l.x * c - l.y * s, y: r.y + l.x * s + l.y * c };
}

function inArc(r: Robot, t: Robot, from: { x: number; y: number }, range: number, arc: number) {
  const dx = t.x - from.x, dy = t.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d - t.stats.radius > range) return false;
  const ang = Math.abs(angDiff(Math.atan2(dy, dx), r.angle));
  // tolerância pelo tamanho do alvo
  return ang < arc + Math.atan2(t.stats.radius, Math.max(d, 1)) * 0.8;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const normAng = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const angDiff = (a: number, b: number) => normAng(a - b);
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
