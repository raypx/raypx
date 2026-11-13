#!/usr/bin/env bun
import { runDrizzleKit } from "../src/cli.js";

process.exitCode = await runDrizzleKit(process.argv.slice(2));
