import type { SandboxPlan } from "./sandbox-plan.js";

export interface SandboxContainer {
  Id: string;
  Config: { User: string; Labels: Record<string, string> };
  HostConfig: {
    Memory: number;
    MemorySwap: number;
    PidsLimit: number;
    ReadonlyRootfs: boolean;
    Privileged: boolean;
    NetworkMode: string;
    CapDrop: string[];
    SecurityOpt: string[];
    Binds: string[] | null;
    Dns: string[];
  };
  Mounts: { Type: string; Destination: string; Name?: string }[];
  NetworkSettings: { Networks: Record<string, { Gateway: string }> };
}

export function assertSandboxContainer(value: SandboxContainer, plan: SandboxPlan) {
  const host = value.HostConfig;
  if (
    value.Config.Labels["raypx.supervisor"] !== plan.network ||
    value.Config.User !== "1000:1000" ||
    host.Memory !== plan.memory ||
    host.MemorySwap !== plan.memory ||
    host.PidsLimit !== plan.pids ||
    !host.ReadonlyRootfs ||
    host.Privileged ||
    host.NetworkMode !== plan.network ||
    !host.CapDrop.includes("ALL") ||
    !host.SecurityOpt.includes("no-new-privileges:true") ||
    (host.Binds?.length ?? 0) > 0 ||
    value.Mounts.some((mount) => mount.Type === "bind") ||
    Object.keys(value.NetworkSettings.Networks).join() !== plan.network
  )
    throw new Error("Sandbox Engine isolation assertions failed");
}

// Executed as the computer's configured user; neither credentials nor host files enter it.
export const sandboxIsolationProbe = `
import errno, json, os
assert os.getuid() == 1000
for path in ('/var/run/docker.sock', '/run/docker.sock'):
    assert not os.path.exists(path)
assert os.statvfs('/').f_flag & os.ST_RDONLY
try:
    open('/raypx-isolation-probe', 'w').close()
except OSError as error:
    assert error.errno == errno.EROFS
else:
    raise AssertionError('root is writable')
status = dict(line.split(':', 1) for line in open('/proc/self/status') if ':' in line)
assert int(status['CapEff'].strip(), 16) == 0
assert status['NoNewPrivs'].strip() == '1'
def ceiling(v2, v1):
    path = '/sys/fs/cgroup/' + v2
    if not os.path.exists(path):
        path = '/sys/fs/cgroup/' + v1
    return int(open(path).read().strip())
print(json.dumps({'uid': os.getuid(), 'capEff': 0, 'noNewPrivileges': True,
    'memory': ceiling('memory.max', 'memory/memory.limit_in_bytes'),
    'pids': ceiling('pids.max', 'pids/pids.max')}))
`;

// Both probes use the same bounded requests. Host-network controls distinguish an
// offline Engine from a policy that accidentally blocks public HTTPS or allowed DNS.
const sandboxNetworkProbe = `
import concurrent.futures, errno, http.client, json, socket, ssl, struct, sys
TIMEOUT = 3
def network(operation):
    try:
        return operation()
    except (TimeoutError, socket.timeout):
        return 'timeout'
    except ssl.SSLError:
        return 'tls-error'
    except OSError as error:
        return {errno.ENETUNREACH: 'network-unreachable', errno.EHOSTUNREACH: 'host-unreachable',
                errno.ENETDOWN: 'network-down', errno.ECONNREFUSED: 'connection-refused',
                errno.EACCES: 'permission-denied', errno.EPERM: 'permission-denied'}.get(error.errno, 'unexpected-error')
    except Exception:
        return 'unexpected-error'
def connection(address, port):
    def operation():
        with socket.create_connection((address, port), timeout=TIMEOUT):
            return 'connected'
    return network(operation)
def https():
    def operation():
        client = http.client.HTTPSConnection('1.1.1.1', timeout=TIMEOUT, context=ssl.create_default_context())
        try:
            client.request('GET', '/', headers={'Connection': 'close'})
            response = client.getresponse()
            return 'connected' if 200 <= response.status < 400 else 'http-error'
        finally:
            client.close()
    return network(operation)
def dns(address, tcp):
    def operation():
        transaction = 0x5250
        query = struct.pack('!HHHHHH', transaction, 0x0100, 1, 0, 0, 0) + b'\\x07example\\x03com\\x00' + struct.pack('!HH', 1, 1)
        kind = socket.SOCK_STREAM if tcp else socket.SOCK_DGRAM
        with socket.socket(socket.AF_INET, kind) as client:
            client.settimeout(TIMEOUT)
            client.connect((address, 53))
            if tcp:
                client.sendall(struct.pack('!H', len(query)) + query)
                def receive(size):
                    value = b''
                    while len(value) < size:
                        part = client.recv(size - len(value))
                        if not part:
                            raise ValueError('short DNS response')
                        value += part
                    return value
                response = receive(struct.unpack('!H', receive(2))[0])
            else:
                client.send(query)
                response = client.recv(4096)
            if len(response) < 12:
                return 'invalid-response'
            identifier, flags, questions, answers, _, _ = struct.unpack('!HHHHHH', response[:12])
            if (identifier != transaction or not flags & 0x8000 or flags & 0x7a00 or
                    questions != 1 or response[12:len(query)] != query[12:]):
                return 'invalid-response'
            if (flags & 0xf) == 2:
                return 'dns-server-failure'
            if flags & 0xf or answers < 1:
                return 'invalid-response'
            return 'connected'
    return network(operation)
def parallel(operations):
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        pending = {key: executor.submit(operation) for key, operation in operations.items()}
        return {key: future.result() for key, future in pending.items()}
`;

// An owned Engine-host canary works even when the supervisor runs outside its VM.
export const sandboxEgressControl = `${sandboxNetworkProbe}
resolver = sys.argv[1]
listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
listener.bind(('0.0.0.0', 0))
listener.listen(16)
port = listener.getsockname()[1]
checks = parallel({'publicHttps': https,
    'resolverUdp': lambda: dns(resolver, False), 'resolverTcp': lambda: dns(resolver, True),
    'publicIpv6': lambda: connection('2606:4700:4700::1111', 443),
    'hostLoopback': lambda: connection('127.0.0.1', port)})
print(json.dumps({'port': port, 'checks': checks}), flush=True)
while True:
    client, _ = listener.accept()
    client.close()
`;

export const sandboxEgressProbe = `${sandboxNetworkProbe}
gateway, resolver, host_port = sys.argv[1], sys.argv[2], int(sys.argv[3])
nameservers = [line.split()[1] for line in open('/etc/resolv.conf') if line.startswith('nameserver ')]
operations = {'publicHttps': https, 'resolverUdp': lambda: dns(resolver, False),
    'resolverTcp': lambda: dns(resolver, True),
    'embeddedUdp': lambda: dns('127.0.0.11', False), 'embeddedTcp': lambda: dns('127.0.0.11', True),
    'hostLoopback': lambda: connection('127.0.0.1', host_port),
    'publicIpv6': lambda: connection('2606:4700:4700::1111', 443),
    'gateway': lambda: connection(gateway, 80),
    'hostService': lambda: connection(gateway, host_port),
    'metadata': lambda: connection('169.254.169.254', 80),
    'private10': lambda: connection('10.0.0.1', 80),
    'private172': lambda: connection('172.16.0.1', 80),
    'private192': lambda: connection('192.168.0.1', 80)}
alternatives = [address for address in ('1.1.1.1', '8.8.8.8', '9.9.9.9') if address != resolver]
for index, address in enumerate(alternatives):
    operations['otherDnsUdp' + str(index)] = lambda address=address: dns(address, False)
    operations['otherDnsTcp' + str(index)] = lambda address=address: dns(address, True)
print(json.dumps({'nameservers': nameservers, 'checks': parallel(operations)}))
`;

export interface SandboxEgressResult {
  nameservers: string[];
  checks: Record<string, string>;
}

export const sandboxEgressRanges = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
];

/** Only packet counters from the owned DROP rules count as private-network evidence. */
export function sandboxEgressCounters(output: string, bridge: string): Record<string, number> {
  const counters: Record<string, number> = {};
  for (const line of output.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (!/^\d+$/.test(fields[0] ?? "") || fields[2] !== "DROP") continue;
    const destination = fields[8];
    if (destination && sandboxEgressRanges.includes(destination))
      counters[destination] = (counters[destination] ?? 0) + Number(fields[0]);
    if (
      destination === "0.0.0.0/0" &&
      fields[5] === bridge &&
      line.includes(`raypx-sandbox-egress:${bridge}`)
    )
      counters["host:input"] = (counters["host:input"] ?? 0) + Number(fields[0]);
    if (
      destination === "::/0" &&
      fields[5] === bridge &&
      line.includes(`raypx-sandbox-egress:${bridge}`)
    )
      counters["ipv6:forward"] = (counters["ipv6:forward"] ?? 0) + Number(fields[0]);
    const protocol = { "6": "tcp", "17": "udp", tcp: "tcp", udp: "udp" }[fields[3] ?? ""];
    if (line.includes("raypx-sandbox-dns:") && line.includes("dpt:53") && protocol) {
      const key = `dns:${protocol}`;
      counters[key] = (counters[key] ?? 0) + Number(fields[0]);
    }
  }
  return counters;
}

/** Network failure is never accepted for TLS, HTTP, malformed DNS or probe failures. */
export function assertSandboxEgress(
  result: SandboxEgressResult,
  control: Record<string, string>,
  before: Record<string, number>,
  after: Record<string, number>,
) {
  const networkFailures = new Set([
    "timeout",
    "network-unreachable",
    "host-unreachable",
    "network-down",
    "connection-refused",
  ]);
  if (control.hostLoopback !== "connected") throw new Error("Sandbox host-loopback control failed");
  if (result.nameservers?.length !== 1 || result.nameservers[0] !== "127.0.0.11")
    throw new Error("Sandbox must use the configured Engine embedded DNS resolver");
  const checks = result.checks;
  if (!["connection-refused", "timeout"].includes(checks.hostLoopback ?? ""))
    throw new Error("Sandbox host loopback is reachable or isolation probe failed");
  for (const name of [
    "gateway",
    "hostService",
    "metadata",
    "private10",
    "private172",
    "private192",
    "otherDnsUdp0",
    "otherDnsTcp0",
    "otherDnsUdp1",
    "otherDnsTcp1",
  ]) {
    if (checks[name] !== "timeout")
      throw new Error(`Sandbox forbidden destination probe failed: ${name}`);
  }
  for (const range of sandboxEgressRanges) {
    if ((after[range] ?? 0) <= (before[range] ?? 0))
      throw new Error(`Sandbox private destination did not reach its DROP rule: ${range}`);
  }
  for (const protocol of ["udp", "tcp"]) {
    const key = `dns:${protocol}`;
    if ((after[key] ?? 0) - (before[key] ?? 0) < 2)
      throw new Error(`Sandbox alternate DNS probes did not reach the ${protocol} DROP rule`);
  }
  if ((after["host:input"] ?? 0) - (before["host:input"] ?? 0) < 2)
    throw new Error(
      "Sandbox gateway and host-service probes did not reach the host INPUT DROP rule",
    );
  function availability(name: string, hostName = name) {
    const status = checks[name];
    if (status === "connected") return "passed";
    if (networkFailures.has(status ?? "") && networkFailures.has(control[hostName] ?? ""))
      return `unavailable (computer: ${status}; Engine host: ${control[hostName]})`;
    if (
      name.startsWith("embedded") &&
      status === "dns-server-failure" &&
      networkFailures.has(control[hostName] ?? "")
    )
      return `unavailable (computer: ${status}; Engine host: ${control[hostName]})`;
    throw new Error(`Sandbox allowed network probe failed: ${name}`);
  }
  const publicHttps = availability("publicHttps");
  let ipv6: string;
  if (control.publicIpv6 === "connected") {
    if (
      checks.publicIpv6 !== "timeout" ||
      (after["ipv6:forward"] ?? 0) <= (before["ipv6:forward"] ?? 0)
    )
      throw new Error("Sandbox IPv6 probe did not reach its DROP rule");
    ipv6 = "passed";
  } else {
    if (
      !networkFailures.has(control.publicIpv6 ?? "") ||
      !networkFailures.has(checks.publicIpv6 ?? "")
    )
      throw new Error("Sandbox IPv6 control or isolation probe failed");
    ipv6 = `unavailable (computer: ${checks.publicIpv6}; Engine host: ${control.publicIpv6})`;
  }
  const dns = [
    availability("resolverUdp"),
    availability("resolverTcp"),
    availability("embeddedUdp", "resolverUdp"),
    availability("embeddedTcp", "resolverTcp"),
  ];
  if (publicHttps === "passed" && dns.some((status) => status !== "passed"))
    throw new Error("Sandbox DNS unavailable while public HTTPS is reachable");
  return `private/host/DNS restrictions passed; public HTTPS ${publicHttps}; configured DNS ${dns.every((status) => status === "passed") ? "passed" : "unavailable (Engine host and computer network probes failed)"}; IPv6 enforcement ${ipv6}`;
}
