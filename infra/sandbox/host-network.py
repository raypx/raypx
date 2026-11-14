#!/usr/bin/env python3
"""Trusted Engine-host network policy. No tenant namespaces, content or credentials.

Production uses a local Unix socket with peer-UID admission. The explicit request
CLI is for an operator/real-Engine fixture on a remote Engine host. Packet limits
live in the host kernel; this process only reserves durable allowances/refills.
"""
import datetime
import base64
import fcntl
import hashlib
import ipaddress
import json
import os
import pwd
import re
import shlex
import socket
import socketserver
import struct
import subprocess
import sys
import tempfile
import traceback


class Refusal(Exception):
    pass


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()[:10]


def run(*args, optional=False):
    result = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, timeout=3, env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"})
    if result.returncode and not optional:
        raise Refusal("CAPACITY_UNAVAILABLE")
    if len(result.stdout) > 1024 * 1024:
        raise Refusal("CAPACITY_UNAVAILABLE")
    return result


def ipt(*args, optional=False):
    return run("iptables", "-w", "1", *args, optional=optional)


def ensure(chain, *rule, position=None):
    if ipt("-C", chain, *rule, optional=True).returncode:
        if position:
            ipt("-I", chain, str(position), *rule)
        else:
            ipt("-A", chain, *rule)


def remove(chain, *rule):
    while not ipt("-C", chain, *rule, optional=True).returncode:
        ipt("-D", chain, *rule)


def atomic(path, value):
    fd, temporary = tempfile.mkstemp(prefix=".pending-", dir=os.path.dirname(path))
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        parent = os.open(os.path.dirname(path), os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def validate(value):
    if not isinstance(value, dict) or value.get("operation") not in ("register", "sample", "remove", "reconcile", "clear"):
        raise Refusal("INVALID_INPUT")
    namespace = value.get("namespace", "")
    if not isinstance(namespace, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,62}", namespace):
        raise Refusal("INVALID_INPUT")
    bridge = "rpx" + digest(namespace)
    if value.get("bridge") != bridge:
        raise Refusal("INVALID_INPUT")
    if value["operation"] in ("register", "sample", "remove"):
        if not re.fullmatch(r"[a-f0-9-]{36}", value.get("key", "")):
            raise Refusal("INVALID_INPUT")
    if value["operation"] == "register":
        ipaddress.IPv4Address(value["ip"])
        if not isinstance(value.get("spaceId"), str) or not 1 <= len(value["spaceId"]) <= 128:
            raise Refusal("INVALID_INPUT")
        for key in ("rate", "burst", "transfer", "spaceDaily", "chunk", "connections"):
            if type(value.get(key)) is not int or not 1 <= value[key] <= 2**53-1:
                raise Refusal("INVALID_INPUT")
        if value["connections"] > 10000 or value["rate"] < 1024 or value["burst"] < value["rate"]:
            raise Refusal("INVALID_INPUT")
    return bridge


class Policy:
    def __init__(self, state_directory, value):
        self.bridge = validate(value)
        self.suffix = self.bridge[3:]
        self.root = "RPX_N_" + self.suffix
        self.tag = "raypx-network:" + self.bridge
        self.path = os.path.join(state_directory, self.suffix + ".json")
        self.value = value
        self.today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
        self.fresh = False
        try:
            with open(self.path) as stream:
                self.state = json.load(stream)
            if self.state.get("version") != 1 or self.state.get("bridge") != self.bridge:
                raise Refusal("CAPACITY_UNAVAILABLE")
        except FileNotFoundError:
            self.fresh = True
            self.state = {"version": 1, "bridge": self.bridge, "spaces": {}, "computers": {}}
        if self.state.get("latestDay", self.today) > self.today:
            raise Refusal("CAPACITY_UNAVAILABLE")
        self.state["latestDay"] = self.today

    def save(self):
        atomic(self.path, self.state)

    def chain(self, key):
        return "RPX_C_" + self.suffix + "_" + digest(key)[:8]

    def raw_chain(self, key):
        return "RPX_R_" + self.suffix + "_" + digest(key)[:8]

    def raw(self, *args, optional=False):
        return ipt("-t", "raw", *args, optional=optional)

    def raw_policy(self, key, record):
        chain = self.raw_chain(key)
        if not self.raw("-S", chain, optional=True).returncode:
            raise Refusal("CAPACITY_UNAVAILABLE")
        self.raw("-N", chain)
        self.raw("-A", chain, "-m", "comment", "--comment", self.tag + ":raw", "-j", "RETURN")
        # Before conntrack allocation: bound even locally rejected floods. The
        # filter chain still supplies the combined-direction byte/start/day cap.
        rules = [
            ["-m", "hashlimit", "--hashlimit-above", str(record["rate"]) + "b/s", "--hashlimit-burst", str(record["burst"]) + "b", "--hashlimit-name", "rpxr" + digest(key), "-j", "DROP"],
            ["-p", "tcp", "--syn", "-m", "hashlimit", "--hashlimit-above", "16/second", "--hashlimit-burst", "32", "--hashlimit-name", "rpxs" + digest(key), "-m", "comment", "--comment", self.tag + ":syn", "-j", "DROP"],
            ["-p", "udp", "-m", "hashlimit", "--hashlimit-above", "64/second", "--hashlimit-burst", "64", "--hashlimit-name", "rpxu" + digest(key), "-m", "comment", "--comment", self.tag + ":datagrams", "-j", "DROP"],
            ["-p", "tcp", "-j", "RETURN"], ["-p", "udp", "-j", "RETURN"], ["-j", "DROP"],
        ]
        for index, rule in enumerate(rules, 1):
            self.raw("-I", chain, str(index), *rule)
        self.raw("-I", "PREROUTING", "1", "-i", self.bridge, "-s", record["ip"], "-m", "comment", "--comment", self.tag + ":" + key, "-j", chain)
        v6 = ["-i", self.bridge, "-m", "comment", "--comment", self.tag + ":ipv6", "-j", "DROP"]
        if run("ip6tables", "-w", "1", "-t", "raw", "-C", "PREROUTING", *v6, optional=True).returncode:
            run("ip6tables", "-w", "1", "-t", "raw", "-I", "PREROUTING", "1", *v6)

    def bootstrap(self):
        if not os.path.isdir("/sys/class/net/" + self.bridge + "/bridge"):
            raise Refusal("CAPACITY_UNAVAILABLE")
        # The fixed bridge privacy/port policy must already exist. Never assert it
        # from an environment flag or replace/reorder another service's rules.
        privacy = "RPX_E_" + self.suffix
        ipt("-C", privacy, "-d", "0.0.0.0/8", "-m", "comment", "--comment", "raypx-sandbox-egress:" + self.bridge, "-j", "DROP")
        rules = ipt("-S", privacy).stdout.decode()
        if "raypx-sandbox-ports:" + self.bridge not in rules:
            raise Refusal("CAPACITY_UNAVAILABLE")
        if ipt("-S", self.root, optional=True).returncode:
            ipt("-N", self.root)
            ipt("-A", self.root, "-m", "comment", "--comment", self.tag, "-j", "DROP")
        else:
            if self.fresh:
                raise Refusal("CAPACITY_UNAVAILABLE")
            ipt("-C", self.root, "-m", "comment", "--comment", self.tag, "-j", "DROP")
        for direction in ("-i", "-o"):
            # The pre-existing outgoing privacy hook stays first. Both directions
            # reach the same per-computer byte bucket and quota before Docker ACCEPT.
            ensure("DOCKER-USER", direction, self.bridge, "-m", "comment", "--comment", self.tag, "-j", self.root, position=2)

    def quota(self, chain):
        rules = ipt("-S", chain).stdout.decode().splitlines()
        for index, line in enumerate((line for line in rules if line.startswith("-A ")), 1):
            parts = shlex.split(line)
            if "--quota" in parts:
                # The nft compatibility frontend prints the configured quota,
                # not its remaining kernel allowance. Rule byte counters are
                # observable and include only packets admitted by that quota.
                record = self.state["computers"][self.value["key"]]
                counters = ipt("-n", "-v", "-x", "-L", chain, "--line-numbers").stdout.decode()
                for counter in counters.splitlines():
                    fields = counter.split()
                    if fields and fields[0] == str(index):
                        used = int(fields[2])
                        if used < record.get("counter", 0) or used > record["allowance"]:
                            raise Refusal("CAPACITY_UNAVAILABLE")
                        record["counter"] = used
                        return index, record["allowance"] - used
                raise Refusal("CAPACITY_UNAVAILABLE")
        raise Refusal("CAPACITY_UNAVAILABLE")

    def freeze(self, chain):
        ensure(chain, "-m", "comment", "--comment", self.tag + ":freeze", "-j", "DROP", position=1)

    def thaw(self, chain):
        remove(chain, "-m", "comment", "--comment", self.tag + ":freeze", "-j", "DROP")

    def quota_rule(self, allowance, day):
        return ["-m", "time", "--datestart", day + "T00:00:00", "--datestop", day + "T23:59:59",
                "-m", "quota", "--quota", str(allowance), "-m", "comment", "--comment", self.tag + ":quota", "-j", "RETURN"]

    def grant(self, record, remaining):
        space = record["space"]
        ledger = self.state["spaces"].setdefault(space, {"day": self.today, "reserved": 0})
        if ledger["day"] != self.today:
            ledger.update(day=self.today, reserved=0)
        available = record["transfer"] - record["granted"]
        if available <= 0:
            return "COMPUTER_TRANSFER_LIMIT"
        amount = min(record["chunk"], available, record["spaceDaily"] - ledger["reserved"])
        if amount <= 0:
            return "SPACE_DAILY_TRANSFER_LIMIT"
        # Reserve and fsync before allowing a single packet. Unknown allowances
        # after a crash remain charged; no recovery can recreate spent capacity.
        ledger["reserved"] += amount
        record["granted"] += amount
        record["allowance"] = remaining + amount
        record["day"] = self.today
        self.save()
        return None

    def register(self):
        value = self.value
        key = value["key"]
        if key in self.state["computers"]:
            raise Refusal("CAPACITY_UNAVAILABLE")
        self.bootstrap()
        chain = self.chain(key)
        if not ipt("-S", chain, optional=True).returncode:
            raise Refusal("CAPACITY_UNAVAILABLE")
        ipt("-N", chain)
        self.freeze(chain)
        record = {k: value[k] for k in ("ip", "rate", "burst", "transfer", "spaceDaily", "chunk", "connections")}
        record.update(space=hashlib.sha256(value["spaceId"].encode()).hexdigest(), granted=0, used=0, allowance=0, day=self.today)
        self.state["computers"][key] = record
        reason = self.grant(record, 0)
        if reason:
            self.state["computers"].pop(key)
            self.save()
            ipt("-F", chain)
            ipt("-X", chain)
            raise Refusal(reason)
        try:
            self.raw_policy(key, record)
            for protocol in ("tcp", "udp"):
                ipt("-A", chain, "-s", record["ip"], "-p", protocol, "-m", "conntrack", "--ctstate", "NEW",
                    "-m", "connlimit", "--connlimit-above", str(record["connections"]), "--connlimit-mask", "32",
                    "--connlimit-saddr", "-m", "comment", "--comment", self.tag + ":connections", "-j", "DROP")
            ipt("-A", chain, "-m", "hashlimit", "--hashlimit-above", str(record["rate"]) + "b/s",
                "--hashlimit-burst", str(record["burst"]) + "b", "--hashlimit-name", "rpx" + digest(key),
                "--hashlimit-htable-expire", "3600000", "-m", "comment", "--comment", self.tag + ":rate", "-j", "DROP")
            ipt("-A", chain, *self.quota_rule(record["allowance"], record["day"]))
            ipt("-A", chain, "-m", "comment", "--comment", self.tag + ":exhausted", "-j", "DROP")
            for direction in ("-s", "-d"):
                ensure(self.root, direction, record["ip"], "-m", "comment", "--comment", self.tag + ":" + key, "-g", chain, position=1)
            self.thaw(chain)
            return self.sample()
        except Exception:
            # Leave a failed registration frozen; supervisor containment and
            # reconciliation remove it. The reservation is deliberately retained.
            raise

    def sample(self):
        key = self.value["key"]
        record = self.state["computers"].get(key)
        if not record:
            raise Refusal("CAPACITY_UNAVAILABLE")
        chain = self.chain(key)
        self.raw("-C", "PREROUTING", "-i", self.bridge, "-s", record["ip"], "-m", "comment", "--comment", self.tag + ":" + key, "-j", self.raw_chain(key))
        _, remaining = self.quota(chain)
        if remaining < 0 or remaining > record["allowance"]:
            raise Refusal("CAPACITY_UNAVAILABLE")
        transferred = record["used"] + record["allowance"] - remaining
        drops = self.drops(chain)
        reason = None
        for direction in ("-i", "-o"):
            ipt("-C", "DOCKER-USER", direction, self.bridge, "-m", "comment", "--comment", self.tag, "-j", self.root)
        if record["day"] != self.today or remaining < record["chunk"] // 2:
            self.freeze(chain)
            index, remaining = self.quota(chain)
            transferred = record["used"] + record["allowance"] - remaining
            record["used"] = transferred
            if record["day"] != self.today:
                # Old-day packets are denied in the kernel at midnight. Discard
                # unused old-day allowance instead of spending it in the new day.
                remaining = 0
            record["allowance"] = remaining
            reason = self.grant(record, remaining)
            if reason and remaining > 0 and drops["exhausted"] <= record.get("dropCounter", 0):
                # Reservations may be fully allocated while already admitted
                # bytes remain. Let those bytes finish; never invent new credit.
                reason = None
            if not reason:
                ipt("-R", chain, str(index), *self.quota_rule(record["allowance"], record["day"]))
                record["counter"] = 0
                record["dropCounter"] = drops["exhausted"]
                self.thaw(chain)
        self.save()
        return {"bytes": transferred, "reservedBytes": record["granted"], "spaceReservedBytes": self.state["spaces"][record["space"]]["reserved"], "reason": reason, "drops": drops}

    def drops(self, chain):
        drops = {"rate": 0, "connections": 0, "exhausted": 0}
        for line in ipt("-n", "-v", "-x", "-L", chain).stdout.decode().splitlines():
            for kind in drops:
                if self.tag + ":" + kind in line:
                    drops[kind] += int(line.split()[0])
        return drops

    def remove(self, key):
        record = self.state["computers"].get(key)
        if not record:
            return
        chain = self.chain(key)
        raw_chain = self.raw_chain(key)
        hook = ["-i", self.bridge, "-s", record["ip"], "-m", "comment", "--comment", self.tag + ":" + key, "-j", raw_chain]
        while not self.raw("-C", "PREROUTING", *hook, optional=True).returncode:
            self.raw("-D", "PREROUTING", *hook)
        if not self.raw("-S", raw_chain, optional=True).returncode:
            self.raw("-C", raw_chain, "-m", "comment", "--comment", self.tag + ":raw", "-j", "RETURN")
            self.raw("-F", raw_chain)
            self.raw("-X", raw_chain)
        # Exact ledger key/IP hooks only. Never flush a foreign chain or namespace.
        for direction in ("-s", "-d"):
            remove(self.root, direction, record["ip"], "-m", "comment", "--comment", self.tag + ":" + key, "-g", chain)
        if not ipt("-S", chain, optional=True).returncode:
            ipt("-F", chain)
            ipt("-X", chain)
        self.state["computers"].pop(key)
        self.save()

    def prune_orphans(self):
        retained = {self.chain(key) for key in self.state["computers"]}
        for line in ipt("-S").stdout.decode().splitlines():
            fields = line.split()
            if len(fields) != 2 or fields[0] != "-N":
                continue
            chain = fields[1]
            if not chain.startswith("RPX_C_" + self.suffix + "_") or chain in retained:
                continue
            owned = any(not ipt("-C", chain, "-m", "comment", "--comment", self.tag + ":" + marker, "-j", "DROP", optional=True).returncode
                        for marker in ("freeze", "exhausted"))
            if not owned:
                raise Refusal("CAPACITY_UNAVAILABLE")
            ipt("-F", chain)
            ipt("-X", chain)
        retained_raw = {self.raw_chain(key) for key in self.state["computers"]}
        raw_rules = self.raw("-S").stdout.decode().splitlines()
        for line in raw_rules:
            fields = line.split()
            if len(fields) != 2 or fields[0] != "-N":
                continue
            chain = fields[1]
            if not chain.startswith("RPX_R_" + self.suffix + "_") or chain in retained_raw:
                continue
            self.raw("-C", chain, "-m", "comment", "--comment", self.tag + ":raw", "-j", "RETURN")
            # A referenced chain cannot be deleted: an unexplained live hook is
            # an operator fault, never permission to remove arbitrary host rules.
            for rule in raw_rules:
                parts = shlex.split(rule)
                if any(option in parts and parts[parts.index(option) + 1] == chain for option in ("-j", "-g")):
                    raise Refusal("CAPACITY_UNAVAILABLE")
            self.raw("-F", chain)
            self.raw("-X", chain)

    def execute(self):
        operation = self.value["operation"]
        if operation == "register":
            return self.register()
        if operation == "sample":
            return self.sample()
        if operation == "remove":
            self.remove(self.value["key"])
        if operation in ("reconcile", "clear"):
            keep = self.value.get("keys", []) if operation == "reconcile" else []
            if not isinstance(keep, list) or len(keep) > 10000 or any(not isinstance(k, str) for k in keep):
                raise Refusal("INVALID_INPUT")
            for key in list(self.state["computers"]):
                if key not in keep:
                    self.remove(key)
            self.prune_orphans()
            if operation == "clear":
                v6 = ["-i", self.bridge, "-m", "comment", "--comment", self.tag + ":ipv6", "-j", "DROP"]
                while not run("ip6tables", "-w", "1", "-t", "raw", "-C", "PREROUTING", *v6, optional=True).returncode:
                    run("ip6tables", "-w", "1", "-t", "raw", "-D", "PREROUTING", *v6)
                for direction in ("-i", "-o"):
                    remove("DOCKER-USER", direction, self.bridge, "-m", "comment", "--comment", self.tag, "-j", self.root)
                if not ipt("-S", self.root, optional=True).returncode:
                    ipt("-C", self.root, "-m", "comment", "--comment", self.tag, "-j", "DROP")
                    ipt("-F", self.root)
                    ipt("-X", self.root)
                if os.path.exists(self.path):
                    os.unlink(self.path)
        return {}


def request(state_directory, value):
    bridge = validate(value)
    os.makedirs(state_directory, mode=0o700, exist_ok=True)
    fd = os.open(os.path.join(state_directory, bridge + ".lock"), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        return Policy(state_directory, value).execute()
    finally:
        os.close(fd)
        if value["operation"] == "clear":
            os.unlink(os.path.join(state_directory, bridge + ".lock"))
            try:
                os.rmdir(state_directory)
            except OSError:
                pass


def main():
    mode, state_directory = sys.argv[1:3]
    if mode == "request":
        raw = base64.b64decode(sys.argv[3], validate=True) if len(sys.argv) > 3 else sys.stdin.buffer.read(16385)
        if len(raw) > 16384:
            raise Refusal("INVALID_INPUT")
        value = json.loads(raw)
        try:
            print(json.dumps(request(state_directory, value)))
        except Refusal as error:
            print(json.dumps({"error": str(error), "line": traceback.extract_tb(error.__traceback__)[-1].lineno}))
            sys.exit(1)
        return
    if mode != "serve":
        raise Refusal("INVALID_INPUT")
    path, user = sys.argv[3:5]
    admitted = pwd.getpwnam(user)
    os.makedirs(os.path.dirname(path), mode=0o750, exist_ok=True)
    os.chown(os.path.dirname(path), 0, admitted.pw_gid)

    class Handler(socketserver.StreamRequestHandler):
        def handle(self):
            _, uid, _ = struct.unpack("3i", self.request.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            if uid != admitted.pw_uid:
                return
            self.request.settimeout(10)
            try:
                raw = self.rfile.readline(16385)
                if len(raw) > 16384:
                    raise Refusal("INVALID_INPUT")
                value = json.loads(raw)
                if value.get("operation") == "clear":
                    raise Refusal("INVALID_INPUT")
                result = request(state_directory, value)
            except Refusal as error:
                result = {"error": str(error)}
            except Exception:
                result = {"error": "CAPACITY_UNAVAILABLE"}
            self.wfile.write(json.dumps(result).encode() + b"\n")

    # systemd RuntimeDirectory owns this path; a live listener is never unlinked.
    with socketserver.UnixStreamServer(path, Handler) as server:
        os.chown(path, 0, admitted.pw_gid)
        os.chmod(path, 0o660)
        server.serve_forever()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never print subprocess errors, packet data, addresses or arbitrary input.
        print(json.dumps({"error":"CAPACITY_UNAVAILABLE", "line":traceback.extract_tb(error.__traceback__)[-1].lineno}))
        sys.exit(1)
