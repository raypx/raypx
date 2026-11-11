import { afterEach } from "bun:test";

const restore: (() => void)[] = [];

afterEach(() => {
  for (const reset of restore.splice(0).reverse()) reset();
});

export function stubEnv(name: string, value: string | undefined) {
  const previous = process.env[name];
  const set = (next: string | undefined) => {
    if (next === undefined) delete process.env[name];
    else process.env[name] = next;
  };
  restore.push(() => set(previous));
  set(value);
}

export function stubGlobal(name: keyof typeof globalThis, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  restore.push(() => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else Reflect.deleteProperty(globalThis, name);
  });
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
