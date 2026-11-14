import { ComputerError } from "@raypx/providers/computer";
import { z } from "zod";
import type { SandboxConfig } from "./config.js";
import type { Engine } from "./engine.js";
import type { StoredComputer } from "./store.js";

/** Runs before opening the private listener. No image pulls or implicit runtime fallback. */
export async function verifyRuntime(config: SandboxConfig, engine: Engine) {
  const info = await engine.json<{
    Runtimes: Record<string, { path?: string; runtimeArgs?: string[] }>;
    DefaultRuntime: string;
    SecurityOptions: string[];
    MemoryLimit: boolean;
    CpuCfsQuota: boolean;
    PidsLimit: boolean;
  }>("/info");
  if (!Object.hasOwn(info.Runtimes, config.runtime))
    throw new Error("SANDBOX_RUNTIME is not installed in the Engine");
  if (config.untrustedTenants) {
    if (
      !config.allowDefaultRuntime &&
      (config.runtime === info.DefaultRuntime ||
        ["runc", "io.containerd.runc.v2"].includes(config.runtime))
    )
      throw new Error(
        "SANDBOX_UNTRUSTED_TENANTS refuses the default runtime; configure runsc or explicitly set SANDBOX_ALLOW_DEFAULT_RUNTIME=true",
      );
    if (
      !info.SecurityOptions.some((value) => value.startsWith("name=seccomp")) ||
      !info.MemoryLimit ||
      !info.CpuCfsQuota ||
      !info.PidsLimit
    )
      throw new Error("Untrusted tenants require Engine seccomp, CPU, memory and PID enforcement");
    const supplied = info.Runtimes[config.runtime]?.runtimeArgs ?? [];
    const args = supplied.map((arg, index) => {
      const next = supplied[index + 1];
      if (arg.startsWith("--") && !arg.includes("=") && next && !next.startsWith("--"))
        return `${arg}=${next}`;
      return arg;
    });
    if (
      args.some((arg) =>
        /^--(?:network=host|platform=ptrace|file-access=shared|directfs=true|allow-suid=true|allow-flag-override)/.test(
          arg,
        ),
      )
    )
      throw new Error("Unsafe SANDBOX_RUNTIME configuration");
    if (config.runtime === "runsc" && !args.includes("--oci-seccomp=true"))
      throw new Error("Untrusted runsc requires --oci-seccomp=true");
  }
}

/** Measure from a fresh trusted image, outside tenant PID/mount namespaces. */
export async function measureStorage(
  config: SandboxConfig,
  engine: Engine,
  c: StoredComputer,
  auxiliary?: Set<string>,
) {
  if (!c.volume) return { bytes: 0, entries: 0, complete: true };
  const { Id } = await engine.json<{ Id: string }>("/containers/create", "POST", {
    Image: config.image,
    User: "1000:1000",
    WorkingDir: "/",
    Entrypoint: [],
    Cmd: ["sleep", "infinity"],
    Labels: {
      "raypx.supervisor": config.network,
      "raypx.role": "meter",
      "raypx.instance": config.instance,
      "raypx.computer": c.id,
    },
    HostConfig: {
      Runtime: config.runtime,
      Memory: 134217728,
      MemorySwap: 134217728,
      NanoCpus: 250000000,
      PidsLimit: 128,
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      NetworkMode: "none",
      Init: true,
      Mounts: [
        {
          Type: "volume",
          Source: c.volume,
          Target: "/usage/home",
          ReadOnly: true,
          VolumeOptions: { NoCopy: true },
        },
        ...(c.inputVolume
          ? [
              {
                Type: "volume",
                Source: c.inputVolume,
                Target: "/usage/input",
                ReadOnly: true,
                VolumeOptions: { NoCopy: true },
              },
            ]
          : []),
      ],
      LogConfig: { Type: "none" },
    },
  });
  auxiliary?.add(Id);
  let stage = "start";
  try {
    await engine.response(`/containers/${Id}/start`, "POST");
    stage = "execute";
    const process = await engine.exec(
      Id,
      [
        "timeout",
        "5",
        "python3",
        "-I",
        "/opt/raypx/usage.py",
        String(config.homeEntries),
        String(config.homeBytes),
      ],
      [],
      "/",
    );
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const event of engine.output(process.body)) {
      const chunk = Buffer.from(event.bytes, "base64");
      bytes += chunk.length;
      if (bytes > 1024) throw new ComputerError("CAPACITY_UNAVAILABLE");
      chunks.push(chunk);
    }
    const exit = await engine.json<{ ExitCode: number }>(`/exec/${process.id}/json`);
    if (exit.ExitCode !== 0) throw new ComputerError("CAPACITY_UNAVAILABLE");
    stage = "parse";
    return z
      .strictObject({
        bytes: z.number().int().nonnegative(),
        entries: z.number().int().nonnegative(),
        complete: z.boolean(),
      })
      .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    console.error(JSON.stringify({ event: "sandbox.meter_failed", stage }));
    throw new ComputerError("CAPACITY_UNAVAILABLE");
  } finally {
    try {
      await engine.response(`/containers/${Id}?force=true&v=true`, "DELETE", undefined, [404]);
    } finally {
      auxiliary?.delete(Id);
    }
  }
}

/** Export a quiescent home after containment, without restarting tenant processes. */
export async function exportStoppedHome(
  config: SandboxConfig,
  engine: Engine,
  c: StoredComputer,
  auxiliary?: Set<string>,
) {
  const { Id } = await engine.json<{ Id: string }>("/containers/create", "POST", {
    Image: config.image,
    User: "1000:1000",
    WorkingDir: "/",
    Entrypoint: [],
    Cmd: ["sleep", "infinity"],
    Labels: {
      "raypx.supervisor": config.network,
      "raypx.role": "snapshot",
      "raypx.instance": config.instance,
      "raypx.computer": c.id,
    },
    HostConfig: {
      Runtime: config.runtime,
      Memory: 268435456,
      MemorySwap: 268435456,
      NanoCpus: 500000000,
      PidsLimit: 128,
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      NetworkMode: "none",
      Init: true,
      LogConfig: { Type: "none" },
      Mounts: [
        {
          Type: "volume",
          Source: c.volume,
          Target: "/home/computer",
          ReadOnly: true,
          VolumeOptions: { NoCopy: true },
        },
      ],
    },
  });
  auxiliary?.add(Id);
  try {
    await engine.response(`/containers/${Id}/start`, "POST");
    const process = await engine.exec(
      Id,
      [
        "timeout",
        "10",
        "python3",
        "-I",
        "-c",
        "import runpy,json; m=runpy.run_path('/opt/raypx/home.py'); print(json.dumps(m['export_home']()))",
      ],
      [],
      "/",
    );
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const event of engine.output(process.body)) {
      const chunk = Buffer.from(event.bytes, "base64");
      bytes += chunk.length;
      if (bytes > 64 * 1024 * 1024) throw new ComputerError("LIMIT_EXCEEDED");
      if (event.kind === "stdout") chunks.push(chunk);
    }
    const exit = await engine.json<{ ExitCode: number }>(`/exec/${process.id}/json`);
    if (exit.ExitCode !== 0) throw new ComputerError("RESTORE_FAILED");
    return JSON.parse(
      Buffer.concat(chunks).toString("utf8"),
    ) as import("@raypx/providers/computer").HomeArchive;
  } finally {
    try {
      await engine.response(`/containers/${Id}?force=true&v=true`, "DELETE", undefined, [404]);
    } finally {
      auxiliary?.delete(Id);
    }
  }
}

/** Cumulative cgroup writes also bound open-but-unlinked files hidden from directory scans. */
export async function writtenBytes(engine: Engine, container: string): Promise<number | undefined> {
  const stats = await engine.json<{
    blkio_stats?: { io_service_bytes_recursive?: { op: string; value: number }[] | null };
  }>(`/containers/${container}/stats?stream=false&one-shot=true`);
  const writes = stats.blkio_stats?.io_service_bytes_recursive?.filter(
    (entry) => entry.op.toLowerCase() === "write",
  );
  if (!writes?.length) return undefined;
  const bytes = writes.reduce((sum, entry) => sum + entry.value, 0);
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new ComputerError("CAPACITY_UNAVAILABLE");
  return bytes;
}
export async function verifyWriteAccounting(engine: Engine, container: string) {
  const process = await engine.exec(
    container,
    [
      "python3",
      "-I",
      "-c",
      "import os; p='/run/raypx/.io-check'; f=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600); os.write(f,b'x'*4096); os.fsync(f); os.close(f); os.unlink(p)",
    ],
    [],
    "/",
  );
  for await (const _ of engine.output(process.body)) {
    /* no content is retained */
  }
  const exit = await engine.json<{ ExitCode: number }>(`/exec/${process.id}/json`);
  if (exit.ExitCode !== 0) throw new ComputerError("CAPACITY_UNAVAILABLE");
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = await writtenBytes(engine, container);
    if (bytes !== undefined && bytes > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new ComputerError("CAPACITY_UNAVAILABLE");
}

/** Pin gVisor's resolver without a host bind or host networking. The stopped
 * setup container only lets the Engine populate an owned volume. The final
 * root-owned inode is mounted read-only; tenants cannot change it via /run. */
export async function prepareResolver(
  config: SandboxConfig,
  engine: Engine,
  volume: string,
  auxiliary: Set<string>,
) {
  const { Id } = await engine.json<{ Id: string }>("/containers/create", "POST", {
    Image: config.image,
    User: "1000:1000",
    WorkingDir: "/",
    Cmd: ["sleep", "infinity"],
    Labels: { "raypx.supervisor": config.network, "raypx.role": "setup" },
    HostConfig: {
      Runtime: config.runtime,
      Memory: 134217728,
      MemorySwap: 134217728,
      NanoCpus: 250000000,
      PidsLimit: 128,
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      NetworkMode: "none",
      LogConfig: { Type: "none" },
      Mounts: [{ Type: "volume", Source: volume, Target: "/run/raypx" }],
    },
  });
  auxiliary.add(Id);
  try {
    await engine.uploadInput(
      Id,
      "resolv.conf",
      Buffer.from(`nameserver ${config.dnsResolver}\noptions timeout:2 attempts:2\n`),
      0,
      0o444,
    );
  } finally {
    try {
      await engine.response(`/containers/${Id}?force=true&v=true`, "DELETE", undefined, [404]);
    } finally {
      auxiliary.delete(Id);
    }
  }
}
