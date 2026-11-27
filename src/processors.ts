/** Public engine model: processor capacity only; commercial prices intentionally omitted. */
export const PROCESSORS = [
  { id: "RW-I", capacity: 4 },
  { id: "RW-II", capacity: 8 },
  { id: "RW-III", capacity: 16 },
  { id: "RW-IV", capacity: 24 },
] as const;
export type ProcessorId = typeof PROCESSORS[number]["id"];
export type FirmwareLevel = 0 | 1 | 2 | 3 | 4;
export type FirmwareLevels = Record<"direction" | "attack" | "defense", FirmwareLevel>;
export interface Intelligence {
  processor: ProcessorId;
  owned: ProcessorId[];
  levels: FirmwareLevels;
}
export const defaultIntelligence = (): Intelligence => ({
  processor: "RW-I", owned: ["RW-I"], levels: { direction: 0, attack: 0, defense: 0 },
});
export const processorById = (id: ProcessorId) => PROCESSORS.find(p => p.id === id) ?? PROCESSORS[0];
export function firmwareLevels(config: Record<keyof FirmwareLevels, "manual" | "automatic">): FirmwareLevels {
  return { direction: config.direction === "automatic" ? 1 : 0, attack: config.attack === "automatic" ? 1 : 0, defense: config.defense === "automatic" ? 1 : 0 };
}
export const processingUsed = (levels: FirmwareLevels) => 2 * (levels.direction + levels.attack + levels.defense);
export const fitsProcessor = (id: ProcessorId, levels: FirmwareLevels) => processingUsed(levels) <= processorById(id).capacity;
export function hydrateIntelligence(raw: unknown): Intelligence {
  const base = defaultIntelligence();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<Intelligence>;
  const owned = PROCESSORS.filter(p => p.id === "RW-I" || (Array.isArray(r.owned) && r.owned.includes(p.id))).map(p => p.id);
  const processor = r.processor && owned.includes(r.processor) ? r.processor : "RW-I";
  const levels = { ...base.levels };
  for (const key of ["direction", "attack", "defense"] as const) {
    const n = r.levels?.[key];
    if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 4) levels[key] = n as FirmwareLevel;
  }
  return { processor, owned, levels: fitsProcessor(processor, levels) ? levels : base.levels };
}
