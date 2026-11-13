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

export const sandboxEgressProbe = `
import json, socket, sys
def connection(address, port):
    try:
        with socket.create_connection((address, port), timeout=4):
            return 'connected'
    except TimeoutError:
        return 'dropped'
    except OSError:
        return 'inconclusive'
result = {'public': connection('1.1.1.1', 443),
          'gateway': connection(sys.argv[1], 80),
          'metadata': connection('169.254.169.254', 80)}
print(json.dumps(result))
assert result == {'public': 'connected', 'gateway': 'dropped', 'metadata': 'dropped'}
`;
