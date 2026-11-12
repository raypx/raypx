// happy-dom implements getAnimations(), which makes Base UI defer unmounts to animation frames.
// Tests assert the settled UI synchronously, as in a browser with reduced motion.
(globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean }).BASE_UI_ANIMATIONS_DISABLED = true;

// happy-dom binds Storage methods onto each instance, so `Storage.prototype` spies never fire
// and instance spies cannot be restored. Keep Web Storage methods on the prototype.
if ("localStorage" in globalThis) {
  class MemoryStorage {
    #items = new Map<string, string>();
    get length() {
      return this.#items.size;
    }
    key(index: number) {
      return [...this.#items.keys()][index] ?? null;
    }
    getItem(key: unknown) {
      return this.#items.get(String(key)) ?? null;
    }
    setItem(key: unknown, value: unknown) {
      this.#items.set(String(key), String(value));
    }
    removeItem(key: unknown) {
      this.#items.delete(String(key));
    }
    clear() {
      this.#items.clear();
    }
  }
  Object.defineProperty(globalThis, "Storage", { configurable: true, value: MemoryStorage });
  for (const name of ["localStorage", "sessionStorage"])
    Object.defineProperty(globalThis, name, { configurable: true, value: new MemoryStorage() });
}
