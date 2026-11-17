// Reforços da Carreira: pagos com créditos ⚡, usados uma vez por luta. O preço vale também no servidor.
// Nunca valem na luta rápida, no ranking nem no duelo de cérebros.

export type PreBoostId = "armor" | "battery" | "sabotage";
export type LiveBoostId = "repair" | "freeze" | "orbital";
export type BoostId = PreBoostId | LiveBoostId;

export interface BoostDef { id: BoostId; when: "pre" | "live"; name: string; desc: string; icon: string; price: number }

export const BOOSTS: readonly BoostDef[] = [
  { id: "armor", when: "pre", name: "Blindagem extra", desc: "+25% de vida máxima nesta luta.", icon: "🛡️", price: 150 },
  { id: "battery", when: "pre", name: "Bateria turbinada", desc: "Energia recarrega 50% mais rápido.", icon: "🔋", price: 150 },
  { id: "sabotage", when: "pre", name: "Sabotagem", desc: "O inimigo começa com 15% menos vida.", icon: "🪛", price: 150 },
  { id: "repair", when: "live", name: "Reparo instantâneo", desc: "+30% de vida na hora.", icon: "🔧", price: 200 },
  { id: "freeze", when: "live", name: "Pulso congelante", desc: "Inimigo paralisado por 2 s.", icon: "❄️", price: 200 },
  { id: "orbital", when: "live", name: "Ataque orbital", desc: "Marca o inimigo e, 1 s depois, 40 de dano no ponto (dá para desviar).", icon: "🎯", price: 200 },
];
export const boostById = Object.fromEntries(BOOSTS.map((b) => [b.id, b])) as Record<BoostId, BoostDef>;
export const isBoostId = (v: unknown): v is BoostId => typeof v === "string" && v in boostById;

/** Preço do "Continuar": cresce a cada uso na mesma luta. */
export const CONTINUE_PRICES = [300, 500, 800] as const;
export const continuePrice = (used: number) => CONTINUE_PRICES[Math.min(used, CONTINUE_PRICES.length - 1)];
/** Quantos "Continuar" cabem numa luta. */
export const MAX_CONTINUES = 3;
/** Vida com que o robô volta ao continuar. */
export const CONTINUE_HP = 0.4;
