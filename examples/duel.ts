// Duelo sem tela: um cérebro programado por blocos contra a IA da campanha.
// Uso: bun examples/duel.ts [modelo] [oponente] [arena]
//   bun examples/duel.ts Toureiro 3 coliseu
import { Match } from "../src/engine";
import { Brain } from "../src/ai";
import { ProgramBrain, TEMPLATES } from "../src/brain-blocks";
import { CAMPAIGN, opponentWithLevels, type RobotBuild } from "../src/parts";
import { ARENAS } from "../src/arenas";

const [tplName = "Lutador", oppArg = "2", arenaId = "classica"] = process.argv.slice(2);

const tpl = TEMPLATES.find((t) => t.name.toLowerCase() === tplName.toLowerCase());
if (!tpl) throw new Error(`Modelo não encontrado. Opções: ${TEMPLATES.map((t) => t.name).join(", ")}`);
const stage = Math.max(0, Math.min(CAMPAIGN.length - 1, Number(oppArg) || 0));
if (!ARENAS.some((a) => a.id === arenaId)) throw new Error(`Arena não encontrada. Opções: ${ARENAS.map((a) => a.id).join(", ")}`);

const meu: RobotBuild = { name: tpl.name, color: 0xf5b700, chassis: "striker", drive: "wheels", armor: "steel", weapons: ["saw", "flame"] };
const rival = opponentWithLevels(CAMPAIGN[stage], stage);

const m = new Match(meu, rival, { arena: arenaId });
const cerebro = new ProgramBrain(tpl.make());
const ia = new Brain(CAMPAIGN[stage].difficulty);

console.log(`\n🤖 ${meu.name} (cérebro em blocos) x ${rival.name} (IA, dificuldade ${CAMPAIGN[stage].difficulty}) — arena ${arenaId}\n`);

const dt = 1 / 60;
let ultimo = -1;
for (let i = 0; i < 120 * 60 && !(m.over && m.endDelay <= 0); i++) {
  m.step(dt, [cerebro.think(m, m.robots[0], m.robots[1], dt), ia.think(m, m.robots[1], m.robots[0], dt)]);
  m.drainFx();
  const seg = Math.floor(99 - m.time);
  if (seg % 10 === 0 && seg !== ultimo && !m.over) {
    ultimo = seg;
    const [a, b] = m.robots;
    console.log(`t=${String(seg).padStart(2)}s  ${a.build.name.padEnd(10)} ${bar(a.hp / a.stats.hp)}  ${b.build.name.padEnd(13)} ${bar(b.hp / b.stats.hp)}  ação: ${cerebro.moving ?? "-"}`);
  }
}

const v = m.winner === null ? "Empate" : `Vencedor: ${m.robots[m.winner].build.name}`;
console.log(`\n🏁 ${v} em ${(99 - m.time).toFixed(1)}s\n`);

function bar(p: number) {
  const n = Math.round(Math.max(0, p) * 20);
  return "█".repeat(n) + "░".repeat(20 - n);
}
