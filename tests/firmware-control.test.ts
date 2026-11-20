import { describe, expect, test } from "bun:test";
import { defaultIntelligence, fitsProcessor, hydrateIntelligence, processingUsed } from "../src/processors";
import { composeControl, controlMode } from "../src/hybrid-control";
import { emptyInput } from "../src/engine";
import { weaponById } from "../src/parts";

describe("public firmware capacity", () => {
  test("default config is valid and uses no CPU", () => {
    const state = defaultIntelligence();
    expect(processingUsed(state.levels)).toBe(0);
    expect(fitsProcessor(state.processor, state.levels)).toBe(true);
  });
  test("rejects over-budget config", () => {
    expect(fitsProcessor("RW-I", { direction: 3, attack: 2, defense: 1 })).toBe(false);
  });
  test("untrusted state cannot activate an unowned processor", () => {
    const state = hydrateIntelligence({ processor: "RW-IV", owned: ["RW-I"], levels: { direction: 4, attack: 4, defense: 4 } });
    expect(state.processor).toBe("RW-I");
    expect(state.levels.direction).toBe(0);
  });
});
describe("hybrid control", () => {
  test("identifies manual and autonomous modes", () => {
    expect(controlMode({ direction: "manual", attack: "manual", defense: "manual" })).toBe("manual");
    expect(controlMode({ direction: "automatic", attack: "automatic", defense: "automatic" })).toBe("autonomous");
  });
  test("direction is selected independently from attacks", () => {
    const manual = { ...emptyInput(), throttle: 1, fire: [true, false, false] };
    const automatic = { ...emptyInput(), throttle: -1, fire: [false, true, false] };
    const weapons = [{ def: weaponById("saw") }] as any;
    const result = composeControl({ direction: "automatic", attack: "manual", defense: "automatic" }, manual, automatic, weapons);
    expect(result.throttle).toBe(-1);
    expect(result.fire[0]).toBe(true);
    expect(manual.throttle).toBe(1);
  });
});
