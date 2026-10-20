import assert from "node:assert/strict";
import { chmod, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform === "win32") {
  throw new Error("TUI PTY smoke is unavailable on Windows: it requires POSIX pty and termios.");
}

const python = Bun.which("python3");
assert.ok(python, "TUI PTY smoke requires Python 3 with pty and termios support");

const directory = await mkdtemp(join(tmpdir(), "raypx-tui-smoke-"));
const binary = join(directory, "raypx");
const builtBinary = resolve(import.meta.dirname, "../../dist/raypx");

// The test driver alone uses Python. Keeping the PTY slave open lets it inspect
// the actual terminal attributes after the standalone executable has exited.
const driver = String.raw`
import errno
import fcntl
import json
import os
import pty
import re
import select
import signal
import struct
import subprocess
import sys
import termios
import time

binary, directory = sys.argv[1:]
environment = dict(os.environ, PATH="", LANG="en_US.UTF-8", LC_ALL="en_US.UTF-8", TERM="xterm-256color")
ansi = re.compile(rb"\x1b\[[0-?]*[ -/]*[@-~]")


def command(profile, *arguments):
    result = subprocess.run(
        [binary, "--data-dir", directory, "--profile", profile, *arguments, "--json"],
        cwd=directory, env=environment, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10,
    )
    if result.returncode != 0:
        raise AssertionError("Fixture command failed: " + result.stderr.decode("utf-8", "replace"))
    return json.loads(result.stdout)


class Session:
    def __init__(self, profile):
        self.master, self.slave = pty.openpty()
        fcntl.ioctl(self.slave, termios.TIOCSWINSZ, struct.pack("HHHH", 30, 100, 0, 0))
        self.original_attributes = termios.tcgetattr(self.slave)
        self.output = b""

        self.child = subprocess.Popen(
            [binary, "tui", "--data-dir", directory, "--profile", profile],
            cwd=directory, env=environment, stdin=self.slave, stdout=self.slave,
            stderr=subprocess.PIPE,
        )
        try:
            self.expect("Raypx")
            self.expect("Tasks")
            self.expect(profile)
            attributes = termios.tcgetattr(self.slave)
            assert not attributes[3] & termios.ICANON, "TUI did not enable raw keyboard input"
            assert not attributes[3] & termios.ECHO, "TUI keyboard input is still echoed"
        except BaseException:
            self.dispose()
            raise

    def read(self, timeout=0.05):
        readable, _, _ = select.select([self.master], [], [], timeout)
        if not readable:
            return
        try:
            chunk = os.read(self.master, 65536)
        except OSError as error:
            if error.errno == errno.EIO:
                return
            raise
        self.output += chunk
        assert len(self.output) < 1024 * 1024, "TUI produced unbounded screen output"

    def text(self, after=0):
        return ansi.sub(b"", self.output[after:]).decode("utf-8", "replace")

    def expect(self, text, timeout=10, after=0):
        deadline = time.monotonic() + timeout
        while text not in self.text(after):
            self.read()
            if self.child.poll() is not None:
                diagnostic = self.child.stderr.read().decode("utf-8", "replace")
                raise AssertionError("TUI exited before " + repr(text) + ": " + self.text() + diagnostic)
            if time.monotonic() > deadline:
                raise AssertionError("TUI did not display " + repr(text) + ": " + self.text())

    def send(self, keys):
        marker = len(self.output)
        os.write(self.master, keys.encode("utf-8"))
        return marker

    def finish(self, exit_code):
        deadline = time.monotonic() + 10
        while self.child.poll() is None:
            self.read()
            if time.monotonic() > deadline:
                raise AssertionError("TUI did not shut down: " + self.text())
        self.read(0)
        diagnostics = self.child.stderr.read().decode("utf-8", "replace")
        assert self.child.returncode == exit_code, (self.child.returncode, diagnostics, self.text())
        assert termios.tcgetattr(self.slave) == self.original_attributes, "TUI did not restore terminal attributes"
        return diagnostics

    def dispose(self):
        if self.child.poll() is None:
            self.child.terminate()
            try:
                self.child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.child.kill()
                self.child.wait(timeout=5)
        self.child.stderr.close()
        os.close(self.master)
        os.close(self.slave)


# Interaction scenarios are intentionally exercised through the compiled CLI,
# rather than invoking the TUI implementation or replacing its terminal streams.
session = Session("tui-empty")
try:
    session.send("q\r")
    session.finish(0)
finally:
    session.dispose()


# Desktop's stdio engine owns scheduling. A TUI in the same profile must still
# open successfully and must not attempt to acquire that scheduler lease.
engine = subprocess.Popen(
    [binary, "stdio", "--data-dir", directory, "--profile", "tui-with-desktop"],
    cwd=directory, env=environment, stdin=subprocess.PIPE,
    stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0,
)
try:
    engine.stdin.write(b'{"version":1,"id":"scheduler","method":"runtime.info","params":{}}\n')
    engine_output = b""
    deadline = time.monotonic() + 10
    response = None
    while response is None:
        readable, _, _ = select.select([engine.stdout], [], [], 0.05)
        if readable:
            chunk = os.read(engine.stdout.fileno(), 65536)
            assert chunk, "Desktop stdio engine exited before handshake"
            engine_output += chunk
            for line in engine_output.splitlines():
                try:
                    value = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if value.get("id") == "scheduler":
                    response = value
        assert time.monotonic() < deadline, "Desktop stdio handshake timed out"
    assert response["result"]["scheduler"] is True, response
    session = Session("tui-with-desktop")
    try:
        session.send("q\r")
        session.finish(0)
        assert engine.poll() is None, "TUI stopped the Desktop scheduling engine"
    finally:
        session.dispose()
    engine.stdin.close()
    engine.stdin = None
    _, diagnostics = engine.communicate(timeout=10)
    assert engine.returncode == 0, diagnostics.decode("utf-8", "replace")
finally:
    if engine.poll() is None:
        engine.kill()
        engine.wait(timeout=5)
    if engine.stdin:
        engine.stdin.close()
    engine.stdout.close()
    engine.stderr.close()


def create_job(profile, name, script, *arguments):
    return command(profile, "jobs", "create", json.dumps({
        "name": name,
        "cron": "0 * * * *",
        "timezone": "UTC",
        "enabled": False,
        "action": {
            "type": "command.run",
            "command": {
                "executable": "/bin/sh",
                "args": ["-c", script, "raypx-tui-smoke", *arguments],
                "cwd": directory,
                "timeoutMs": 60000,
            },
        },
    }))


def start_job(session, name):
    marker = session.send("t\r")
    session.expect(name, after=marker)
    marker = session.send("1\r")
    session.expect("Run once", after=marker)
    marker = session.send("r\r")
    session.expect("yes", after=marker)
    marker = session.send("yes\r")
    session.expect("Running", after=marker)
    return marker


profile = "tui-success"
job = create_job(profile, "tui-success-job", "printf 'tui-private-success\\n'")
session = Session(profile)
try:
    marker = start_job(session, job["name"])
    session.expect("Success", after=marker)
    session.expect("Press Enter", after=marker)
    marker = session.send("\r")
    session.expect("Run once", after=marker)
    marker = session.send("h\r")
    session.expect("Success", after=marker)
    marker = session.send("1\r")
    session.expect("tui-private-success", after=marker)
    session.send("q\r")
    session.finish(0)
finally:
    session.dispose()
history = command(profile, "jobs", "history", json.dumps({"id": job["id"]}))
assert len(history) == 1 and history[0]["status"] == "success", history


def process_exists(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def wait_for_pids(path):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        try:
            with open(path, encoding="utf-8") as fixture:
                contents = fixture.read()
            pids = [int(value) for value in contents.splitlines()]
            if contents.endswith("\n") and len(pids) == 2 and all(pid > 0 for pid in pids):
                return pids
        except (FileNotFoundError, ValueError):
            pass
        time.sleep(0.02)
    raise AssertionError("Managed task did not start its fixture descendants")


for name, key, received_signal, exit_code in [
    ("quit-active", "q\r", None, 0),
    ("ctrl-c-active", "\x03", None, 130),
    ("sigint-active", None, signal.SIGINT, 130),
    ("sigterm-active", None, signal.SIGTERM, 143),
]:
    profile = "tui-" + name
    pid_path = os.path.join(directory, profile + ".pids")
    job = create_job(
        profile, profile + "-job",
        'printf "%s\\n" "$$" > "$1"; /bin/sleep 60 & printf "%s\\n" "$!" >> "$1"; wait',
        pid_path,
    )
    session = Session(profile)
    pids = []
    try:
        start_job(session, job["name"])
        pids = wait_for_pids(pid_path)
        assert all(process_exists(pid) for pid in pids), "Fixture descendants exited before cancellation"
        if key:
            marker = session.send(key)
            if name == "quit-active":
                session.expect("yes", after=marker)
                session.send("yes\r")
        else:
            os.kill(session.child.pid, received_signal)
        session.finish(exit_code)
        deadline = time.monotonic() + 5
        while any(process_exists(pid) for pid in pids) and time.monotonic() < deadline:
            time.sleep(0.02)
        assert not any(process_exists(pid) for pid in pids), "TUI left a managed descendant alive"
        history = command(profile, "jobs", "history", json.dumps({"id": job["id"]}))
        assert len(history) == 1 and history[0]["status"] == "cancelled", history
    finally:
        session.dispose()
        if not pids and os.path.exists(pid_path):
            with open(pid_path, encoding="utf-8") as fixture:
                pids = [int(value) for value in fixture.read().splitlines() if value.isdecimal()]
        for pid in pids:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


for name, key, received_signal, exit_code in [
    ("ctrl-c", "\x03", None, 130),
    ("sigint", None, signal.SIGINT, 130),
    ("sigterm", None, signal.SIGTERM, 143),
]:
    session = Session("tui-" + name)
    try:
        if key:
            session.send(key)
        else:
            os.kill(session.child.pid, received_signal)
        session.finish(exit_code)
    finally:
        session.dispose()

print("Standalone TUI PTY smoke passed with an empty PATH and restored terminal attributes.")
`;

try {
  await copyFile(builtBinary, binary);
  await chmod(binary, 0o700);
  const child = Bun.spawn([python, "-c", driver, binary, directory], {
    cwd: directory,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  assert.equal(await child.exited, 0, "Standalone TUI PTY smoke failed");
} finally {
  await rm(directory, { recursive: true, force: true });
}
