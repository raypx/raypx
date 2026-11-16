const offset = Number(process.env.RAYPX_E2E_PORT_OFFSET ?? 0);
if (!Number.isInteger(offset) || offset < 0 || offset > 60_000)
  throw new Error("Invalid browser port offset");
export const web = `http://127.0.0.1:${4173 + offset}`;
export const desktop = `http://127.0.0.1:${4174 + offset}`;
