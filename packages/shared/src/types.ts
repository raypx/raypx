export type SettingSource = "database" | "environment" | "default" | "missing";
export type InheritedSettingSource = Exclude<SettingSource, "database">;
export interface InheritedSetting<T> {
  value: T;
  source: InheritedSettingSource;
}
export interface SettingMutation<T> {
  action: "set";
  value: T;
}
export interface ResetSettingMutation {
  action: "reset";
}
export type UpdateSetting<T> = SettingMutation<T> | ResetSettingMutation;
export type UpdateSecret = { action: "replace"; value: string } | { action: "reset" };
export interface Clock {
  now(): Date;
}
export interface IdGenerator {
  next(): string;
}
export const defaultClock: Clock = { now: () => new Date() };
export const defaultIdGenerator: IdGenerator = {
  next: () => "evt_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2),
};
