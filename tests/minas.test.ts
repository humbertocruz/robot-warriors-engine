import { describe, expect, test } from "bun:test";
import { emptyInput, Match, MINE, type Input } from "../src/engine";
import { Brain } from "../src/ai";
import { readSensors } from "../src/brain-blocks";
import { scaledWeapon, validateBuild, weaponById, type Mount, type RobotBuild } from "../src/parts";
import { unlockStageOf } from "../src/story";

const bot = (weapons: string[], mounts?: Mount[]): RobotBuild => ({ name: "T", color: 0, chassis: "striker", drive: "wheels", armor: "steel", weapons, mounts });
const STEP = 1 / 60;
const press = (slot: number) => (k: number) => { const i = emptyInput(); i.fire[slot] = k === 0; return i; };
const idle = () => emptyInput();

/** Robôs parados em lugares fixos (a física não mexe neles entre os passos). */
function setup(a: RobotBuild, b: RobotBuild, p0 = { x: 300, y: 360 }, p1 = { x: 800, y: 360 }) {
  const m = new Match(a, b, { arena: "classica" });
  const [r0, r1] = m.robots;
  const pin = () => {
    r0.x = p0.x; r0.y = p0.y; r0.angle = 0; r0.vx = r0.vy = 0;
    r1.x = p1.x; r1.y = p1.y; r1.angle = Math.PI; r1.vx = r1.vy = 0;
  };
  pin();
  const run = (n: number, i0: (k: number) => Input = idle, i1: (k: number) => Input = idle, keep = true) => {
    for (let k = 0; k < n; k++) { m.step(STEP, [i0(k), i1(k)]); if (keep) pin(); }
  };
  return { m, r0, r1, run, p0, p1 };
}

describe("Lança-minas", () => {
  test("peça válida, liberada na fase 44", () => {
    expect(weaponById.mines.kind).toBe("mines");
    expect(validateBuild(bot(["mines"]))).toBeNull();
    expect(unlockStageOf("mines")).toBe(44);
  });

  test("arremessa a 70 px na direção do lado da arma e arma em 0,8 s", () => {
    const { m, r0, run } = setup(bot(["mines"], ["back"]), bot([]));
    run(1, press(0));
    expect(m.mines.length).toBe(1);
    const mi = m.mines[0];
    // arma atrás: a mina cai atrás do robô (x menor)
    expect(mi.x).toBeLessThan(r0.x - 50);
    expect(mi.armed).toBe(false);
    run(Math.round(MINE.arm / STEP) + 2);
    expect(m.mines[0].armed).toBe(true);
  });

  test("não explode antes de armar; armada, explode no inimigo", () => {
    const { m, r1, run, p1 } = setup(bot(["mines"]), bot([]), { x: 300, y: 360 }, { x: 900, y: 360 });
    run(1, press(0));
    const mi = m.mines[0];
    // inimigo em cima da mina logo depois de soltar: ainda desarmada
    p1.x = mi.x; p1.y = mi.y;
    run(10);
    expect(m.mines.length).toBe(1);
    expect(r1.hp).toBe(r1.stats.hp);
    // depois de armar, explode e fere com o dano cheio (menos a blindagem)
    run(Math.round(MINE.arm / STEP));
    expect(m.mines.length).toBe(0);
    const expected = weaponById.mines.damage * (1 - r1.stats.reduction);
    expect(r1.stats.hp - r1.hp).toBeCloseTo(expected, 1);
  });

  test("explode no dono também", () => {
    const { m, r0, run, p0 } = setup(bot(["mines"]), bot([]));
    run(1, press(0));
    const mi = m.mines[0];
    run(Math.round(MINE.arm / STEP) + 2);
    p0.x = mi.x; p0.y = mi.y;
    run(2);
    expect(m.mines.length).toBe(0);
    expect(r0.hp).toBeLessThan(r0.stats.hp);
  });

  test("o dano cai com a distância (metade na borda do raio)", () => {
    const { m, r1, run, p1 } = setup(bot(["mines"]), bot([]), { x: 300, y: 360 }, { x: 900, y: 360 });
    run(1, press(0));
    run(Math.round(MINE.arm / STEP) + 2);
    const mi = m.mines[0];
    // o robô 1 encosta no gatilho, a uns 40 px do centro
    p1.x = mi.x + r1.stats.radius + 10; p1.y = mi.y;
    run(2);
    const lost = r1.stats.hp - r1.hp;
    const full = weaponById.mines.damage * (1 - r1.stats.reduction);
    expect(lost).toBeLessThan(full);
    expect(lost).toBeGreaterThan(full * 0.5);
  });

  test("explosão em cadeia, limite de 3 e sumiço depois de 20 s", () => {
    const { m, r0, run, p0 } = setup(bot(["mines"]), bot([]));
    // 4 minas em lugares diferentes: a 1ª some
    const spots = [{ x: 200, y: 300 }, { x: 240, y: 300 }, { x: 280, y: 300 }, { x: 600, y: 500 }];
    for (const s of spots) {
      p0.x = s.x - 90; p0.y = s.y; r0.x = p0.x; r0.y = p0.y;
      r0.weapons[0].cd = 0; r0.energy = 100;
      run(1, press(0));
      run(1); // solta o botão (a arma dispara na borda de subida)
    }
    expect(m.mines.length).toBe(MINE.max);
    // a mais antiga (perto de spots[0]) foi a que sumiu
    expect(m.mines.some((mi) => Math.abs(mi.y - spots[0].y) < 1 && mi.x < spots[1].x - 20)).toBe(false);
    // as duas primeiras que sobraram estão a ~40 px uma da outra: uma explosão leva a outra junto
    run(Math.round(MINE.arm / STEP) + 2);
    const [a] = m.mines;
    p0.x = a.x; p0.y = a.y; r0.x = a.x; r0.y = a.y;
    run(1);
    expect(m.mines.length).toBe(1); // sobrou só a que estava longe
    // a última some sozinha depois de 20 s, sem explodir
    p0.x = 900; p0.y = 360;
    const hp = r0.hp;
    run(Math.round(MINE.life / STEP) + 5);
    expect(m.mines.length).toBe(0);
    expect(r0.hp).toBe(hp);
  });

  test("míssil detona a mina", () => {
    const { m, run } = setup(bot(["mines"]), bot([]));
    run(1, press(0));
    const mi = m.mines[0];
    m.missiles.push({ x: mi.x - 30, y: mi.y, vx: 600, vy: 0, owner: 1, life: 0.01, angle: 0, damage: 15 });
    run(1);
    expect(m.mines.length).toBe(0);
  });

  test("nível aumenta o dano e diminui a recarga, como nas outras armas", () => {
    const w = scaledWeapon(weaponById.mines, 3);
    expect(w.damage).toBeGreaterThan(weaponById.mines.damage);
    expect(w.cooldown).toBeLessThan(weaponById.mines.cooldown);
    expect(w.power).toBe(weaponById.mines.power);
  });

  test("sensores: minhas minas e perigo contam as minas armadas", () => {
    const { m, r0, r1, run } = setup(bot(["mines"]), bot([]));
    run(1, press(0));
    expect(readSensors(m, r0, r1).s.myMines).toBe(1);
    const before = readSensors(m, r0, r1).s.hazard;
    run(Math.round(MINE.arm / STEP) + 2);
    expect(readSensors(m, r0, r1).s.hazard).toBeLessThan(before);
  });

  test("luta com minas é determinística", () => {
    const fight = () => {
      const m = new Match(bot(["mines", "saw"], ["back", "front"]), bot(["saw", "mines"], ["front", "back"]), { arena: "classica", seed: 7 });
      const b0 = new Brain(0.9), b1 = new Brain(0.9);
      // a IA usa Math.random: troca por uma sequência fixa durante a luta
      let s = 12345;
      const real = Math.random;
      Math.random = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
      try {
        for (let k = 0; k < 60 * 40 && !m.over; k++) m.step(STEP, [b0.think(m, m.robots[0], m.robots[1], STEP), b1.think(m, m.robots[1], m.robots[0], STEP)]);
      } finally { Math.random = real; }
      return m.robots.map((r) => Math.round(r.hp * 1000));
    };
    expect(fight()).toEqual(fight());
  });
});
