// Simula um jogador que NÃO paga jogando a Carreira, para conferir a economia:
// toda fase precisa ser vencível só com a sucata que o jogo deu até ali.
//   bun examples/carreira-sim.ts [fases=60] [habilidade=0.6] [tentativas=15]
// O "jogador" é a IA da campanha na habilidade indicada (0..1), com uma regra simples de compras.
import { Match } from "../src/engine";
import { Brain } from "../src/ai";
import {
  ARMORS, CHASSIS, DRIVES, MAX_LEVEL, WEAPONS, armorById, chassisById, driveById, upgradeCost, validateBuild, weaponById,
  type RobotBuild,
} from "../src/parts";
import { STARTER_PARTS, storyStage, unlockedAfter } from "../src/story";

// sorteios da IA reproduzíveis: o mesmo comando dá sempre o mesmo resultado
import { mulberry } from "../src/parts";
Math.random = mulberry(Number(process.argv[5] ?? 1));

const STAGES = Number(process.argv[2] ?? 60);
const SKILL = Number(process.argv[3] ?? 0.6);
const MAX_TRIES = Number(process.argv[4] ?? 15);
const STEP = 1 / 60;

const partCost = (id: string) => (chassisById[id] ?? driveById[id] ?? armorById[id] ?? weaponById[id]).cost;
const costOfPart = (id: string) => (chassisById[id] ?? driveById[id] ?? armorById[id] ?? weaponById[id]);

// preferência de um jogador razoável (melhor primeiro)
const PREF = {
  chassis: ["tita", "cunha", "striker", "vespa"],
  drive: ["treads", "omni", "wheels"],
  armor: ["titanio", "ceramica", "isolante", "steel", "aluminio"],
  weapons: ["hammer", "drill", "saw", "shock", "flipper", "missile", "flame", "disruptor", "spikes", "shield", "repair", "grounding", "antimissile", "smoke"],
};

interface Player { coins: number; owned: Set<string>; levels: Record<string, number> }

/** Quanto um jogador razoável valoriza cada arma (para escolher a melhor combinação que cabe no peso). */
const VALUE: Record<string, number> = { hammer: 10, drill: 8, saw: 8, shock: 7, flipper: 6, missile: 6, flame: 6, disruptor: 5, spikes: 4, shield: 4, repair: 4, grounding: 2, antimissile: 2, smoke: 1 };

function combos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [h, ...t] = arr;
  return [...combos(t, k - 1).map((c) => [h, ...c]), ...combos(t, k)];
}

/** Melhor robô possível com o que tem, respeitando o peso. */
function bestBuild(p: Player): RobotBuild {
  const ch = PREF.chassis.filter((id) => p.owned.has(id));
  const dr = PREF.drive.filter((id) => p.owned.has(id));
  const ar = PREF.armor.filter((id) => p.owned.has(id));
  const ws = PREF.weapons.filter((id) => p.owned.has(id));
  let best: RobotBuild | null = null, bestScore = -1;
  ch.forEach((c, ci) => dr.forEach((d, di) => ar.forEach((a, ai) => {
    for (let k = chassisById[c].slots; k >= 1; k--) {
      for (const weapons of combos(ws, k)) {
        const b: RobotBuild = { name: "Jogador", color: 0xf5b700, chassis: c, drive: d, armor: a, weapons, levels: p.levels };
        if (validateBuild(b)) continue;
        // armas valem mais; preferência de chassi/tração/blindagem desempata
        const score = weapons.reduce((s, w) => s + VALUE[w] * (1 + 0.15 * ((p.levels[w] ?? 1) - 1)), 0) * 10 - ci * 3 - di * 2 - ai * 2 + (p.levels[c] ?? 1);
        if (score > bestScore) { bestScore = score; best = b; }
      }
    }
  })));
  return best ?? { name: "Jogador", color: 0, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw"], levels: p.levels };
}

/** Gasta moedas: compra peça nova liberada que entra no robô; senão melhora a peça mais barata de melhorar. */
function shop(p: Player, unlocked: Set<string>) {
  for (;;) {
    const cur = bestBuild(p);
    const used = [cur.chassis, cur.drive, cur.armor, ...cur.weapons];
    // peça liberada, não comprada, que melhoraria o robô
    const wanted = [...unlocked].filter((id) => !p.owned.has(id)).filter((id) => {
      const test: Player = { ...p, owned: new Set([...p.owned, id]) };
      const b = bestBuild(test);
      return [b.chassis, b.drive, b.armor, ...b.weapons].includes(id);
    }).sort((a, b) => partCost(a) - partCost(b));
    if (wanted.length && partCost(wanted[0]) <= p.coins) { p.coins -= partCost(wanted[0]); p.owned.add(wanted[0]); continue; }
    if (wanted.length && partCost(wanted[0]) <= p.coins + 400) return; // junta para a peça nova
    const ups = used.map((id) => ({ id, lvl: p.levels[id] ?? 1 })).filter((u) => u.lvl < MAX_LEVEL)
      .map((u) => ({ ...u, cost: upgradeCost(costOfPart(u.id), u.lvl) })).sort((a, b) => a.cost - b.cost);
    if (ups.length && ups[0].cost <= p.coins) { p.coins -= ups[0].cost; p.levels[ups[0].id] = ups[0].lvl + 1; continue; }
    return;
  }
}

function fight(me: RobotBuild, foe: RobotBuild, foeDiff: number, arena: string) {
  const m = new Match(me, foe, { arena });
  const a = new Brain(SKILL), b = new Brain(foeDiff);
  for (let t = 0; t < 120 * 60 && !(m.over && m.endDelay <= 0); t++) m.update(STEP, [a.think(m, m.robots[0], m.robots[1], STEP), b.think(m, m.robots[1], m.robots[0], STEP)]);
  const dmg = m.robots[1].stats.hp - Math.max(0, m.robots[1].hp);
  return { won: m.winner === 0, dmg };
}

const p: Player = { coins: 250, owned: new Set(STARTER_PARTS), levels: {} };
let totalTries = 0, stuck = 0;
console.log("fase | tentativas | moedas | robô do jogador");
for (let n = 1; n <= STAGES; n++) {
  const s = storyStage(n);
  shop(p, unlockedAfter(n - 1));
  let tries = 0, won = false;
  while (!won && tries < MAX_TRIES) {
    tries++;
    const me = bestBuild(p);
    const r = fight(me, s.build, s.difficulty, s.arena);
    won = r.won;
    p.coins += (won ? s.reward : 25) + Math.round(r.dmg / 10);
    if (!won) shop(p, unlockedAfter(n - 1)); // perdeu: melhora o que der e tenta de novo
  }
  totalTries += tries;
  if (!won) stuck++;
  const me = bestBuild(p);
  const lv = [me.chassis, me.drive, me.armor, ...me.weapons].map((id) => `${id}${p.levels[id] ?? 1}`).join(" ");
  console.log(`${String(n).padStart(3)}${s.boss ? "*" : " "} | ${won ? String(tries).padStart(2) : "TRAVOU"} | ${String(p.coins).padStart(5)} | ${lv}  vs ${s.build.chassis}/${s.build.weapons.join("+")} d=${s.difficulty.toFixed(2)}`);
}
console.log(`\nmédia de tentativas por fase: ${(totalTries / STAGES).toFixed(2)} · fases em que travou (${MAX_TRIES} derrotas seguidas): ${stuck}`);
