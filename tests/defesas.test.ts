import { describe, expect, test } from "bun:test";
import { emptyInput, isBroken, Match, type Input } from "../src/engine";
import { Brain } from "../src/ai";
import { REPAIR_CAP, validateBuild, type Mount, type RobotBuild } from "../src/parts";
import { ProgramBrain, TEMPLATES, readSensors, type Program } from "../src/brain-blocks";
import { RANKING_ROBOTS, runChallenge } from "../src/ranking";

const bot = (weapons: string[], mounts?: Mount[], armor = "steel"): RobotBuild => ({ name: "T", color: 0, chassis: "tita", drive: "treads", armor, weapons, mounts });
const STEP = 1 / 60;

/** Deixa os dois parados em (280, 380) e a `dist` px na direção `dir`, e roda `n` passos. */
function arena(a: RobotBuild, b: RobotBuild, dir: number, dist: number) {
  const m = new Match(a, b, { arena: "classica" });
  const [r0, r1] = m.robots;
  const place = () => {
    r0.x = 280; r0.y = 380; r0.angle = 0; r0.vx = r0.vy = 0;
    r1.x = 280 + Math.cos(dir) * dist; r1.y = 380 + Math.sin(dir) * dist; r1.angle = dir + Math.PI; r1.vx = r1.vy = 0;
  };
  place();
  const run = (n: number, i0: (k: number) => Input = () => emptyInput(), i1: (k: number) => Input = () => emptyInput()) => {
    for (let k = 0; k < n; k++) { m.step(STEP, [i0(k), i1(k)]); place(); }
  };
  return { m, r0, r1, run };
}
const hold = (...slots: number[]) => () => { const i = emptyInput(); for (const s of slots) i.fire[s] = true; return i; };

describe("integridade das armas", () => {
  test("golpe de frente desgasta a arma da frente; a de trás fica inteira", () => {
    // r1 (serra na frente) encara r0 e serra; r0 tem uma arma na frente e outra atrás
    const { r0, run } = arena(bot(["hammer", "flame"], ["front", "back"], "titanio"), bot(["saw"]), 0, 75);
    run(240, undefined, hold(0));
    expect(r0.weapons[0].integrity).toBeLessThan(100);
    expect(r0.weapons[1].integrity).toBe(100);
  });

  test("arma quebrada não funciona", () => {
    const { m, r0, r1, run } = arena(bot(["saw"]), bot(["saw"]), 0, 75);
    r0.weapons[0].integrity = 0;
    expect(isBroken(r0.weapons[0])).toBe(true);
    const hp = r1.hp;
    run(60, hold(0));
    expect(r1.hp).toBe(hp);
    expect(readSensors(m, r0, r1).s.ready1).toBe(0);
  });

  test("fogo e choque não desgastam arma", () => {
    const { r0, run } = arena(bot(["saw"]), bot(["flame", "shock"]), 0, 110);
    run(180, undefined, (k) => { const i = emptyInput(); i.fire[0] = true; i.fire[1] = k % 40 === 0; return i; });
    expect(r0.weapons[0].integrity).toBe(100);
  });
});

describe("Kit de Reparo", () => {
  test("conserta a vida até o limite da luta, nunca acima da vida máxima", () => {
    const { r0, run } = arena(bot(["saw", "repair"]), bot(["saw"]), 0, 400);
    r0.hp = 10;
    run(60 * 40, hold(1)); // 40 s consertando
    const cap = r0.stats.hp * REPAIR_CAP;
    expect(r0.hp).toBeCloseTo(10 + cap, 3);
    expect(r0.repairLeft).toBeCloseTo(0, 6);
    r0.hp = r0.stats.hp - 1;
    run(60, hold(1));
    expect(r0.hp).toBeLessThanOrEqual(r0.stats.hp);
  });

  test("conserta a arma mais danificada e tira ela de quebrada", () => {
    const { r0, run } = arena(bot(["saw", "repair", "flame"]), bot(["saw"]), 0, 400);
    r0.weapons[2].integrity = 0; r0.weapons[0].integrity = 50;
    run(60 * 3, hold(1));
    expect(r0.weapons[2].integrity).toBeGreaterThan(0);
    expect(r0.weapons[0].integrity).toBe(50);
  });

  test("paralisado não conserta", () => {
    const { r0, run } = arena(bot(["saw", "repair"]), bot(["saw"]), 0, 400);
    r0.hp = 50;
    run(30, (k) => { r0.stun = 1; return hold(1)(); });
    expect(r0.hp).toBe(50);
  });

  test("consertando anda devagar", () => {
    const speed = (fire: boolean) => {
      const m = new Match(bot(["saw", "repair"]), bot(["saw"]), { arena: "classica" });
      const r = m.robots[0];
      r.x = 280; r.y = 380; r.angle = 0; r.hp = 100;
      for (let k = 0; k < 40; k++) { const i = emptyInput(); i.throttle = 1; i.fire[1] = fire; m.step(STEP, [i, emptyInput()]); }
      return Math.hypot(r.vx, r.vy);
    };
    expect(speed(true)).toBeLessThan(speed(false) * 0.6);
  });
});

describe("Escudo", () => {
  const sawDamage = (shieldMount: Mount, attackerDir: number, on: boolean) => {
    const { r0, run } = arena(bot(["hammer", "shield"], ["front", shieldMount]), bot(["saw"]), attackerDir, 75);
    const hp = r0.hp;
    run(120, on ? hold(1) : undefined, hold(0));
    return hp - r0.hp;
  };
  test("ligado, bloqueia o golpe do lado dele", () => {
    const off = sawDamage("front", 0, false), on = sawDamage("front", 0, true);
    expect(off).toBeGreaterThan(0);
    expect(on).toBeLessThan(off * 0.35);
  });
  test("não protege os outros lados", () => {
    expect(sawDamage("front", Math.PI, true)).toBeCloseTo(sawDamage("front", Math.PI, false), 6);
  });
  test("escudo atrás protege as costas", () => {
    expect(sawDamage("back", Math.PI, true)).toBeLessThan(sawDamage("back", Math.PI, false) * 0.35);
  });
});

describe("Antimíssil", () => {
  /** r1 dispara mísseis em r0 por 10 s; devolve quantos mísseis acertaram. */
  const volley = (defender: RobotBuild) => {
    const { r0, run } = arena(defender, bot(["missile"]), 0, 420);
    let hits = 0, last = r0.hp;
    run(600, undefined, (k) => { if (r0.hp < last - 5) hits++; last = r0.hp; const i = emptyInput(); i.fire[0] = k % 20 < 10; return i; });
    return hits;
  };
  test("derruba parte dos mísseis que chegam perto", () => {
    const without = volley(bot(["saw"]));
    const withAm = volley(bot(["saw", "antimissile"]));
    expect(without).toBeGreaterThan(2);
    expect(withAm).toBeLessThan(without);
  });
  test("sensor 'míssil vindo em mim'", () => {
    const { m, r0, r1, run } = arena(bot(["saw"]), bot(["missile"]), 0, 420);
    run(1, undefined, hold(0));
    run(6);
    expect(readSensors(m, r0, r1).s.missile).toBe(1);
    expect(readSensors(m, r1, r0).s.missile).toBe(0);
  });
});

describe("cérebro e ranking", () => {
  test("ações Consertar e Ligar escudo acionam as peças; 'atacar com todas' não", () => {
    const p = (a: string, v = 0): Program => ({ id: "p", name: "p", rules: [{ id: "r", on: true, conds: [], acts: [{ a: a as never, v }] }] });
    const m = new Match(bot(["saw", "shield", "repair"]), bot(["saw"]), { arena: "classica" });
    const [r0, r1] = m.robots;
    expect(new ProgramBrain(p("shield")).think(m, r0, r1, STEP).fire).toEqual([false, true, false]);
    expect(new ProgramBrain(p("repair")).think(m, r0, r1, STEP).fire).toEqual([false, false, true]);
    expect(new ProgramBrain(p("fire", 0)).think(m, r0, r1, STEP).fire).toEqual([true, false, false]);
  });

  test("lutas com defesas são determinísticas (3 execuções iguais)", () => {
    const runs = [0, 1, 2].map(() => [runChallenge(TEMPLATES[0].make(), "defensor", "fabrica", "atirador"), runChallenge(TEMPLATES[2].make(), "tanque", "cruz", "lutador")]);
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
    const vs = (): [number, number] => {
      const m = new Match(bot(["saw", "antimissile"]), bot(["missile", "flame"]), { arena: "coliseu" });
      const A = new ProgramBrain(TEMPLATES[0].make()), B = new ProgramBrain(TEMPLATES[1].make());
      for (let k = 0; k < 6000 && !m.over; k++) m.step(STEP, [A.think(m, m.robots[0], m.robots[1], STEP), B.think(m, m.robots[1], m.robots[0], STEP)]);
      return [m.robots[0].hp, m.robots[1].hp];
    };
    expect(vs()).toEqual(vs());
  });

  test("Defensor é uma montagem válida e só peças de defesa não bastam", () => {
    expect(validateBuild(RANKING_ROBOTS.find((r) => r.id === "defensor")!.build)).toBeNull();
    expect(validateBuild(bot(["shield", "repair"]))).not.toBeNull();
  });
});

describe("balanço (IA x IA)", () => {
  // Cada peça nova no 3º slot, contra uma montagem de referência com mísseis (contra que ela deveria
  // ajudar ou não). Nenhuma pode ganhar quase sempre. O martelo fica de fora da referência: com a
  // paralisia dele, quem não tem martelo perde quase sempre, e o teste não mediria a peça nova.
  const ref = bot(["saw", "flame", "missile"]);
  for (const part of ["repair", "shield", "antimissile"]) {
    test(`${part} não decide a luta sozinha`, () => {
      const N = 40;
      let wins = 0;
      for (let k = 0; k < N; k++) {
        const m = new Match(bot(["saw", "flame", part]), ref, { arena: "classica" });
        const a = new Brain(0.7), b = new Brain(0.7);
        for (let t = 0; t < 120 * 60 && !(m.over && m.endDelay <= 0); t++) m.update(STEP, [a.think(m, m.robots[0], m.robots[1], STEP), b.think(m, m.robots[1], m.robots[0], STEP)]);
        if (m.winner === 0) wins++;
      }
      console.log(`${part}: ${wins}/${N} contra serra + fogo + mísseis`);
      expect(wins / N).toBeLessThanOrEqual(0.8);
    });
  }
});
