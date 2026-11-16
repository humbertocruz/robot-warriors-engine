import { expect, test } from "bun:test";
import { Match } from "../src/engine";
import { Brain } from "../src/ai";
import { ARENAS, clearance, isOpen, wallSegments } from "../src/arenas";
import { CAMPAIGN, opponentWithLevels } from "../src/parts";

test("spawns ficam em área livre e longe das armadilhas", () => {
  for (const a of ARENAS) {
    for (const s of a.spawns) {
      expect(isOpen(a, s)).toBe(true);
      for (const z of a.spikes) expect(Math.hypot(s.x - z.x, s.y - z.y)).toBeGreaterThan(z.r + 60);
    }
  }
});

test("pontos de passagem ficam em área livre com folga", () => {
  for (const a of ARENAS) for (const w of a.waypoints) expect(clearance(a, wallSegments(a), w)).toBeGreaterThan(45);
});

test("robôs nunca atravessam paredes e as lutas terminam em todas as arenas", () => {
  const rows: string[] = [];
  const stats: { escaped: number; meet: number }[] = [];
  for (const a of ARENAS) {
    let escaped = 0, total = 0, time = 0, firstContact = 0;
    const N = 6;
    for (let k = 0; k < N; k++) {
      const i = k % CAMPAIGN.length;
      const m = new Match(opponentWithLevels(CAMPAIGN[i], i), opponentWithLevels(CAMPAIGN[(i + 2) % 6], (i + 2) % 6), { arena: a.id });
      const b0 = new Brain(0.7), b1 = new Brain(0.7);
      let t = 0, contact = -1;
      const dt = 1 / 60;
      while (t < 200) {
        const done = m.update(dt, [b0.think(m, m.robots[0], m.robots[1], dt), b1.think(m, m.robots[1], m.robots[0], dt)]);
        m.drainFx();
        t += dt;
        for (const r of m.robots) {
          total++;
          // o centro do robô precisa estar em área livre (com folga de arredondamento)
          if (clearance(a, m.walls, r) < -2) escaped++;
        }
        const [r0, r1] = m.robots;
        if (contact < 0 && Math.hypot(r0.x - r1.x, r0.y - r1.y) < r0.stats.radius + r1.stats.radius + 60) contact = t;
        if (done) break;
      }
      expect(m.over).toBe(true);
      time += 99 - m.time;
      firstContact += contact < 0 ? 99 : contact;
    }
    rows.push(`${a.name.padEnd(14)} fora da área ${escaped}/${total}  1º encontro ${(firstContact / N).toFixed(1)}s  duração ${(time / N).toFixed(0)}s`);
    stats.push({ escaped, meet: firstContact / N });
  }
  console.log(rows.join("\n"));
  for (const st of stats) { expect(st.escaped).toBe(0); expect(st.meet).toBeLessThan(15); }
});
