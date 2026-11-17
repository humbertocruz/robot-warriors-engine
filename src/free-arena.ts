// Arena livre: o adversário sorteado acompanha o nível do robô do jogador.
// Spec: docs/specs/arena-livre-e-cerebro.md
import { avgLevel, mulberry, randomBuild, withAvgLevel, type RobotBuild } from "./parts";

/** Faixa da dificuldade da IA, sorteada a cada luta (não depende de quantas vitórias o jogador tem). */
export const FREE_DIFFICULTY = [0.4, 0.75] as const;

/** Sucata pela vitória manual: 40 + 10 por nível médio do adversário. */
export const freeReward = (foe: RobotBuild) => Math.round(40 + 10 * avgLevel(foe));

export interface FreeOpponent { build: RobotBuild; difficulty: number; reward: number }

/** Adversário sorteado: só peças liberadas, dentro do peso, no nível médio do jogador. */
export function freeOpponent(player: RobotBuild, allowed: ReadonlySet<string>, seed = Math.random()): FreeOpponent {
  const rnd = mulberry(Math.floor(seed * 1e9) ^ 0x5f3759df);
  const build = withAvgLevel(randomBuild(seed, allowed), avgLevel(player), rnd);
  const [lo, hi] = FREE_DIFFICULTY;
  const difficulty = Math.round((lo + (hi - lo) * rnd()) * 100) / 100;
  return { build, difficulty, reward: freeReward(build) };
}
