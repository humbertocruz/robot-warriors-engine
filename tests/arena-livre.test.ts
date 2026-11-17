import { describe, expect, test } from "bun:test";
import { FREE_DIFFICULTY, freeOpponent, freeReward } from "../src/free-arena";
import { avgLevel, randomBuild, validateBuild, withAvgLevel, mulberry, type RobotBuild } from "../src/parts";
import { unlockedAfter } from "../src/story";

const me = (lvl: number): RobotBuild => withAvgLevel({ name: "Eu", color: 0, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw", "flame"] }, lvl, () => 0);

describe("Arena livre", () => {
  test("robô sorteado nunca passa do peso, com qualquer conjunto de peças", () => {
    for (const stage of [0, 10, 30, 60, 200]) {
      const allowed = unlockedAfter(stage);
      for (let k = 0; k < 300; k++) {
        const b = randomBuild(k / 300, allowed);
        expect(validateBuild(b)).toBeNull();
        for (const id of [b.chassis, b.drive, b.armor, ...b.weapons]) expect(allowed.has(id)).toBe(true);
      }
    }
  });

  test("todas as peças liberadas: também dentro do peso", () => {
    for (let k = 0; k < 500; k++) expect(validateBuild(randomBuild(k / 500))).toBeNull();
  });

  test("adversário fica no nível médio do jogador", () => {
    const levels = (l: number[]): RobotBuild => ({ name: "Eu", color: 0, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw"], levels: { striker: l[0], wheels: l[1], steel: l[2], saw: l[3] } });
    for (const p of [levels([1, 1, 1, 1]), levels([2, 3, 2, 3]), levels([4, 4, 4, 4]), levels([5, 5, 5, 5]), levels([3, 4, 4, 4])]) {
      const lvl = avgLevel(p);
      let sum = 0;
      const n = 200;
      for (let k = 0; k < n; k++) {
        const o = freeOpponent(p, unlockedAfter(60), k / n);
        const a = avgLevel(o.build);
        expect(a).toBeGreaterThanOrEqual(Math.floor(lvl));
        expect(a).toBeLessThanOrEqual(Math.ceil(lvl));
        sum += a;
      }
      expect(Math.abs(sum / n - lvl)).toBeLessThan(0.25);
    }
  });

  test("dificuldade dentro da faixa e não depende de vitórias", () => {
    for (let k = 0; k < 200; k++) {
      const d = freeOpponent(me(3), unlockedAfter(20), k / 200).difficulty;
      expect(d).toBeGreaterThanOrEqual(FREE_DIFFICULTY[0]);
      expect(d).toBeLessThanOrEqual(FREE_DIFFICULTY[1]);
    }
  });

  test("prêmio: 40 + 10 por nível médio", () => {
    expect(freeReward(me(1))).toBe(50);
    expect(freeReward(me(5))).toBe(90);
  });

  test("mesma semente, mesmo adversário", () => {
    const a = freeOpponent(me(2), unlockedAfter(20), 0.42);
    const b = freeOpponent(me(2), unlockedAfter(20), 0.42);
    expect(a).toEqual(b);
  });

  test("withAvgLevel respeita os limites", () => {
    const r = mulberry(1);
    expect(avgLevel(withAvgLevel(me(1), 9, r))).toBe(5);
    expect(avgLevel(withAvgLevel(me(1), -3, r))).toBe(1);
  });
});
