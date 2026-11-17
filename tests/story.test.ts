import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { storyStage, unlockedAfter, UNLOCKS, STARTER_PARTS, starsOf } from "../src/story";
import { ARMORS, CHASSIS, DRIVES, WEAPONS, validateBuild } from "../src/parts";

describe("Modo História: gerador de fases", () => {
  test("toda fase de 1 a 1000 tem um robô válido", () => {
    for (let n = 1; n <= 1000; n++) expect(validateBuild(storyStage(n).build)).toBeNull();
  });

  test("a mesma fase é sempre igual", () => {
    for (const n of [1, 8, 37, 250]) expect(storyStage(n)).toEqual(storyStage(n));
  });

  // Se este teste quebrar, a fórmula mudou: a fase 8 de quem já jogou viraria outra fase.
  // Só atualize o valor junto com uma STORY_VERSION nova (ver docs/specs/modo-historia.md).
  test("fórmula congelada (STORY_VERSION 1)", () => {
    const all = Array.from({ length: 200 }, (_, i) => storyStage(i + 1));
    const hash = createHash("sha256").update(JSON.stringify(all)).digest("hex").slice(0, 16);
    expect(hash).toMatchSnapshot();
  });

  test("toda peça é liberada uma vez, e o inimigo só usa o que está liberado (ou a peça da fase)", () => {
    const all = [...CHASSIS, ...DRIVES, ...ARMORS, ...WEAPONS].map((p) => p.id);
    const unlockedSomewhere = [...STARTER_PARTS, ...UNLOCKS.map((u) => u.part)];
    expect(new Set(unlockedSomewhere).size).toBe(unlockedSomewhere.length);
    expect([...unlockedSomewhere].sort()).toEqual([...all].sort());
    for (let n = 2; n <= 100; n++) {
      if (n % 10 === 0) continue; // chefes feitos à mão podem mostrar peças futuras
      const s = storyStage(n);
      const pool = unlockedAfter(n);
      for (const id of [s.build.chassis, s.build.drive, s.build.armor, ...s.build.weapons]) expect(pool.has(id)).toBe(true);
    }
  });

  test("dificuldade e prêmio crescem com a fase", () => {
    for (let n = 2; n <= 100; n++) {
      expect(storyStage(n).difficulty + (storyStage(n - 1).boss ? 0.06 : 0)).toBeGreaterThanOrEqual(storyStage(n - 1).difficulty);
    }
    expect(storyStage(10).reward).toBeGreaterThan(storyStage(11).reward); // chefe paga em dobro
  });

  test("estrelas", () => {
    expect(starsOf(false, 1, 10)).toBe(0);
    expect(starsOf(true, 0.2, 10)).toBe(1);
    expect(starsOf(true, 0.6, 80)).toBe(2);
    expect(starsOf(true, 0.6, 30)).toBe(3);
  });
});
