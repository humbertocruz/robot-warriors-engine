import { describe, expect, test } from "bun:test";
import { dazeError, emptyInput, Match, type Input } from "../src/engine";
import { Brain } from "../src/ai";
import { type RobotBuild } from "../src/parts";
import { ProgramBrain, TEMPLATES, readSensors, type Program } from "../src/brain-blocks";

const bot = (weapons: string[], armor = "steel"): RobotBuild => ({ name: "T", color: 0, chassis: "tita", drive: "treads", armor, weapons });
const STEP = 1 / 60;
const press = (slot: number) => (k: number) => { const i = emptyInput(); i.fire[slot] = k === 0; return i; };

/** r0 parado em (280, 380) olhando para a direita; r1 a `dist` px na direção `dir`. */
function arena(a: RobotBuild, b: RobotBuild, dir: number, dist: number, pin = true) {
  const m = new Match(a, b, { arena: "classica" });
  const [r0, r1] = m.robots;
  const place = () => {
    r0.x = 280; r0.y = 380; r0.angle = 0; r0.vx = r0.vy = 0;
    r1.x = 280 + Math.cos(dir) * dist; r1.y = 380 + Math.sin(dir) * dist; r1.vx = r1.vy = 0;
  };
  place();
  const run = (n: number, i0: (k: number) => Input = () => emptyInput(), i1: (k: number) => Input = () => emptyInput()) => {
    for (let k = 0; k < n; k++) { m.step(STEP, [i0(k), i1(k)]); if (pin) place(); }
  };
  return { m, r0, r1, run };
}

describe("Pulso Desnorteador", () => {
  test("desnorteia quem está na frente, não quem está atrás", () => {
    const front = arena(bot(["saw", "disruptor"]), bot(["saw"]), 0, 120);
    front.run(2, press(1));
    expect(front.r1.dazed).toBeGreaterThan(1.4);
    const back = arena(bot(["saw", "disruptor"]), bot(["saw"]), Math.PI, 120);
    back.run(2, press(1));
    expect(back.r1.dazed).toBe(0);
  });

  test("Aterramento e Blindagem Isolante encurtam o efeito", () => {
    const dur = (target: RobotBuild) => { const a = arena(bot(["saw", "disruptor"]), target, 0, 120); a.run(1, press(1)); return a.r1.dazed; };
    const plain = dur(bot(["saw"]));
    expect(dur(bot(["saw", "grounding"]))).toBeCloseTo(plain * 0.4, 1);
    expect(dur(bot(["saw"], "isolante"))).toBeLessThan(plain * 0.75);
  });

  test("Aterramento também reduz a paralisia do choque", () => {
    const stun = (target: RobotBuild) => { const a = arena(bot(["shock"]), target, 0, 100); a.run(1, press(0)); return a.r1.stun; };
    // o alvo já descontou um passo da paralisia no mesmo passo do choque
    expect(stun(bot(["saw", "grounding"])) + STEP).toBeCloseTo((stun(bot(["saw"])) + STEP) * 0.4, 6);
  });

  test("desnorteado, os sensores erram onde o inimigo está, sempre do mesmo jeito", () => {
    const read = () => {
      const a = arena(bot(["saw"]), bot(["saw", "disruptor"]), 0, 120);
      a.r1.angle = Math.PI;
      a.run(1, undefined, press(1));
      return { s: readSensors(a.m, a.r0, a.r1).s, err: dazeError(a.m, a.r0) };
    };
    const x = read();
    expect(x.s.dazed).toBe(1);
    expect(Math.abs(x.err.angle) + Math.abs(x.err.dist - 1)).toBeGreaterThan(0.05);
    expect(read()).toEqual(x);
  });

  test("passado o efeito, os sensores voltam ao normal", () => {
    const a = arena(bot(["saw"]), bot(["saw", "disruptor"]), 0, 120);
    a.r1.angle = Math.PI;
    a.run(1, undefined, press(1));
    a.run(60 * 4);
    expect(a.r0.dazed).toBe(0);
    expect(readSensors(a.m, a.r0, a.r1).s.angle).toBeCloseTo(0, 6);
  });
});

describe("Fumaça", () => {
  test("corta a linha de visão (sensor 'Vejo o inimigo')", () => {
    const a = arena(bot(["saw", "smoke"]), bot(["saw"]), 0, 400);
    expect(readSensors(a.m, a.r1, a.r0).s.sight).toBe(1);
    a.run(1, press(1));
    expect(a.m.clouds.length).toBe(1);
    expect(readSensors(a.m, a.r1, a.r0).s.sight).toBe(0);
    a.run(60 * 4);
    expect(a.m.clouds.length).toBe(0);
    expect(readSensors(a.m, a.r1, a.r0).s.sight).toBe(1);
  });

  test("míssil perde o alvo na fumaça", () => {
    // r1 atira um pouco para o lado de r0: sem fumaça o míssil vira na direção dele; com fumaça segue reto
    const turn = (smoke: boolean) => {
      const a = arena(bot(["saw", "smoke"]), bot(["missile"]), 0, 420);
      a.r1.angle = Math.PI - 0.35;
      a.run(1, smoke ? press(1) : undefined, press(0));
      const start = a.m.missiles[0].angle;
      a.run(20);
      return Math.abs(a.m.missiles[0].angle - start);
    };
    expect(turn(false)).toBeGreaterThan(0.1);
    expect(turn(true)).toBe(0);
  });

  test("não dá para desnortear de novo logo em seguida", () => {
    const a = arena(bot(["saw", "disruptor"]), bot(["saw"]), 0, 120);
    a.run(1, press(1));
    const first = a.r1.dazed;
    a.run(Math.ceil(first / STEP) + 5); // acabou o efeito
    expect(a.r1.dazed).toBe(0);
    a.r0.weapons[1].cd = 0; a.r0.energy = 100;
    a.run(1, press(1));
    expect(a.r1.dazed).toBe(0); // ainda no respiro
    a.run(60 * 3);
    a.r0.weapons[1].cd = 0; a.r0.energy = 100;
    a.run(1, press(1));
    expect(a.r1.dazed).toBeGreaterThan(0);
  });

  test("ação 'Soltar fumaça' do cérebro", () => {
    const p: Program = { id: "p", name: "p", rules: [{ id: "r", on: true, conds: [], acts: [{ a: "smoke", v: 0 }] }] };
    const m = new Match(bot(["saw", "smoke"]), bot(["saw"]), { arena: "classica" });
    expect(new ProgramBrain(p).think(m, m.robots[0], m.robots[1], STEP).fire).toEqual([false, true, false]);
  });
});

describe("determinismo e balanço", () => {
  test("luta de cérebros com desnorteador e fumaça dá sempre o mesmo resultado", () => {
    const once = () => {
      const m = new Match(bot(["saw", "disruptor", "smoke"]), bot(["missile", "flame", "grounding"]), { arena: "fabrica" });
      const A = new ProgramBrain(TEMPLATES[0].make()), B = new ProgramBrain(TEMPLATES[1].make());
      for (let k = 0; k < 6000 && !m.over; k++) m.step(STEP, [A.think(m, m.robots[0], m.robots[1], STEP), B.think(m, m.robots[1], m.robots[0], STEP)]);
      return [m.winner, m.time, m.robots.map((r) => r.hp)];
    };
    expect(once()).toEqual(once());
  });

  const ref = bot(["saw", "flame", "missile"]);
  for (const part of ["disruptor", "smoke", "grounding"]) {
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
