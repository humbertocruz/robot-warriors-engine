// Núcleo do ranking dos cérebros. Roda no servidor (nota oficial) e no navegador (prévia):
// o motor e o interpretador de cérebros são determinísticos, então a mesma luta dá a mesma nota.
// Mudou número de arma, arena, robô ou motor? Suba ENGINE_VERSION (abre nova temporada).
import { ARENAS } from "./arenas";
import { Match } from "./engine";
import { ProgramBrain, TEMPLATES, type Program } from "./brain-blocks";
import type { RobotBuild } from "./parts";

// 1: lançamento. 2: armas quebram, Kit de Reparo, Escudo e Antimíssil (fase 2 de armas-defesas-e-posicoes).
export const ENGINE_VERSION = 2;
const STEP = 1 / 60;
const MATCH_SECONDS = 99;
/** Teto de passos por luta (a luta dura no máximo MATCH_SECONDS + a pausa final). */
const MAX_TICKS = Math.ceil((MATCH_SECONDS + 5) / STEP);

export interface RankingRobot { id: string; name: string; desc: string; build: RobotBuild }
export const RANKING_ROBOTS: readonly RankingRobot[] = [
  { id: "equilibrado", name: "Equilibrado", desc: "Chassi Striker, rodas, aço, serra e lança-chamas.",
    build: { name: "Equilibrado", color: 0xf5b700, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw", "flame"] } },
  { id: "veloz", name: "Veloz", desc: "Chassi Vespa, rodas omni, alumínio, broca e lança-chamas.",
    build: { name: "Veloz", color: 0x38bdf8, chassis: "vespa", drive: "omni", armor: "aluminio", weapons: ["drill", "flame"] } },
  { id: "tanque", name: "Tanque", desc: "Chassi Titã, esteiras, titânio, martelo, lança-chamas e mísseis.",
    build: { name: "Tanque", color: 0xe5484d, chassis: "tita", drive: "treads", armor: "titanio", weapons: ["hammer", "flame", "missile"] } },
  { id: "defensor", name: "Defensor", desc: "Chassi Titã, esteiras, aço, serra na frente, escudo na frente e Kit de Reparo atrás.",
    build: { name: "Defensor", color: 0x6ad15a, chassis: "tita", drive: "treads", armor: "steel", weapons: ["saw", "shield", "repair"], mounts: ["front", "front", "back"] } },
];
export const rankingRobotById = (id: string) => RANKING_ROBOTS.find((r) => r.id === id) ?? null;

/** Adversários de referência: os modelos prontos (cérebros determinísticos). */
export const RANKING_OPPONENTS: readonly { id: string; name: string }[] = TEMPLATES.map((t) => ({ id: t.name.toLowerCase(), name: t.name }));
export const RANKING_ARENAS: readonly { id: string; name: string }[] = ARENAS.map((a) => ({ id: a.id, name: a.name }));

export type Outcome = "win" | "draw" | "loss";
export interface ChallengeScore { arenaId: string; opponentId: string; outcome: Outcome; score: number }

/** Nota de uma luta, de 0 a 1000. */
export function scoreMatch(m: Match): { outcome: Outcome; score: number } {
  const [me, foe] = m.robots;
  const hpLeft = Math.max(0, me.hp) / me.stats.hp;
  const dealt = 1 - Math.max(0, foe.hp) / foe.stats.hp;
  if (m.winner === 0) {
    const speed = Math.max(0, Math.min(1, m.time / MATCH_SECONDS));
    return { outcome: "win", score: Math.round(600 + 250 * hpLeft + 150 * speed) };
  }
  if (m.winner === null) return { outcome: "draw", score: 200 };
  return { outcome: "loss", score: Math.round(200 * Math.max(0, Math.min(1, dealt))) };
}

export function runChallenge(program: Program, robotId: string, arenaId: string, opponentId: string): ChallengeScore {
  const robot = rankingRobotById(robotId);
  const template = TEMPLATES.find((t) => t.name.toLowerCase() === opponentId);
  if (!robot || !template) throw new Error("desafio inválido");
  const m = new Match(robot.build, robot.build, { arena: arenaId });
  const mine = new ProgramBrain(program);
  const theirs = new ProgramBrain(template.make());
  for (let t = 0; t < MAX_TICKS && !m.over; t++) {
    m.update(STEP, [mine.think(m, m.robots[0], m.robots[1], STEP), theirs.think(m, m.robots[1], m.robots[0], STEP)]);
  }
  const { outcome, score } = scoreMatch(m);
  return { arenaId, opponentId, outcome, score };
}

/** Todos os desafios de uma categoria (arenas × adversários). */
export function runCategory(program: Program, robotId: string): { results: ChallengeScore[]; total: number } {
  const results: ChallengeScore[] = [];
  for (const a of RANKING_ARENAS) for (const o of RANKING_OPPONENTS) results.push(runChallenge(program, robotId, a.id, o.id));
  const total = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  return { results, total };
}
