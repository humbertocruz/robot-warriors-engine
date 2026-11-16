import { expect, test } from "bun:test";
import { emptyInput, Match, REVERSE_TIME } from "../src/engine";

const me = { name: "P", color: 0, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw"] };

function run(seconds: number, heading: number | null, m: Match) {
  const dt = 1 / 60;
  const trace: { t: number; angle: number; fwd: number }[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const inp = emptyInput();
    inp.heading = heading ?? 0; inp.headingMag = heading === null ? 0 : 1;
    m.update(dt, [inp, emptyInput()]);
    const r = m.robots[0];
    trace.push({ t, angle: r.angle, fwd: r.vx * Math.cos(r.angle) + r.vy * Math.sin(r.angle) });
  }
  return trace;
}

test("aponta para trás: dá ré um pouco, faz meia-volta e segue de frente", () => {
  const m = new Match(me, me, { arena: "fabrica" });
  m.robots[1].x = 2100; m.robots[1].y = 1300; // longe
  const r = m.robots[0];
  r.x = 1500; r.y = 560; r.angle = 0; // olhando para +x, com espaço atrás
  const tr = run(2.2, Math.PI, m); // joystick para -x
  const early = tr.filter((p) => p.t > 0.15 && p.t < REVERSE_TIME);
  const late = tr.filter((p) => p.t > 1.6);
  expect(early.every((p) => p.fwd < 0)).toBe(true); // começou de ré
  expect(late.every((p) => Math.abs(Math.cos(p.angle) + 1) < 0.05)).toBe(true); // virou para -x
  expect(late.every((p) => p.fwd > 50)).toBe(true); // e anda de frente
  const turned = tr.find((p) => Math.cos(p.angle) < 0)!;
  console.log(`ré até ~${REVERSE_TIME}s, virado aos ${turned.t.toFixed(2)}s, velocidade final ${late.at(-1)!.fwd.toFixed(0)}`);
});

test("soltar o controle e apontar para trás de novo volta a dar ré primeiro", () => {
  const m = new Match(me, me, { arena: "fabrica" });
  m.robots[1].x = 2100; m.robots[1].y = 1300;
  const r = m.robots[0];
  r.x = 1500; r.y = 560; r.angle = 0;
  run(2, Math.PI, m); // fez meia-volta, agora olha para -x
  run(0.5, null, m);  // soltou
  const tr = run(0.3, 0, m); // aponta para +x (atrás dele agora)
  expect(tr.filter((p) => p.t > 0.12).every((p) => p.fwd < 0)).toBe(true);
});

function runTank(seconds: number, throttle: number, turn: number, m: Match) {
  const dt = 1 / 60;
  const trace: { t: number; angle: number; fwd: number }[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const inp = emptyInput();
    inp.heading = null; inp.throttle = throttle; inp.turn = turn;
    m.update(dt, [inp, emptyInput()]);
    const r = m.robots[0];
    trace.push({ t, angle: r.angle, fwd: r.vx * Math.cos(r.angle) + r.vy * Math.sin(r.angle) });
  }
  return trace;
}

test("teclado: ↑ anda para frente e ← → só giram", () => {
  const m = new Match(me, me, { arena: "fabrica" });
  m.robots[1].x = 2100; m.robots[1].y = 1300;
  const r = m.robots[0];
  r.x = 900; r.y = 560; r.angle = 0;
  const fwd = runTank(1, 1, 0, m);
  expect(fwd.at(-1)!.fwd).toBeGreaterThan(150);
  expect(Math.abs(r.angle)).toBeLessThan(0.01);
  runTank(1, 0, 0, m);
  const a0 = r.angle;
  runTank(0.3, 0, 1, m);
  expect(angDelta(r.angle, a0)).toBeGreaterThan(0.5); // gira para a direita (horário)
});

test("teclado: segurar ↓ dá ré, faz meia-volta e segue de frente", () => {
  const m = new Match(me, me, { arena: "fabrica" });
  m.robots[1].x = 2100; m.robots[1].y = 1300;
  const r = m.robots[0];
  r.x = 1500; r.y = 560; r.angle = 0;
  const tr = runTank(2.2, -1, 0, m);
  expect(tr.filter((p) => p.t > 0.15 && p.t < REVERSE_TIME).every((p) => p.fwd < 0)).toBe(true);
  const late = tr.filter((p) => p.t > 1.7);
  expect(late.every((p) => Math.cos(p.angle) < -0.99)).toBe(true); // virou 180°
  expect(late.at(-1)!.fwd).toBeGreaterThan(100); // andando de frente
  runTank(0.3, 0, 0, m); // soltou
  const again = runTank(0.3, -1, 0, m);
  expect(again.filter((p) => p.t > 0.12).every((p) => p.fwd < 0)).toBe(true); // ré de novo
});

function angDelta(a: number, b: number) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }

test("opção desligada: segurar ↓ continua de ré (sem meia-volta)", () => {
  const m = new Match(me, me, { arena: "fabrica" });
  m.robots[1].x = 2100; m.robots[1].y = 1300;
  const r = m.robots[0];
  r.x = 1500; r.y = 560; r.angle = 0;
  const dt = 1 / 60;
  for (let t = 0; t < 2; t += dt) {
    const inp = emptyInput();
    inp.heading = null; inp.throttle = -1; inp.autoUTurn = false;
    m.update(dt, [inp, emptyInput()]);
  }
  expect(Math.abs(r.angle)).toBeLessThan(0.01); // não girou
  expect(r.vx * Math.cos(r.angle) + r.vy * Math.sin(r.angle)).toBeLessThan(-100); // ainda de ré
  // joystick apontando para trás também fica de ré
  for (let t = 0; t < 1.5; t += dt) {
    const inp = emptyInput();
    inp.heading = 0; inp.headingMag = 1; inp.autoUTurn = false; // r olha para 0... aponta para trás:
    inp.heading = r.angle + Math.PI;
    m.update(dt, [inp, emptyInput()]);
  }
  expect(Math.cos(r.angle)).toBeGreaterThan(0.99);
});
