import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Match } from "../src/engine";
import { Brain } from "../src/ai";
import { ProgramBrain, TEMPLATES } from "../src/brain-blocks";
import { ARENAS } from "../src/arenas";
import { MODEL_ROBOTS } from "../src/ranking";
import { mulberry, validateBuild } from "../src/parts";

// Spec arena-livre-e-cerebro: cada modelo pronto, no robô em que faz sentido, vence a IA média (0,5)
// em pelo menos 4 de 6 arenas. A IA usa Math.random: o teste fixa a semente para ser repetível.
const STEP = 1 / 60;
const D = 0.5;
const realRandom = Math.random;

function wins(name: string, seed: number): number {
  Math.random = mulberry(seed);
  const t = TEMPLATES.find((x) => x.name === name)!;
  const rob = MODEL_ROBOTS[name];
  let w = 0;
  for (const ar of ARENAS) {
    const m = new Match(rob, rob, { arena: ar.id, speedScale: [1, 0.85 + 0.13 * D] }); // como no duelo
    const A = new ProgramBrain(t.make()), B = new Brain(D);
    for (let k = 0; k < 104 * 60 && !m.over; k++) m.update(STEP, [A.think(m, m.robots[0], m.robots[1], STEP), B.think(m, m.robots[1], m.robots[0], STEP)]);
    if (m.winner === 0) w++;
  }
  return w;
}

describe("modelos prontos", () => {
  afterAll(() => { Math.random = realRandom; });
  beforeAll(() => { Math.random = realRandom; });
  test("cinco modelos, cada um com um robô válido", () => {
    expect(TEMPLATES.map((t) => t.name)).toEqual(["Lutador", "Atirador", "Toureiro", "Guardião", "Traseiro"]);
    for (const t of TEMPLATES) expect(validateBuild(MODEL_ROBOTS[t.name])).toBeNull();
  });
  for (const t of TEMPLATES) {
    test(`${t.name} vence a IA média em pelo menos 4 de 6 arenas`, () => {
      for (const seed of [1, 2, 3]) expect(wins(t.name, seed)).toBeGreaterThanOrEqual(4);
    }, 60000);
  }
  test("Guardião usa escudo e reparo; Traseiro usa a arma de trás", () => {
    const used = (name: string) => {
      Math.random = mulberry(7);
      const rob = MODEL_ROBOTS[name];
      const kinds = new Set<string>();
      for (const ar of ARENAS) {
        // contra a IA mais forte, para o modelo apanhar o bastante e precisar se consertar
        const m = new Match(rob, rob, { arena: ar.id });
        const A = new ProgramBrain(TEMPLATES.find((x) => x.name === name)!.make()), B = new Brain(0.85);
        for (let k = 0; k < 104 * 60 && !m.over; k++) {
          m.update(STEP, [A.think(m, m.robots[0], m.robots[1], STEP), B.think(m, m.robots[1], m.robots[0], STEP)]);
          m.robots[0].weapons.forEach((w) => { if (w.active) kinds.add(`${w.def.kind}@${w.mount}`); });
        }
      }
      return kinds;
    };
    const g = used("Guardião");
    expect(g.has("shield@front")).toBe(true);
    expect(g.has("repair@back")).toBe(true);
    expect(used("Traseiro").has("saw@back")).toBe(true);
  }, 60000);
});
