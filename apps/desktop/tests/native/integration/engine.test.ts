import { expect, it, vi } from "vite-plus/test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalEngine } from "../../../native/engine";

it("drains retired engine output during shutdown without emitting stale events or breaking its pipe", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-engine-drain-"));
  const receipt = join(directory, "drained"),
    binary = join(directory, "engine");
  writeFileSync(
    binary,
    `#!${process.execPath}
import { createInterface } from 'node:readline';
for await (const line of createInterface({input:process.stdin})) {
  const request=JSON.parse(line);
  process.stdout.write(JSON.stringify({version:1,id:request.id,result:{version:'fixture',protocolVersion:1}})+'\\n');
}
for(let index=0;index<20;index++) {
  await new Promise((resolve,reject)=>process.stdout.write('x'.repeat(100000)+'\\n',error=>error?reject(error):resolve()));
  await Bun.sleep(1);
}
await Bun.write(${JSON.stringify(receipt)},'drained');
`,
    { mode: 0o700 },
  );
  const emit = vi.fn();
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const engine = new LocalEngine(binary, "fixture", emit);
  try {
    expect(await engine.start()).toBe(true);
    const calls = emit.mock.calls.length;
    await engine.stop();
    expect(existsSync(receipt)).toBe(true);
    expect(emit).toHaveBeenCalledTimes(calls);
    expect(errors).not.toHaveBeenCalled();
  } finally {
    await engine.stop();
    errors.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
});

it("preserves an incompatible-owner error and replaces it only through explicit recovery", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-engine-upgrade-")),
    marker = join(directory, "replaced"),
    binary = join(directory, "engine");
  writeFileSync(
    binary,
    `#!${process.execPath}
import {existsSync,writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
if(process.argv.includes('restart')) {writeFileSync(${JSON.stringify(marker)},'');process.exit(0);}
if(!existsSync(${JSON.stringify(marker)})) {
 process.stdout.write(JSON.stringify({version:1,event:'engine.status',data:{status:'error',code:'HOST_VERSION_MISMATCH'}})+'\\n');
 await Bun.sleep(100);process.exit(1);
}
for await(const line of createInterface({input:process.stdin})) {
 const request=JSON.parse(line);process.stdout.write(JSON.stringify({version:1,id:request.id,result:{version:'fixture',protocolVersion:1,owner:'daemon'}})+'\\n');
}
`,
    { mode: 0o700 },
  );
  const engine = new LocalEngine(binary, "fixture", () => {}, [], true);
  try {
    expect(await engine.start()).toBe(false);
    expect(engine.status).toMatchObject({ status: "error", code: "HOST_VERSION_MISMATCH" });
    expect(existsSync(marker)).toBe(false);
    expect(await engine.replaceOwner()).toBe(true);
    expect(existsSync(marker)).toBe(true);
    expect(engine.status.status).toBe("ready");
  } finally {
    await engine.stop();
    rmSync(directory, { recursive: true, force: true });
  }
});
