import { expect, test } from "bun:test";
import { emptyInput, Match } from "../src/engine";
import { Brain } from "../src/ai";
import { CAMPAIGN, opponentWithLevels } from "../src/parts";

const me = { name: "P", color: 0, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw", "flame"] };

// jogador foge em linha reta para longe da IA, usando turbo quando disponível
function escapeRun(stage: number, useBoost: boolean) {
  const o = CAMPAIGN[stage];
  const m = new Match(me, opponentWithLevels(o, stage), { speedScale: [1, 0.85 + 0.13 * o.difficulty] });
  const ai = new Brain(o.difficulty);
  // começa colado
  m.robots[0].x = 550; m.robots[1].x = 615; m.robots[0].y = m.robots[1].y = 360;
  let contact = 0, maxGap = 0, toggle = false;
  const dt = 1 / 60;
  for (let t = 0; t < 1.2; t += dt) {
    const p = m.robots[0], e = m.robots[1];
    const inp = emptyInput();
    inp.heading = Math.atan2(p.y - e.y, p.x - e.x) + Math.sin(t * 1.3) * 0.6; // foge zigue-zagueando
    inp.headingMag = 1;
    toggle = !toggle;
    inp.boost = useBoost && toggle;
    m.update(dt, [inp, ai.think(m, e, p, dt)]);
    m.drainFx();
    const gap = Math.hypot(p.x - e.x, p.y - e.y) - p.stats.radius - e.stats.radius;
    if (gap < 8) contact += dt;
    maxGap = Math.max(maxGap, gap);
  }
  return { contact, maxGap };
}

test("jogador consegue abrir distância contra todos os oponentes", () => {
  const rows: string[] = [];
  const gaps: number[] = [];
  CAMPAIGN.forEach((o, i) => {
    const runs = Array.from({ length: 8 }, () => escapeRun(i, true));
    const gap = runs.reduce((s, r) => s + r.maxGap, 0) / runs.length;
    const contact = runs.reduce((s, r) => s + r.contact, 0) / runs.length;
    const noBoost = Array.from({ length: 8 }, () => escapeRun(i, false)).reduce((s, r) => s + r.maxGap, 0) / 8;
    rows.push(`${o.build.name.padEnd(14)} distância máx c/ turbo ${gap.toFixed(0).padStart(4)}px  sem turbo ${noBoost.toFixed(0).padStart(4)}px  colado ${contact.toFixed(2)}s de 1.2s`);
    gaps.push(gap);
  });
  console.log(rows.join("\n"));
  for (const g of gaps) expect(g).toBeGreaterThan(60);
});
