import { clearance, lineOfSight, type Pt } from "./arenas";
import { angDiff, dazeError, dist, emptyInput, isBroken, mountPoint, weaponAim, type Input, type Match, type Robot } from "./engine";
import { isSupport } from "./parts";

/** IA simples baseada em estados, parametrizada por dificuldade (0..1). */
export class Brain {
  private wanderT = 0;
  private wanderA = 0;
  private reaction = 0;
  private aimNoise = 0;
  private retreat = 0;
  private contactT = 0;
  private detourSide = 0; // lado escolhido para contornar obstáculo
  private detourT = 0;
  private holdTimer = 0;
  private fireIntent: boolean[] = [false, false, false];

  constructor(private diff: number) {}

  think(m: Match, me: Robot, foe: Robot, dt: number): Input {
    const inp = emptyInput();
    if (me.dead || foe.dead) return inp;
    const d = dist(me, foe);
    const kinds = me.weapons.map((w) => w.def.kind);
    const ranged = kinds.includes("missile") && !kinds.some((k) => k === "saw" || k === "drill" || k === "hammer");
    // desnorteado: erra para onde o inimigo está; na fumaça, não sabe onde ele está
    const hidden = m.smokeBetween(me, foe);
    const toFoe = Math.atan2(foe.y - me.y, foe.x - me.x) + dazeError(m, me).angle + (hidden ? Math.sin(m.time * 1.3 + me.id) * 1.2 : 0);

    // reação lenta = decide menos vezes; ruído de mira cai com dificuldade
    this.reaction -= dt;
    if (this.reaction <= 0) {
      this.reaction = 0.35 - this.diff * 0.28;
      this.aimNoise = (Math.random() - 0.5) * (1 - this.diff) * 0.9;
      // recua quando com pouca vida/energia (só IAs espertas)
      if (this.diff > 0.5 && me.energy < 20 && Math.random() < this.diff) this.retreat = 1.2;
    }

    // não fica grudado: depois de um tempo em contato, recua um pouco (IAs fracas recuam mais)
    const touching = d < me.stats.radius + foe.stats.radius + 10;
    this.contactT = touching ? this.contactT + dt : Math.max(0, this.contactT - dt * 2);
    if (this.retreat <= 0 && this.contactT > 1.2 + this.diff * 1.8 && Math.random() < 1 - this.diff * 0.5) {
      this.retreat = 0.5 + Math.random() * 0.5;
      this.contactT = 0;
    }

    // sem linha de visão: vai por um ponto de passagem
    const nav = this.navTarget(m, me, foe);
    let heading = nav ? Math.atan2(nav.y - me.y, nav.x - me.x) : toFoe + this.aimNoise;
    let mag = 1;

    // evita cantos com espinhos e o vent ativo
    const avoid = this.hazardAvoid(m, me);
    if (this.retreat > 0) {
      this.retreat -= dt;
      heading = toFoe + Math.PI + Math.sin(m.time * 2) * 0.8;
    } else if (ranged && d < 260) {
      heading = toFoe + Math.PI * 0.6 * (me.id ? 1 : -1); // circula mantendo distância
    } else if (ranged && d < 420) {
      heading = toFoe; mag = 0.2;
    }

    // fora do alcance, perambula um pouco (IAs fracas)
    this.wanderT -= dt;
    if (this.wanderT <= 0) { this.wanderT = 1 + Math.random() * 2; this.wanderA = (Math.random() - 0.5) * 1.6 * (1 - this.diff); }
    heading += this.wanderA * (d > 300 ? 1 : 0.2);

    if (avoid !== null) { heading = avoid; mag = 1; }
    heading = this.steer(m, me, heading, toFoe, d);

    inp.heading = heading;
    inp.headingMag = mag * (0.75 + this.diff * 0.25);

    // turbo: IAs espertas usam para fugir ou para fechar distância
    const canBoost = me.boostCd <= 0 && me.energy > 45 && this.diff > 0.45;
    inp.boost = canBoost && Math.random() < dt * 2 * this.diff && ((this.retreat > 0) || (!ranged && d > 380));

    // armas (cada uma mede a mira pelo próprio lado do robô)
    me.weapons.forEach((ws, i) => {
      const w = ws.def;
      const facing = Math.abs(angDiff(toFoe, weaponAim(me, i)));
      const mp = mountPoint(me, i);
      const dm = Math.hypot(foe.x - mp.x, foe.y - mp.y) - foe.stats.radius;
      let want = false;
      switch (w.kind) {
        case "saw": case "drill": want = dm < w.range + 20 && facing < 0.8; break;
        case "flame": want = dm < w.range && facing < 0.5; break;
        case "shock": want = d < w.range + me.stats.radius + foe.stats.radius - 5 && ws.cd <= 0; break;
        case "hammer": want = dm < w.range * 0.9 && facing < 0.5 && ws.cd <= 0; break;
        case "flipper": want = dm < w.range && facing < 0.6 && ws.cd <= 0; break;
        case "missile": want = !hidden && facing < 0.25 + (1 - this.diff) * 0.3 && d > 120 && ws.cd <= 0; break;
        case "disruptor": want = dm < w.range - 10 && facing < 0.5 && ws.cd <= 0 && foe.dazed <= 0; break;
        // mina: solta onde o inimigo vai passar (perto do ponto de queda), ou atrás quando foge
        case "mines": {
          const reach = w.power ?? 70;
          const lx = mp.x + Math.cos(weaponAim(me, i)) * reach, ly = mp.y + Math.sin(weaponAim(me, i)) * reach;
          const close = Math.hypot(foe.x - lx, foe.y - ly) < 150 + foe.stats.radius;
          const mine = m.mines.filter((mi) => mi.owner === me.id).length;
          want = ws.cd <= 0 && (close || (this.retreat > 0 && facing > 2.2)) && (mine < 3 || this.diff > 0.6);
          break;
        }
        // fumaça para fugir de mísseis ou quando está apanhando
        case "smoke": {
          // antes do míssil sair: inimigo com lança-mísseis, longe e mirando em mim
          const aiming = foe.weapons.some((fw, k) => fw.def.kind === "missile" && fw.cd < 0.4 && Math.abs(angDiff(Math.atan2(me.y - foe.y, me.x - foe.x), weaponAim(foe, k))) < 0.35);
          want = ws.cd <= 0 && (this.retreat > 0 || (aiming && d > 220) || m.missiles.some((mi) => mi.owner !== me.id && Math.hypot(mi.x - me.x, mi.y - me.y) < 420));
          break;
        }
        // conserta longe do inimigo (ou com ele paralisado), com vida baixa ou arma quebrada
        case "repair": want = (d > 170 || foe.stun > 0.3) && ((me.hp < me.stats.hp * 0.55 && me.repairLeft > 1) || me.weapons.some(isBroken)); break;
        // liga o escudo quando o inimigo encosta do lado dele
        case "shield": want = d < me.stats.radius + foe.stats.radius + 90 && facing < w.arc + 0.3; break;
      }
      // IA fraca hesita
      if (want && Math.random() > 0.35 + this.diff * 0.65) want = false;
      if (w.mode === "press") {
        // gera borda de subida: alterna
        inp.fire[i] = want && !this.fireIntent[i];
        this.fireIntent[i] = inp.fire[i];
      } else if (isSupport(w.kind)) {
        inp.fire[i] = want;
      } else {
        if (want) this.holdTimer = 0.25;
        inp.fire[i] = want || (this.holdTimer > 0 && w.mode === "hold");
      }
    });
    this.holdTimer -= dt;
    return inp;
  }

  private wp: Pt | null = null;
  private wpT = 0;

  private navTarget(m: Match, me: Robot, foe: Robot): Pt | null {
    const wps = m.arena.waypoints;
    if (!wps.length || lineOfSight(m.walls, me, foe)) { this.wp = null; return null; }
    this.wpT -= 1 / 60;
    if (this.wp && this.wpT > 0 && Math.hypot(this.wp.x - me.x, this.wp.y - me.y) > 50) return this.wp;
    let best: Pt | null = null, bestScore = Infinity;
    for (const w of wps) {
      if (Math.hypot(w.x - me.x, w.y - me.y) < 50) continue;
      if (!lineOfSight(m.walls, me, w)) continue;
      const score = Math.hypot(w.x - me.x, w.y - me.y) + Math.hypot(foe.x - w.x, foe.y - w.y) + (lineOfSight(m.walls, w, foe) ? 0 : 600);
      if (score < bestScore) { bestScore = score; best = w; }
    }
    this.wp = best;
    this.wpT = 0.6;
    return best;
  }

  private hazardAvoid(m: Match, me: Robot): number | null {
    const rad = me.stats.radius;
    // minas armadas (as dele e as do inimigo): IAs fracas às vezes nem percebem
    if (this.diff > 0.2) {
      for (const mi of m.mines) {
        if (mi.armed && Math.hypot(me.x - mi.x, me.y - mi.y) < rad + 12 + 26 + 40 * this.diff) return Math.atan2(me.y - mi.y, me.x - mi.x);
      }
    }
    for (const z of m.arena.spikes) {
      if (Math.hypot(me.x - z.x, me.y - z.y) < z.r + rad + 40 * this.diff) return Math.atan2(me.y - z.y, me.x - z.x);
    }
    if (this.diff > 0.35) {
      for (let i = 0; i < m.arena.vents.length; i++) {
        const v = m.arena.vents[i], st = m.vent(i);
        if ((st.active || st.warn) && Math.hypot(me.x - v.x, me.y - v.y) < v.r + rad + 20) return Math.atan2(me.y - v.y, me.x - v.x);
      }
    }
    return null;
  }

  /** Contorna paredes e obstáculos: testa pontos à frente e gira até achar caminho livre. */
  private steer(m: Match, me: Robot, heading: number, toFoe: number, foeDist: number): number {
    const need = me.stats.radius + 6;
    // só olha até o adversário: a parede atrás dele não importa
    const reach = Math.min(110, foeDist - 20);
    if (reach < 30 && Math.abs(angDiff(heading, toFoe)) < 0.5) return heading;
    const probes = reach < 55 ? [reach] : [55, reach];
    const free = (a: number) => probes.every((d) => clearance(m.arena, m.walls, { x: me.x + Math.cos(a) * d, y: me.y + Math.sin(a) * d }) > need);
    this.detourT -= 1 / 60;
    if (free(heading) && this.detourT <= 0) return heading;
    // mantém o mesmo lado por um tempo para não ficar indeciso na frente do obstáculo
    if (this.detourT <= 0) {
      // geralmente pelo lado do adversário, às vezes pelo outro: quebra perseguições em círculo
      const toward = angDiff(toFoe, heading) >= 0 ? 1 : -1;
      this.detourSide = Math.random() < 0.65 ? toward : -toward;
      this.detourT = 0.5 + Math.random() * 0.6;
    }
    for (const k of [0.45, 0.9, 1.35, 1.8, 2.3, 2.8]) {
      if (free(heading + this.detourSide * k)) return heading + this.detourSide * k;
    }
    this.detourSide = -this.detourSide;
    return heading + this.detourSide * 1.35;
  }
}
