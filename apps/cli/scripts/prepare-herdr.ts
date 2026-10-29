import { resolve } from "node:path";
import { prepareHerdr } from "../src/runtime/process/herdr-release";

const [output] = process.argv.slice(2);
if (!output) throw new Error("Usage: prepare-herdr.ts <output-directory>");
await prepareHerdr(resolve(output));
