export type SettingSource = "database" | "environment" | "default" | "missing";
export type InheritedSettingSource = Exclude<SettingSource, "database">;
export interface InheritedSetting<T> {
  value: T;
  source: InheritedSettingSource;
}
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
