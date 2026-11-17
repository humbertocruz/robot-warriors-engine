import { describe, expect, test } from "bun:test";
import { emptyInput, Match } from "../src/engine";
import type { RobotBuild } from "../src/parts";

const bot = (w: string[]): RobotBuild => ({ name: "T", color: 0, chassis: "striker", drive: "wheels", armor: "steel", weapons: w });
const STEP = 1 / 60;
const idle = (m: Match, n: number) => { for (let k = 0; k < n; k++) m.step(STEP, [emptyInput(), emptyInput()]); };

describe("reforços no motor", () => {
  test("blindagem extra, bateria e sabotagem", () => {
    const m = new Match(bot(["saw"]), bot(["saw"]), { arena: "classica" });
    const [me, foe] = m.robots;
    const hp = me.stats.hp, foeHp = foe.hp;
    m.applyPreBoost("armor"); m.applyPreBoost("battery"); m.applyPreBoost("sabotage");
    expect(me.stats.hp).toBe(Math.round(hp * 1.25));
    expect(me.hp).toBe(me.stats.hp);
    expect(foe.hp).toBe(Math.round(foeHp * 0.85));
    me.energy = 0; foe.energy = 0;
    idle(m, 60);
    expect(me.energy).toBeCloseTo(Math.min(100, foe.energy * 1.5), 1);
  });

  test("reparo instantâneo não passa da vida máxima; congelante paralisa", () => {
    const m = new Match(bot(["saw"]), bot(["saw"]), { arena: "classica" });
    const [me, foe] = m.robots;
    me.hp = me.stats.hp * 0.5;
    m.useLiveBoost("repair");
    expect(me.hp).toBeCloseTo(me.stats.hp * 0.8, 6);
    m.useLiveBoost("repair");
    expect(me.hp).toBe(me.stats.hp);
    m.useLiveBoost("freeze");
    expect(foe.stun).toBe(2);
  });

  test("ataque orbital acerta quem fica e erra quem sai", () => {
    const hit = (dodge: boolean) => {
      const m = new Match(bot(["saw"]), bot(["saw"]), { arena: "classica" });
      const foe = m.robots[1];
      const hp = foe.hp;
      m.useLiveBoost("orbital");
      if (dodge) foe.x += 200;
      idle(m, 70);
      return hp - foe.hp;
    };
    expect(hit(false)).toBeGreaterThan(30);
    expect(hit(true)).toBe(0);
  });

  test("continuar: volta com 40% da vida e a luta segue; com tempo acabado ganha 30 s", () => {
    const m = new Match(bot(["saw"]), bot(["saw"]), { arena: "classica" });
    const me = m.robots[0];
    me.hp = 0;
    idle(m, 2);
    expect(m.over).toBe(true);
    expect(m.winner).toBe(1);
    m.revive(0, 0.4);
    expect(m.over).toBe(false);
    expect(me.dead).toBe(false);
    expect(me.hp).toBeCloseTo(me.stats.hp * 0.4, 6);
    idle(m, 5);
    expect(m.over).toBe(false);

    const t = new Match(bot(["saw"]), bot(["saw"]), { arena: "classica" });
    t.time = 0.01; t.robots[0].hp = 10;
    idle(t, 3);
    expect(t.over).toBe(true);
    t.revive(0, 0.4);
    expect(t.time).toBe(30);
  });
});
