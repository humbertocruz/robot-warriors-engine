import { describe, expect, test } from "bun:test";
import { emptyInput, Match, mountPoint, type Input } from "../src/engine";
import { equippedWeapons, slotLayout, validateBuild, type Mount, type RobotBuild } from "../src/parts";
import { ProgramBrain, readSensors, type Program } from "../src/brain-blocks";

const base = (weapons: string[], mounts?: Mount[], chassis = "tita"): RobotBuild => ({
  name: "T", color: 0, chassis, drive: "treads", armor: "steel", weapons, mounts,
});
const dummy: RobotBuild = { name: "Alvo", color: 0, chassis: "tita", drive: "treads", armor: "titanio", weapons: ["saw"] };

/** Coloca o atacante parado em (280, 380) olhando para a direita e o alvo a `dist` px na direção `dir` (rad). */
function setup(weapon: string, mount: Mount, dir: number, dist = 95) {
  const m = new Match(base([weapon], [mount]), dummy, { arena: "classica" });
  const [a, t] = m.robots;
  a.x = 280; a.y = 380; a.angle = 0;
  t.x = a.x + Math.cos(dir) * dist; t.y = a.y + Math.sin(dir) * dist; t.angle = Math.PI;
  return m;
}

/** Aperta/segura a arma por ~1 s (borda de subida a cada 0,5 s) e devolve o dano no alvo. */
function damageDealt(m: Match) {
  const [a, t] = m.robots;
  const hp0 = t.hp;
  for (let k = 0; k < 60; k++) {
    const inp: Input = emptyInput();
    inp.fire[0] = k % 30 < 15;
    m.step(1 / 60, [inp, emptyInput()]);
    // mantém os dois no lugar: o teste é só de mira
    a.x = 280; a.y = 380; a.vx = a.vy = 0; a.angle = 0;
    t.vx = t.vy = 0;
  }
  return hp0 - t.hp;
}

const SIDES: { mount: Mount; dir: number }[] = [
  { mount: "front", dir: 0 },
  { mount: "left", dir: -Math.PI / 2 },
  { mount: "right", dir: Math.PI / 2 },
  { mount: "back", dir: Math.PI },
];

describe("posição das armas", () => {
  test("todas na frente dá as mesmas posições de antes", () => {
    const R = 36;
    const p = slotLayout([{ kind: "flame", mount: "front" }, { kind: "missile", mount: "front" }, { kind: "shock", mount: "front" }], R);
    // fórmula antiga de mountLocal(i, n=3, R, kind)
    expect(p[0]).toMatchObject({ angle: 0, lx: R * 0.92, ly: -R * 1.25 / 2 });
    expect(p[1]).toMatchObject({ angle: 0, lx: R * 0.92, ly: 0 });
    expect(p[2]).toMatchObject({ angle: 0, lx: -R * 0.15, ly: R * 0.5 });
  });

  test("save antigo (sem mounts) fica com tudo na frente", () => {
    const b = base(["saw", "", "flame"]);
    expect(equippedWeapons(b)).toEqual([{ id: "saw", mount: "front" }, { id: "flame", mount: "front" }]);
    expect(validateBuild(b)).toBeNull();
  });

  test("lado inválido é recusado", () => {
    expect(validateBuild(base(["saw"], ["cima" as Mount]))).not.toBeNull();
  });

  test("arma de lado fica na borda certa do robô", () => {
    const m = setup("saw", "back", 0);
    const p = mountPoint(m.robots[0], 0);
    expect(p.x).toBeLessThan(m.robots[0].x - 20);
    expect(Math.abs(p.y - m.robots[0].y)).toBeLessThan(1e-6);
  });

  for (const w of ["saw", "drill", "flame", "hammer", "flipper", "missile"]) {
    for (const { mount, dir } of SIDES) {
      test(`${w} em ${mount}: acerta só quem está desse lado`, () => {
        const hitDist = w === "flame" ? 120 : w === "missile" ? 160 : 80;
        expect(damageDealt(setup(w, mount, dir, hitDist))).toBeGreaterThan(0);
        const opposite = dir + Math.PI;
        expect(damageDealt(setup(w, mount, opposite, hitDist))).toBe(0);
      });
    }
  }

  test("bobina de choque acerta em volta, de qualquer lado", () => {
    expect(damageDealt(setup("shock", "back", 0, 100))).toBeGreaterThan(0);
    expect(damageDealt(setup("shock", "front", Math.PI, 100))).toBeGreaterThan(0);
  });

  test("espinhos atrás ferem quem bate na traseira, não na frente", () => {
    const ram = (dir: number) => {
      const m = new Match(base(["spikes", "saw"], ["back", "front"], "striker"), dummy, { arena: "classica" });
      const [a, t] = m.robots;
      a.x = 280; a.y = 380; a.angle = 0; a.vx = a.vy = 0;
      t.x = a.x + Math.cos(dir) * 70; t.y = a.y + Math.sin(dir) * 70;
      t.vx = -Math.cos(dir) * 400; t.vy = -Math.sin(dir) * 400; // alvo vem com tudo
      const hp0 = t.hp;
      for (let k = 0; k < 10; k++) m.step(1 / 60, [emptyInput(), emptyInput()]);
      return hp0 - t.hp;
    };
    expect(ram(Math.PI)).toBeGreaterThan(0);
    expect(ram(0)).toBe(0);
  });
});

describe("cérebro e lados", () => {
  const prog = (acts: Program["rules"][number]["acts"]): Program => ({ id: "p", name: "p", rules: [{ id: "r", on: true, conds: [], acts }] });

  test("'Mirar com a arma N' vira o lado da arma para o inimigo em menos de 1 s", () => {
    for (const { mount } of SIDES) {
      const m = new Match(base(["saw", "flame"], ["front", mount], "striker"), dummy, { arena: "classica" });
      const [a, t] = m.robots;
      a.x = 280; a.y = 380; a.angle = 0;
      t.x = 460; t.y = 380;
      const brain = new ProgramBrain(prog([{ a: "aimWith", v: 2 }]));
      for (let k = 0; k < 60; k++) {
        m.step(1 / 60, [brain.think(m, a, t, 1 / 60), emptyInput()]);
        t.x = 460; t.y = 380; t.vx = t.vy = 0;
      }
      const s = readSensors(m, a, t).s;
      expect(s.range2).toBe(1);
    }
  });

  test("sensor 'inimigo atrás de mim'", () => {
    const m = setup("saw", "front", Math.PI, 200);
    expect(readSensors(m, m.robots[0], m.robots[1]).s.behind).toBe(1);
    const n = setup("saw", "front", 0, 200);
    expect(readSensors(n, n.robots[0], n.robots[1]).s.behind).toBe(0);
  });

  test("'ao alcance da arma' respeita o lado", () => {
    const m = setup("flame", "back", Math.PI, 100);
    expect(readSensors(m, m.robots[0], m.robots[1]).s.range1).toBe(1);
    const n = setup("flame", "back", 0, 100);
    expect(readSensors(n, n.robots[0], n.robots[1]).s.range1).toBe(0);
  });
});
