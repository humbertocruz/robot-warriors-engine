import { expect, test } from "bun:test";
import { Match } from "../src/engine";
import { Brain } from "../src/ai";
import { CAMPAIGN, opponentWithLevels, buildStats, randomBuild, validateBuild } from "../src/parts";

function fight(a: any, b: any, da = 0.7, db = 0.7) {
  const m = new Match(a, b);
  const ba = new Brain(da), bb = new Brain(db);
  let t = 0;
  while (t < 200) {
    const dt = 1 / 60;
    const done = m.update(dt, [ba.think(m, m.robots[0], m.robots[1], dt), bb.think(m, m.robots[1], m.robots[0], dt)]);
    m.drainFx();
    t += dt;
    if (done) break;
  }
  return m;
}

test("partidas terminam com vencedor ou empate", () => {
  for (let i = 0; i < CAMPAIGN.length; i++) {
    for (let j = 0; j < CAMPAIGN.length; j++) {
      const m = fight(opponentWithLevels(CAMPAIGN[i], i), opponentWithLevels(CAMPAIGN[j], j));
      expect(m.over).toBe(true);
      for (const r of m.robots) { expect(Number.isFinite(r.x)).toBe(true); expect(r.hp).toBeGreaterThanOrEqual(0); }
    }
  }
});

test("campanha tem dificuldade crescente (balanço)", () => {
  const rows: string[] = [];
  for (let i = 0; i < CAMPAIGN.length; i++) {
    let wins = 0, time = 0;
    const N = 20;
    for (let k = 0; k < N; k++) {
      const m = fight(opponentWithLevels(CAMPAIGN[i], i), CAMPAIGN[0].build, CAMPAIGN[i].difficulty, 0.5);
      if (m.winner === 0) wins++;
      time += 99 - m.time;
    }
    const s = buildStats(CAMPAIGN[i].build);
    rows.push(`${CAMPAIGN[i].build.name.padEnd(14)} vence Ferrugem ${wins}/${N}  tempo médio ${(time / N).toFixed(0)}s  hp ${s.hp} massa ${s.totalMass}/${s.maxMass}`);
  }
  console.log(rows.join("\n"));
});

test("builds aleatórios funcionam", () => {
  for (let i = 0; i < 30; i++) fight(randomBuild(i / 30), randomBuild((i + 7) / 31));
  expect(validateBuild({ name: "x", color: 0, chassis: "striker", drive: "wheels", armor: "steel", weapons: [] })).not.toBeNull();
});
