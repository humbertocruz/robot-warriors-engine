// Modo História: fases geradas por fórmula. A fase N é sempre a mesma para todo mundo:
// o número da fase é a semente do sorteio. NÃO mude a fórmula de uma versão publicada;
// para mudar, crie STORY_VERSION nova (ver docs/specs/modo-historia.md).
import { ARENAS } from "./arenas";
import {
  ARMORS, CHASSIS, DRIVES, MAX_LEVEL, STARTER_PARTS, WEAPONS, armorById, chassisById, driveById, isSupport, mulberry, upgradeCost, validateBuild, weaponById,
  type Mount, type RobotBuild,
} from "./parts";

export { STARTER_PARTS };

export const STORY_VERSION = 1;


/**
 * Em que fase cada peça aparece na loja (ao VENCER a fase indicada).
 * Básicas primeiro; as mais fortes (martelo, desnorteador, Titã) no fim.
 */
export const UNLOCKS: readonly { stage: number; part: string }[] = [
  { stage: 2, part: "spikes" },
  { stage: 4, part: "aluminio" },
  { stage: 6, part: "vespa" },
  { stage: 8, part: "treads" },
  { stage: 10, part: "flipper" },
  { stage: 12, part: "ceramica" },
  { stage: 14, part: "smoke" },
  { stage: 16, part: "isolante" },
  { stage: 18, part: "shield" },
  { stage: 20, part: "cunha" },
  { stage: 22, part: "drill" },
  { stage: 24, part: "grounding" },
  { stage: 26, part: "antimissile" },
  { stage: 28, part: "missile" },
  { stage: 30, part: "repair" },
  { stage: 32, part: "shock" },
  { stage: 34, part: "omni" },
  { stage: 36, part: "titanio" },
  { stage: 38, part: "disruptor" },
  { stage: 40, part: "tita" },
  { stage: 42, part: "hammer" },
];

/** Peças liberadas depois de vencer a fase `stage` (inclui as iniciais). */
export function unlockedAfter(stage: number): Set<string> {
  return new Set([...STARTER_PARTS, ...UNLOCKS.filter((u) => u.stage <= stage).map((u) => u.part)]);
}

/** Fase em que a peça é liberada (0 = já vem no começo). */
export const unlockStageOf = (part: string) => UNLOCKS.find((u) => u.part === part)?.stage ?? 0;

/** Peça que vencer esta fase libera (se houver). */
export const unlockOf = (stage: number) => UNLOCKS.find((u) => u.stage === stage)?.part ?? null;

export interface StoryStage {
  n: number;
  name: string;
  build: RobotBuild;
  difficulty: number;
  arena: string;
  reward: number;
  boss: boolean;
  /** peça liberada ao vencer */
  unlock: string | null;
}

/**
 * Dificuldade da IA: sobe rápido no começo e desacelera (0,25 na fase 1, ~0,54 na 20, ~0,70 na 40, teto 0,80).
 * Depois disso quem deixa a fase mais difícil são as peças e os níveis do inimigo, não a "mira" da IA.
 */
export const difficultyOf = (n: number) => 0.25 + 0.55 * (1 - Math.exp(-(n - 1) / 25));
/** Nível médio das peças do inimigo: sobe 1 a cada 13 fases, sem degrau (cada peça sorteia arredondar para cima ou para baixo). */
export const enemyLevelOf = (n: number) => Math.min(MAX_LEVEL, 1 + (n - 1) / 13);
/**
 * Moedas na primeira vitória (revanche paga 1/3, como hoje). Para de crescer na fase 60:
 * a simulação mostra que por volta dali o robô já está todo no nível máximo.
 */
export const rewardOf = (n: number, boss: boolean) => Math.round((90 + Math.min(n, 60) * 14) * (boss ? 2 : 1) / 10) * 10;

const NAMES_A = ["Ferro", "Sucata", "Trovão", "Rolo", "Pistão", "Faísca", "Moenda", "Brasa", "Parafuso", "Cobalto", "Gancho", "Turbina", "Rebite", "Graxa", "Bigorna", "Vapor"];
const NAMES_B = ["Velho", "Doido", "Bruto", "Veloz", "Teimoso", "Elétrico", "Pesado", "Sombrio", "de Aço", "Brabo", "Nervoso", "Mk II", "Mk III", "X", "Zero", "Supremo"];
const COLORS = [0x9a6b4a, 0xe84a2f, 0x2fb8e8, 0x6ad15a, 0xff7a1a, 0xb36ae8, 0xe5484d, 0xd9c45f, 0x5fd9c4, 0xcfcfcf];

/**
 * Chefes feitos à mão nas fases 10, 20... 60 (os da campanha atual). Usam só peças liberadas até ali
 * mais no máximo a próxima. Depois da 60 os chefes são gerados ("elite": 3 armas, um nível acima).
 */
const BOSSES: Record<number, { name: string; build: Omit<RobotBuild, "levels" | "name">; quote: string }> = {
  10: { name: "Churrasqueira", quote: "Ao ponto ou bem passado?", build: { color: 0xe84a2f, chassis: "vespa", drive: "treads", armor: "aluminio", weapons: ["flame", "spikes"] } },
  20: { name: "Rolo Compressor", quote: "Sai da frente.", build: { color: 0xd9c45f, chassis: "cunha", drive: "treads", armor: "ceramica", weapons: ["saw", "flipper"] } },
  30: { name: "Faísca", quote: "Zzzzt.", build: { color: 0x2fb8e8, chassis: "vespa", drive: "wheels", armor: "isolante", weapons: ["missile", "repair"] } },
  40: { name: "Vulcão", quote: "A arena vai derreter.", build: { color: 0xff7a1a, chassis: "tita", drive: "treads", armor: "ceramica", weapons: ["flame", "shock", "antimissile"] } },
  50: { name: "Marreta", quote: "Bate que é sucesso.", build: { color: 0x6ad15a, chassis: "cunha", drive: "treads", armor: "steel", weapons: ["hammer", "flipper"] } },
  60: { name: "ÔMEGA", quote: "Fim da linha.", build: { color: 0xb36ae8, chassis: "tita", drive: "omni", armor: "titanio", weapons: ["drill", "missile", "shield"], mounts: ["front", "front", "back"] } },
};
export const bossQuote = (n: number) => BOSSES[n]?.quote ?? null;

/** Gera a fase `n` (1, 2, 3...). Determinístico. */
export function storyStage(n: number): StoryStage {
  if (!Number.isInteger(n) || n < 1) throw new Error("fase inválida");
  const rnd = mulberry(n * 7919 + STORY_VERSION * 104729);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const boss = n % 10 === 0;
  const lvl = enemyLevelOf(n) + (boss && !BOSSES[n] ? 1 : 0);
  const arena = ARENAS[Math.floor((n - 1) / 10) % ARENAS.length].id;
  const reward = rewardOf(n, boss);
  const unlock = unlockOf(n);
  // peça nova para o jogador também é nova para o inimigo: a da próxima fase vem no nível 1,
  // e as liberadas há menos de 6 fases ficam no máximo no nível 2 (o jogador acabou de comprar a dele)
  const withLevels = (b: Omit<RobotBuild, "levels">): RobotBuild => {
    const levels: Record<string, number> = {};
    for (const id of [b.chassis, b.drive, b.armor, ...b.weapons]) {
      if (!id) continue;
      const since = n - unlockStageOf(id);
      const cap = since <= 0 ? 1 : since < 6 ? 2 : MAX_LEVEL;
      levels[id] = Math.max(1, Math.min(cap, MAX_LEVEL, Math.floor(lvl + rnd())));
    }
    return { ...b, levels };
  };

  if (n === 1) {
    return { n, name: "Ferrugem", boss: false, arena, reward, unlock, difficulty: difficultyOf(n), build: withLevels({ name: "Ferrugem", color: 0x9a6b4a, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw"] }) };
  }
  if (BOSSES[n]) {
    const b = BOSSES[n];
    return { n, name: b.name, boss, arena, reward, unlock, difficulty: difficultyOf(n) + 0.05, build: withLevels({ name: b.name, ...b.build }) };
  }

  // inimigo usa o que está liberado até aqui + a próxima peça (o jogador vê antes de ganhar)
  const pool = unlockedAfter(n - 1);
  if (unlock) pool.add(unlock);
  const has = (id: string) => pool.has(id);
  const name = `${pick(NAMES_A)} ${pick(NAMES_B)}`;
  const color = pick(COLORS);
  const chassisList = CHASSIS.filter((c) => has(c.id));
  const drives = DRIVES.filter((d) => has(d.id));
  const armors = ARMORS.filter((a) => has(a.id));
  const attack = WEAPONS.filter((w) => has(w.id) && !isSupport(w.kind));
  const support = WEAPONS.filter((w) => has(w.id) && isSupport(w.kind));
  // a peça nova da fase aparece no inimigo, se couber
  const featured = unlock;

  for (let tries = 0; tries < 40; tries++) {
    const chassis = featured && chassisById[featured] ? chassisById[featured] : pick(chassisList);
    const drive = featured && drives.some((d) => d.id === featured) ? featured : pick(drives).id;
    const armor = featured && armors.some((a) => a.id === featured) ? featured : pick(armors).id;
    const weapons: string[] = [];
    if (featured && weaponById[featured]) weapons.push(featured);
    if (!weapons.some((w) => !isSupport(weaponById[w].kind))) weapons.unshift(pick(attack).id);
    while (weapons.length < chassis.slots) {
      // ~1 em 3 slots extras vira defesa (se já houver alguma liberada)
      const w = support.length && rnd() < 0.33 ? pick(support) : pick(attack);
      if (!weapons.includes(w.id)) weapons.push(w.id);
      else if (rnd() < 0.3) break;
    }
    // espinhos/escudo às vezes atrás, a partir da fase 15
    const mounts: Mount[] = weapons.map((w) => (n >= 15 && (w === "spikes" || w === "shield") && rnd() < 0.4 ? "back" : "front"));
    const build = withLevels({ name, color, chassis: chassis.id, drive, armor, weapons, mounts });
    if (!validateBuild(build)) return { n, name: boss ? `${name} (chefe)` : name, boss, arena, reward, unlock, difficulty: difficultyOf(n) + (boss ? 0.05 : 0), build };
  }
  // fallback: sempre válido
  return { n, name, boss, arena, reward, unlock, difficulty: difficultyOf(n), build: withLevels({ name, color, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw"] }) };
}

/** Estrelas da vitória: 1 = venceu, 2 = com metade da vida, 3 = com metade da vida e em menos de 45 s. */
export function starsOf(won: boolean, hpPct: number, seconds: number): 0 | 1 | 2 | 3 {
  if (!won) return 0;
  if (hpPct >= 0.5 && seconds < 45) return 3;
  if (hpPct >= 0.5) return 2;
  return 1;
}

// ---------- progresso do jogador ----------

/** Progresso da Carreira no save: `stage` é a próxima fase a vencer; `stars` guarda a melhor marca de cada fase. */
export interface StoryProgress { version: number; stage: number; stars: Record<string, number> }
export const newStory = (): StoryProgress => ({ version: STORY_VERSION, stage: 1, stars: {} });

/** Peças liberadas para quem está na fase `stage` (venceu até `stage - 1`). */
export const unlockedFor = (p: StoryProgress) => unlockedAfter(p.stage - 1);

const partOf = (id: string) => chassisById[id] ?? driveById[id] ?? armorById[id] ?? weaponById[id];

/** Quanto foi gasto numa peça: preço + melhorias até o nível atual. */
export function spentOn(id: string, level: number): number {
  const p = partOf(id);
  if (!p) return 0;
  let total = p.cost;
  for (let l = 1; l < level; l++) total += upgradeCost(p, l);
  return total;
}

/** Resultado de uma luta da Carreira: estrelas novas, fase liberada e peça nova. */
export function applyStoryResult(p: StoryProgress, n: number, stars: number): { next: StoryProgress; firstWin: boolean; unlocked: string | null } {
  const best = Math.max(p.stars[n] ?? 0, stars);
  const firstWin = stars > 0 && n === p.stage;
  const next: StoryProgress = { ...p, stars: best > 0 ? { ...p.stars, [n]: best } : p.stars, stage: firstWin ? p.stage + 1 : p.stage };
  return { next, firstWin, unlocked: firstWin ? unlockOf(n) : null };
}

export const totalStars = (p: StoryProgress) => Object.values(p.stars).reduce((a, b) => a + b, 0);

/**
 * Leva um save da Campanha antiga para a Carreira:
 * - cada oponente vencido vale 5 fases (quem venceu os 6 começa na fase 31);
 * - peças que ainda não estariam liberadas saem do save, e o que foi gasto nelas (preço + melhorias) volta em moedas;
 * - o robô é refeito só com o que ficou.
 */
export function migrateSave<T extends { owned: string[]; levels: Record<string, number>; coins: number; stage: number; build: RobotBuild }>(
  s: T,
): T & { story: StoryProgress; notice?: string } {
  const story: StoryProgress = { ...newStory(), stage: Math.min(6, Math.max(0, s.stage | 0)) * 5 + 1 };
  const unlocked = unlockedFor(story);
  const removed = s.owned.filter((id) => !unlocked.has(id));
  if (!removed.length) return { ...s, story };
  const refund = removed.reduce((t, id) => t + spentOn(id, s.levels[id] ?? 1), 0);
  const owned = s.owned.filter((id) => unlocked.has(id));
  const levels = Object.fromEntries(Object.entries(s.levels).filter(([id]) => unlocked.has(id)));
  const keep = (id: string, fallback: string) => (owned.includes(id) ? id : fallback);
  const chassis = keep(s.build.chassis, "striker");
  const slots = chassisById[chassis].slots;
  // armas que ficaram, na ordem, encostadas no começo (sem slot vazio no meio)
  const kept = s.build.weapons.map((w, i) => ({ w, m: s.build.mounts?.[i] ?? ("front" as Mount) })).filter((x) => x.w && owned.includes(x.w)).slice(0, slots);
  if (!kept.some((x) => !isSupport(weaponById[x.w].kind))) kept.unshift({ w: "saw", m: "front" });
  const top = kept.slice(0, slots);
  const weapons = Array.from({ length: slots }, (_, i) => top[i]?.w ?? "");
  const mounts = Array.from({ length: slots }, (_, i) => top[i]?.m ?? ("front" as Mount));
  let build: RobotBuild = { ...s.build, chassis, drive: keep(s.build.drive, "wheels"), armor: keep(s.build.armor, "steel"), weapons, mounts };
  if (validateBuild({ ...build, levels })) build = { ...build, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw", "flame"], mounts: ["front", "front"] };
  const list = removed.map((id) => partOf(id)?.name ?? id);
  const names = list.length > 1 ? `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}` : list[0];
  return {
    ...s, owned, levels, build, story, coins: s.coins + refund,
    notice: `A Campanha virou Carreira e você começa na fase ${story.stage}. ${names} ${removed.length > 1 ? "voltam" : "volta"} a ser ${removed.length > 1 ? "liberadas" : "liberada"} ao longo das fases; devolvemos ⚙️ ${refund} de sucata pelo que você tinha gasto.`,
  };
}
