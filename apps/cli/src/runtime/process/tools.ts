import { existsSync } from "node:fs";
import { delimiter, dirname } from "node:path";
import { findExecutable } from "@raypx/runtime-node/process";
import { cliInstallation } from "./installation.ts";

export type Environment = Record<string, string | undefined>;
export class BundledTools {
  readonly node: string;
  readonly pnpm: string | null;
  constructor(layout = cliInstallation()) {
    this.node = layout.node;
    this.pnpm = layout.pnpm ?? findExecutable("pnpm");
  }
  environment(base: Environment = process.env): Environment {
    const key =
      (process.platform === "win32" &&
        Object.keys(base).find((name) => name.toUpperCase() === "PATH")) ||
      "PATH";
    const current = base[key] ?? "";
    const paths = current ? current.split(delimiter) : [];
    for (const file of [this.node, this.pnpm])
      if (file && existsSync(file) && !paths.includes(dirname(file))) paths.push(dirname(file));
    return { ...base, [key]: paths.join(delimiter) };
  }
}
