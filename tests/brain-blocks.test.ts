import { describe, expect, test } from "bun:test";
import { Match } from "../src/engine";
import { CAMPAIGN, opponentWithLevels } from "../src/parts";
import {
  ProgramBrain, TEMPLATES, exportProgram, importProgram, newAct, newCond, newRule, readSensors, sanitizeProgram, testCond, type Program,
} from "../src/brain-blocks";

const A = { name: "A", color: 0xf5b700, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw", "flame"] };
const B = { name: "B", color: 0x2fb8e8, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw", "flame"] };

function duel(pa: Program, pb: Program, arena = "classica", maxSeconds = 120) {
  const m = new Match(A, B, { arena });
  const ba = new ProgramBrain(pa), bb = new ProgramBrain(pb);
  const dt = 1 / 60;
  for (let i = 0; i < maxSeconds * 60 && !(m.over && m.endDelay <= 0); i++) {
    m.step(dt, [ba.think(m, m.robots[0], m.robots[1], dt), bb.think(m, m.robots[1], m.robots[0], dt)]);
  }
  return { m, winner: m.winner, hp: m.robots.map((r) => Math.round(r.hp)) };
}

describe("cérebro por blocos", () => {
  test("condições comparam sensores", () => {
    const m = new Match(A, B);
    const { s } = readSensors(m, m.robots[0], m.robots[1]);
    expect(s.dist).toBeGreaterThan(300);
    expect(testCond({ s: "dist", op: ">", v: 100 }, s)).toBe(true);
    expect(testCond({ s: "dist", op: "<", v: 100 }, s)).toBe(false);
    expect(testCond({ s: "sight", op: "=", v: 1 }, s)).toBe(true);
    expect(testCond({ s: "myHp", op: ">", v: 99 }, s)).toBe(true);
    expect(testCond({ s: "range1", op: "=", v: 1 }, s)).toBe(false);
  });

  test("a primeira regra de movimento que valer manda; ataque e turbo somam", () => {
    const m = new Match(A, B);
    const prog: Program = { id: "x", name: "t", rules: [
      newRule([newCond("dist")].map((c) => ({ ...c, op: ">" as const, v: 10 })), [newAct("flee"), { a: "fire", v: 1 }]),
      newRule([], [newAct("approach"), { a: "fire", v: 2 }]),
    ] };
    const b = new ProgramBrain(prog);
    const inp = b.think(m, m.robots[0], m.robots[1], 1 / 60);
    expect(b.moving).toBe("flee");
    expect(b.active).toEqual([true, true]);
    expect(inp.fire[0] || inp.fire[1]).toBe(true);
    // fugir = direção oposta ao inimigo (inimigo à direita => heading ~ PI)
    expect(Math.abs(Math.cos(inp.heading!))).toBeGreaterThan(0.9);
    expect(Math.cos(inp.heading!)).toBeLessThan(0);
  });

  test("regra desligada é ignorada", () => {
    const m = new Match(A, B);
    const r = newRule([], [newAct("approach")]);
    r.on = false;
    const b = new ProgramBrain({ id: "x", name: "t", rules: [r] });
    const inp = b.think(m, m.robots[0], m.robots[1], 1 / 60);
    expect(inp.heading).toBeNull();
    expect(b.active).toEqual([false]);
  });

  test("é determinístico: mesma luta, mesmo resultado", () => {
    const t = () => [TEMPLATES[0].make(), TEMPLATES[2].make()] as const;
    const r1 = duel(...t());
    const r2 = duel(...t());
    expect(r1.hp).toEqual(r2.hp);
    expect(r1.winner).toBe(r2.winner);
    expect(r1.m.time).toBe(r2.m.time);
  });

  test("Lutador causa dano real em qualquer arena (não fica parado nem preso)", () => {
    for (const arena of ["classica", "coliseu", "fabrica", "corredor"]) {
      const { m } = duel(TEMPLATES[0].make(), TEMPLATES[0].make(), arena, 60);
      expect(m.robots[0].dmgDealt + m.robots[1].dmgDealt).toBeGreaterThan(20);
    }
  });

  test("todos os modelos terminam a luta contra todos", () => {
    for (const a of TEMPLATES) for (const b of TEMPLATES) {
      const { m } = duel(a.make(), b.make());
      expect(m.over).toBe(true);
    }
  });

  test("cérebro vazio perde para o Lutador", () => {
    const { winner } = duel({ id: "v", name: "vazio", rules: [] }, TEMPLATES[0].make());
    expect(winner).toBe(1);
  });

  test("exportar/importar preserva as regras; lixo é rejeitado", () => {
    const p = TEMPLATES[1].make();
    const q = importProgram(exportProgram(p))!;
    expect(q.name).toBe(p.name);
    expect(q.rules.map(({ on, conds, acts }) => ({ on, conds, acts }))).toEqual(p.rules.map(({ on, conds, acts }) => ({ on, conds, acts })));
    expect(importProgram("RWB1-@@@")).toBeNull();
    expect(importProgram("qualquer coisa")).toBeNull();
  });

  test("sanitize descarta sensores/ações inexistentes e limita tamanhos", () => {
    const p = sanitizeProgram({ name: "x".repeat(99), rules: [
      { conds: [{ s: "nada", op: "<", v: 1 }, { s: "dist", op: "??", v: "abc" }], acts: [{ a: "hack", v: 1 }, { a: "fire", v: 2 }] },
      ...Array.from({ length: 40 }, () => ({ conds: [], acts: [] })),
    ] })!;
    expect(p.name.length).toBeLessThanOrEqual(28);
    expect(p.rules.length).toBe(16);
    expect(p.rules[0].conds).toEqual([{ s: "dist", op: "<", v: 150 }]);
    expect(p.rules[0].acts).toEqual([{ a: "fire", v: 2 }]);
  });

  test("cérebro programado enfrenta oponente da campanha sem travar", () => {
    const foe = opponentWithLevels(CAMPAIGN[0], 0);
    const m = new Match(A, foe, { arena: "classica" });
    const b = new ProgramBrain(TEMPLATES[0].make());
    const dt = 1 / 60;
    let hit = false;
    for (let i = 0; i < 60 * 40; i++) {
      m.step(dt, [b.think(m, m.robots[0], m.robots[1], dt), { throttle: 0, turn: 0, heading: null, headingMag: 0, fire: [false, false, false], boost: false }]);
      if (m.robots[1].hp < m.robots[1].stats.hp) hit = true;
    }
    expect(hit).toBe(true);
  });
});

import { PUBLIC_URL, addImported, hasProgramHash, programFromHash, exportProgram as exp, loadPrograms } from "../src/brain-blocks";
import { shareLink } from "../src/brain-blocks";

describe("link de compartilhamento", () => {
  test("o link é público, cabe num link e volta idêntico", () => {
    const p = TEMPLATES[0].make();
    const link = shareLink(p);
    expect(link.startsWith(PUBLIC_URL + "#cerebro=RWB2-")).toBe(true);
    expect(link.length).toBeLessThan(1200);
    const hash = link.slice(link.indexOf("#"));
    expect(hasProgramHash(hash)).toBe(true);
    const q = programFromHash(hash)!;
    expect(q.name).toBe(p.name);
    expect(q.rules.map(({ on, conds, acts }) => ({ on, conds, acts }))).toEqual(p.rules.map(({ on, conds, acts }) => ({ on, conds, acts })));
  });

  test("link de um preview vira link público", () => {
    expect(shareLink(TEMPLATES[1].make(), "https://x-git-y.vercel.app/?a=1#cerebro=velho")).toMatch(/^https:\/\/x-git-y\.vercel\.app\/\?a=1#cerebro=RWB2-/);
  });

  test("hash quebrado, de outro tipo ou malicioso é ignorado", () => {
    expect(programFromHash("#cerebro=RWB2-@@@")).toBeNull();
    expect(programFromHash("#cerebro=")).toBeNull();
    expect(programFromHash("#outra=coisa")).toBeNull();
    expect(hasProgramHash("#outra=coisa")).toBe(false);
    const evil = "RWB2-" + btoa(JSON.stringify(["x", [[1, [["hack", "<", 1]], [["rm", 1]]]]])).replace(/=+$/, "");
    const p = programFromHash("#cerebro=" + evil)!;
    expect(p.rules[0].conds).toEqual([]);
    expect(p.rules[0].acts).toEqual([]);
  });

  test("formato antigo RWB1 ainda importa", () => {
    const p = TEMPLATES[2].make();
    const old = "RWB1-" + btoa(unescape(encodeURIComponent(JSON.stringify({ name: p.name, rules: p.rules })))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(importProgram(old)!.rules.length).toBe(p.rules.length);
  });

  test("receber o mesmo cérebro duas vezes não duplica", () => {
    const store = { programs: [TEMPLATES[0].make()], active: "" };
    store.active = store.programs[0].id;
    const incoming = importProgram(exp(TEMPLATES[1].make()))!;
    const a = addImported(store, incoming);
    expect(a.existed).toBe(false);
    expect(a.store.programs.length).toBe(2);
    expect(a.store.active).toBe(incoming.id);
    const again = addImported(a.store, importProgram(exp(TEMPLATES[1].make()))!);
    expect(again.existed).toBe(true);
    expect(again.store.programs.length).toBe(2);
  });
});
