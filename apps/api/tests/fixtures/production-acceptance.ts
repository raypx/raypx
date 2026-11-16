import { readFile, writeFile } from "node:fs/promises";
import {
  cleanProductionAcceptance,
  productionAcceptanceState,
} from "../helpers/production-acceptance.js";

const {
  TEST_DATABASE_URL: databaseURL,
  RAYPX_PRODUCTION_TEST_EMAIL: email,
  RAYPX_PRODUCTION_STATE_FILE: file,
} = process.env;
if (!databaseURL || !email || !file)
  throw new Error("Explicit owned production acceptance inputs required");
if (process.argv[2] === "prepare") {
  await writeFile(file, JSON.stringify(await productionAcceptanceState(databaseURL)), {
    mode: 0o600,
  });
} else if (process.argv[2] === "cleanup") {
  await cleanProductionAcceptance(
    databaseURL,
    email,
    JSON.parse(await readFile(file, "utf8")) as { hadBootstrap: boolean },
  );
} else throw new Error("Choose prepare or cleanup");
