import { createConsola } from "consola";

export const logger = createConsola({
  level: process.env.NODE_ENV === "production" ? 3 : 4,
  formatOptions: {
    colors: true,
    date: true,
    compact: false,
  },
});
