import { expect, it } from "vite-plus/test";
import { isDevicePreferences } from "../../../preferences";

it.each([
  { fields: { theme: "dark", locale: "zh" }, valid: true },
  { fields: { locale: "zh" }, valid: false },
  { fields: { theme: "dark" }, valid: false },
  { fields: {}, valid: false },
])("validates own preference values in opaque native JSON: %j", ({ fields, valid }) => {
  const extensions = JSON.parse(
    '{"__proto__":{"theme":"dark","locale":"zh","polluted":true},"future":{"keep":true}}',
  ) as Record<string, unknown>;
  const raw = { ...extensions, ...fields };
  expect(Object.hasOwn(raw, "__proto__")).toBe(true);
  expect(Reflect.get(raw, "polluted")).toBeUndefined();
  expect(isDevicePreferences(raw)).toBe(valid);
});
