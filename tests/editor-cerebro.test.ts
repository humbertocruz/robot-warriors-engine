import { describe, expect, test, afterAll } from "bun:test";
import { Match } from "../src/engine";
import { Brain } from "../src/ai";
import { ACTIONS, GUIDE_FOE_DIFFICULTY, ProgramBrain, SENSORS, SENSOR_GROUPS, guideRules } from "../src/brain-blocks";
import { ARENAS } from "../src/arenas";
import { mulberry, type RobotBuild } from "../src/parts";

const realRandom = Math.random;
afterAll(() => { Math.random = realRandom; });

describe("editor do cérebro", () => {
  test("todo sensor tem um grupo conhecido, e todo grupo tem sensores", () => {
    for (const s of SENSORS) expect(SENSOR_GROUPS).toContain(s.group);
    for (const g of SENSOR_GROUPS) expect(SENSORS.some((s) => s.group === g)).toBe(true);
  });
  test("toda ação cai num grupo do menu", () => {
    for (const a of ACTIONS) expect(["move", "turbo", "attack", "defense"]).toContain(a.kind);
  });
});

describe("guia do primeiro cérebro", () => {
  const builds: RobotBuild[] = [
    { name: "inicial", color: 1, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw"] },
    { name: "serra+fogo", color: 1, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["flame", "saw"] },
    { name: "titã", color: 1, chassis: "tita", drive: "treads", armor: "steel", weapons: ["hammer", "flame", "missile"] },
  ];
  for (const b of builds) {
    test(`as 3 regras vencem o Tonto na Clássica e na maioria das arenas (${b.name})`, () => {
      let wins = 0, n = 0;
      for (const seed of [1, 2, 3]) {
        Math.random = mulberry(seed);
        for (const ar of ARENAS) {
          const m = new Match(b, b, { arena: ar.id, speedScale: [1, 0.85 + 0.13 * GUIDE_FOE_DIFFICULTY] }); // como no duelo
          const A = new ProgramBrain({ id: "g", name: "g", rules: guideRules() }), B = new Brain(GUIDE_FOE_DIFFICULTY);
          for (let k = 0; k < 104 * 60 && !m.over; k++) m.update(1 / 60, [A.think(m, m.robots[0], m.robots[1], 1 / 60), B.think(m, m.robots[1], m.robots[0], 1 / 60)]);
          if (m.winner === 0) wins++;
          n++;
        }
      }
      expect(wins / n).toBeGreaterThanOrEqual(0.7);
    }, 60000);
  }
});

describe("dano por arma", () => {
  test("a soma do dano por arma bate com o dano total, contando o fogo que continua queimando", () => {
    Math.random = mulberry(5);
    const b: RobotBuild = { name: "x", color: 1, chassis: "tita", drive: "treads", armor: "steel", weapons: ["flame", "saw", "missile"] };
    const m = new Match(b, b, { arena: "classica" });
    const A = new Brain(0.8), B = new Brain(0.8);
    for (let k = 0; k < 104 * 60 && !m.over; k++) m.update(1 / 60, [A.think(m, m.robots[0], m.robots[1], 1 / 60), B.think(m, m.robots[1], m.robots[0], 1 / 60)]);
    for (const r of m.robots) {
      const sum = r.dmgBy.reduce((a, c) => a + c, 0);
      expect(r.dmgDealt).toBeGreaterThan(0);
      expect(Math.abs(sum - r.dmgDealt)).toBeLessThan(0.01);
    }
  });
});
