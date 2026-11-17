import { describe, expect, test } from "bun:test";
import { validateBuild } from "../src/parts";
import { TEMPLATES } from "../src/brain-blocks";
import { ENGINE_VERSION, RANKING_ARENAS, RANKING_OPPONENTS, RANKING_ROBOTS, runCategory, runChallenge } from "../src/ranking";

const brain = (name: string) => TEMPLATES.find((t) => t.name === name)!.make();

describe("ranking: núcleo determinístico", () => {
  test("os robôs das categorias são montagens válidas", () => {
    for (const r of RANKING_ROBOTS) expect(validateBuild(r.build)).toBeNull();
  });
  test("a mesma luta dá sempre o mesmo resultado", () => {
    const a = runChallenge(brain("Lutador"), "tanque", "cruz", "toureiro");
    const b = runChallenge(brain("Lutador"), "tanque", "cruz", "toureiro");
    expect(a).toEqual(b);
  });
  test("categoria cobre arenas × adversários, com notas de 0 a 1000", () => {
    const { results, total } = runCategory(brain("Lutador"), "equilibrado");
    expect(results.length).toBe(RANKING_ARENAS.length * RANKING_OPPONENTS.length);
    for (const r of results) { expect(r.score).toBeGreaterThanOrEqual(0); expect(r.score).toBeLessThanOrEqual(1000); }
    expect(total).toBeGreaterThan(0);
  });
  // Notas de referência: se mudarem sem subir ENGINE_VERSION, o motor mudou e o ranking ficaria injusto.
  test(`notas de referência (ENGINE_VERSION ${ENGINE_VERSION})`, () => {
    expect(ENGINE_VERSION).toBe(2);
    expect(runCategory(brain("Lutador"), "equilibrado").total).toBe(747);
    expect(runCategory(brain("Atirador"), "equilibrado").total).toBe(90);
    expect(runCategory(brain("Toureiro"), "tanque").total).toBe(393);
    expect(runCategory(brain("Lutador"), "defensor").total).toBe(809);
  });
  test("desafio inválido lança erro", () => {
    expect(() => runChallenge(brain("Lutador"), "nao-existe", "cruz", "lutador")).toThrow();
    expect(() => runChallenge(brain("Lutador"), "tanque", "cruz", "nao-existe")).toThrow();
  });
});
