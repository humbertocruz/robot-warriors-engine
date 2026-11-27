import type { Input, Robot } from "./engine";
import { isSupport } from "./parts";

export type ControlSource = "manual" | "automatic";
export interface ControlConfig {
  direction: ControlSource;
  attack: ControlSource;
  defense: ControlSource;
}
export const MANUAL_CONTROL: Readonly<ControlConfig> = {
  direction: "manual", attack: "manual", defense: "manual",
};
export type ControlMode = "manual" | "assisted" | "autonomous";
export function controlMode(config: ControlConfig): ControlMode {
  const count = [config.direction, config.attack, config.defense].filter(x => x === "automatic").length;
  return count === 0 ? "manual" : count === 3 ? "autonomous" : "assisted";
}
/** Compose inputs without mutating either source or exposing commercial application logic. */
export function composeControl(
  config: ControlConfig,
  manual: Readonly<Input>,
  automatic: Readonly<Input>,
  weapons: Readonly<Robot["weapons"]>,
): Input {
  const direction = config.direction === "automatic" ? automatic : manual;
  const fire = [false, false, false];
  for (let i = 0; i < fire.length; i++) {
    const weapon = weapons[i];
    if (!weapon || weapon.def.mode === "passive") continue;
    const owner = isSupport(weapon.def.kind) ? config.defense : config.attack;
    fire[i] = (owner === "automatic" ? automatic : manual).fire[i] === true;
  }
  return {
    throttle: direction.throttle, turn: direction.turn,
    heading: direction.heading, headingMag: direction.headingMag,
    boost: direction.boost, autoUTurn: direction.autoUTurn, fire,
  };
}
