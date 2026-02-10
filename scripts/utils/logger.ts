import { createConsola } from "consola";

const logger = createConsola({
  level: process.env.NODE_ENV === "production" ? 3 : 4,
  formatOptions: {
    colors: true,
    date: true,
    compact: false,
  },
});

// Support dynamic level changes for silent mode
Object.defineProperty(logger, "level", {
  get() {
    return this._level ?? (process.env.NODE_ENV === "production" ? 3 : 4);
  },
  set(value: number) {
    this._level = value;
  },
});

export { logger };
