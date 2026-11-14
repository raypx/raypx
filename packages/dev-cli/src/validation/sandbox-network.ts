import { createHash } from "node:crypto";
import type { SandboxPlan } from "./sandbox-plan.js";
import type { SandboxRuntime } from "./sandbox.js";

/** Owned public-shaped destination, never an external download/abuse target. */
export async function acceptSandboxNetwork(
  plan: SandboxPlan,
  runtime: SandboxRuntime,
  docker: (args: string[]) => Promise<string>,
  prefix: string[],
  image: string,
  url: string,
  token: string,
) {
  const network = `${plan.namespace}-public-fixture`;
  const bridge = `rpf${createHash("sha256").update(plan.id).digest("hex").slice(0, 10)}`;
  const octet = Number.parseInt(plan.id.slice(0, 2), 16);
  const subnet = `11.255.${octet}.248/29`;
  const address = `11.255.${octet}.250`;
  const name = `${plan.namespace}-network-fixture`;
  const tag = `raypx-network-fixture:${plan.id}`;
  const computers: string[] = [];
  const ipt = (args: string[]) => runtime.capture([...prefix, "iptables", "-w", "1", ...args]);
  const rules = [
    [
      "-i",
      plan.bridge,
      "-o",
      bridge,
      "-d",
      `${address}/32`,
      "-m",
      "comment",
      "--comment",
      tag,
      "-j",
      "ACCEPT",
    ],
    [
      "-i",
      bridge,
      "-o",
      plan.bridge,
      "-s",
      `${address}/32`,
      "-m",
      "conntrack",
      "--ctstate",
      "ESTABLISHED,RELATED",
      "-m",
      "comment",
      "--comment",
      tag,
      "-j",
      "ACCEPT",
    ],
  ];
  async function create(spaceId: string) {
    const id = crypto.randomUUID();
    computers.push(id);
    await runtime.request(url, token, `computers/${id}/create`, { generation: 1, spaceId });
    return id;
  }
  async function execute(id: string, script: string) {
    return (await runtime.request(url, token, `computers/${id}/exec`, {
      generation: 1,
      executionId: crypto.randomUUID(),
      command: {
        executable: "python3",
        argv: ["-I", "-c", script, address],
        cwd: ".",
        environment: {},
        outputBudget: 4096,
      },
    })) as { status: number; stdout: string };
  }
  async function stopped(id: string, reason: string) {
    for (let attempt = 0; attempt < 120; attempt++) {
      const value = (await runtime.request(url, token, `computers/${id}/get`, {
        generation: 1,
      })) as { state: string; unavailableReason?: string };
      if (value.state === "stopped") {
        if (value.unavailableReason !== reason)
          throw new Error("Network stop reason did not match its budget");
        return;
      }
      await runtime.pause();
    }
    throw new Error("Network budget did not stop compute");
  }
  const download = (bytes: number) => `import json,socket,sys,time
s=socket.create_connection((sys.argv[1],80),2);s.settimeout(20);start=time.monotonic()
s.sendall(b'GET /${bytes} HTTP/1.0\\r\\nHost: fixture\\r\\n\\r\\n')
n=0
try:
 while True:
  data=s.recv(16384)
  if not data: break
  n+=len(data)
except OSError: pass
s.close(); print(json.dumps({'bytes':n,'seconds':time.monotonic()-start}))
`;
  let fixtureCreated = false;
  let fixtureStarted = false;
  let hooked = 0;
  try {
    // Refuse a pre-existing route rather than redirect any other workload.
    const route = await runtime.capture([...prefix, "ip", "-4", "route", "show", "exact", subnet]);
    if (route.trim()) throw new Error("Public fixture subnet is already routed");
    await docker([
      "network",
      "create",
      "--internal",
      "--subnet",
      subnet,
      "--opt",
      `com.docker.network.bridge.name=${bridge}`,
      "--label",
      `raypx.supervisor=${plan.network}`,
      network,
    ]);
    fixtureCreated = true;
    const server = `import http.server,socketserver,threading,socket,time
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  if self.path=='/hold': time.sleep(20);return
  n=min(2097152,int(self.path[1:]));self.send_response(200);self.send_header('Content-Length',str(n));self.end_headers()
  try:
   while n>0:
    k=min(16384,n);self.wfile.write(b'x'*k);n-=k
  except OSError: pass
server=http.server.ThreadingHTTPServer(('0.0.0.0',80),Handler);server.daemon_threads=True
def smtp():
 s=socket.socket();s.bind(('0.0.0.0',25));s.listen()
 while True:
  c,_=s.accept();c.close()
threading.Thread(target=smtp,daemon=True).start();server.serve_forever()
`;
    await docker([
      "run",
      "--detach",
      "--name",
      name,
      "--label",
      `raypx.supervisor=${plan.network}`,
      "--label",
      "raypx.role=network-fixture",
      "--network",
      network,
      "--ip",
      address,
      "--read-only",
      "--user",
      "1000:1000",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--memory",
      "134217728",
      "--pids-limit",
      "64",
      "--sysctl",
      "net.ipv4.ip_unprivileged_port_start=0",
      "--log-driver",
      "none",
      image,
      "python3",
      "-I",
      "-u",
      "-c",
      server,
    ]);
    fixtureStarted = true;
    // These two fixture-only forwarding accepts follow every tenant privacy and
    // cost hook. They permit no private/host address or tenant-to-tenant traffic.
    for (const rule of rules) {
      await ipt(["-I", "DOCKER-USER", "4", ...rule]);
      hooked++;
    }
    await runtime.step("network-public-control", async () => {
      const script = `import socket,sys,time,json
for port in (25,80):
 deadline=time.monotonic()+5
 while True:
  try:
   s=socket.create_connection((sys.argv[1],port),2);s.close();break
  except ConnectionRefusedError:
   if time.monotonic()>=deadline:raise
   time.sleep(.1)
s=socket.create_connection((sys.argv[1],80),2);t=time.monotonic();s.sendall(b'GET /262144 HTTP/1.0\\r\\nHost: fixture\\r\\n\\r\\n');n=0
while True:
 d=s.recv(65536)
 if not d:break
 n+=len(d)
print(json.dumps({'bytes':n,'seconds':time.monotonic()-t}))`;
      const value = JSON.parse(
        await runtime.capture([...prefix, "python3", "-I", "-c", script, address]),
      ) as { bytes: number; seconds: number };
      if (value.bytes < 262144 || value.seconds > 1)
        throw new Error("Network rate control is not fast enough");
      runtime.report(`network-public-control: ${JSON.stringify(value)}`);
    });
    const space = crypto.randomUUID();
    const a = await create(space);
    await runtime.step("network-rate", async () => {
      const result = await execute(a, download(262144));
      const proof = JSON.parse(result.stdout) as { bytes: number; seconds: number };
      if (result.status || proof.bytes < 262144 || proof.seconds < 1.8)
        throw new Error("Host byte rate was not enforced");
      runtime.report(`network-rate: ${JSON.stringify(proof)}`);
    });
    await runtime.step("network-start-budget", async () => {
      await execute(a, download(2097152)).catch(() => {});
      await stopped(a, "COMPUTER_TRANSFER_LIMIT");
    });
    await runtime.step("network-space-day-budget", async () => {
      const b = await create(space);
      await execute(b, download(2097152)).catch(() => {});
      await stopped(b, "SPACE_DAILY_TRANSFER_LIMIT");
      const c = crypto.randomUUID();
      computers.push(c);
      let refused = false;
      try {
        await runtime.request(url, token, `computers/${c}/create`, {
          generation: 1,
          spaceId: space,
        });
      } catch (error) {
        refused = error instanceof Error && error.message.includes("SPACE_DAILY_TRANSFER_LIMIT");
      }
      if (!refused) throw new Error("Space daily budget did not refuse admission");
    });
    const c = await create(crypto.randomUUID());
    await runtime.step("network-abuse-ports", async () => {
      const before = await ipt(["-n", "-v", "-x", "-L", `RPX_E_${plan.bridge.slice(3)}`]);
      const script = `import concurrent.futures,json,socket,sys
def check(port):
 try:
  s=socket.create_connection((sys.argv[1],port),.7);s.close();return False
 except TimeoutError:return True
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:r=list(pool.map(check,(25,465,587,22,445,3389)))
print(json.dumps({'blocked':all(r)}))`;
      const result = await execute(c, script);
      if (result.status || !(JSON.parse(result.stdout) as { blocked: boolean }).blocked)
        throw new Error("Abuse ports are reachable");
      const after = await ipt(["-n", "-v", "-x", "-L", `RPX_E_${plan.bridge.slice(3)}`]);
      const packets = (text: string) =>
        text
          .split("\n")
          .filter((line) => line.includes(`raypx-sandbox-ports:${plan.bridge}`))
          .reduce((n, line) => n + Number(line.trim().split(/\s+/)[0]), 0);
      if (packets(after) - packets(before) < 6)
        throw new Error("Abuse probes did not reach the owned port DROP policy");
    });
    await runtime.step("network-connections", async () => {
      const result = await execute(
        c,
        `import json,socket,sys
opened=[];blocked=0
for i in range(12):
 try:
  s=socket.create_connection((sys.argv[1],80),.4);s.sendall(b'GET /hold HTTP/1.0\\r\\nHost: fixture\\r\\n\\r\\n');opened.append(s)
 except TimeoutError:blocked+=1
print(json.dumps({'opened':len(opened),'blocked':blocked}))
for s in opened:s.close()
`,
      );
      const value = JSON.parse(result.stdout) as { opened: number; blocked: number };
      if (result.status || value.opened < 1 || value.opened > 8 || value.blocked < 1)
        throw new Error("Host connection limit was not enforced");
      runtime.report(`network-connections: ${JSON.stringify(value)}`);
    });
    await runtime.step("network-flood-pretrack", async () => {
      const chains = (await ipt(["-t", "raw", "-S"]))
        .split("\n")
        .map((line) => line.split(" "))
        .filter(
          ([option, chain]) =>
            option === "-N" && chain?.startsWith(`RPX_R_${plan.bridge.slice(3)}_`),
        )
        .map(([, chain]) => chain!);
      if (!chains.length) throw new Error("Pre-conntrack policy is missing");
      async function dropped() {
        let total = 0;
        for (const chain of chains) {
          const counters = await ipt(["-t", "raw", "-n", "-v", "-x", "-L", chain]);
          for (const line of counters.split("\n"))
            if (line.includes(`raypx-network:${plan.bridge}:datagrams`))
              total += Number(line.trim().split(/\s+/)[0]);
        }
        return total;
      }
      const before = await dropped();
      const result = await execute(
        c,
        `import socket,sys
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
for i in range(512):s.sendto(b'x',(sys.argv[1],5353))
s.close()
`,
      );
      const denied = (await dropped()) - before;
      if (result.status || denied < 1)
        throw new Error("Datagram flood did not reach the pre-conntrack DROP policy");
      runtime.report(`network-flood-pretrack: ${denied} datagrams dropped before conntrack`);
    });
  } finally {
    for (const id of computers)
      await runtime
        .request(url, token, `computers/${id}/destroy`, { generation: 1 })
        .catch(() => {});
    for (const rule of rules.slice(0, hooked)) await ipt(["-D", "DOCKER-USER", ...rule]);
    if (fixtureStarted) await docker(["container", "rm", "--force", "--volumes", name]);
    if (fixtureCreated) await docker(["network", "rm", network]);
  }
}
