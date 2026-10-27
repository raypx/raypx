"""Isolated real-CLI hook test. Never answers a native tool approval prompt."""
import base64
from datetime import datetime, timezone
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

spec = json.load(open(sys.argv[1]))

def terminate(_signal, _frame):
    raise SystemExit("Terminal contract driver stopped")

signal.signal(signal.SIGTERM, terminate)
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 35, 110, 0, 0))
environment = dict(os.environ, TERM="xterm-256color", LANG="en_US.UTF-8")
child = subprocess.Popen(spec["args"], cwd=spec["cwd"], env=environment,
                         stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
screen = bytearray()
passed = False
deadline = time.monotonic() + min(400, max(1, spec.get("timeoutSeconds", 110)))
decided_at = None
setup_steps = set()
setup_actions = []
try:
    while time.monotonic() < deadline and child.poll() is None:
        ready_actions = [action for action in setup_actions if action[0] <= time.monotonic()]
        setup_actions = [action for action in setup_actions if action[0] > time.monotonic()]
        for _, keys in ready_actions:
            os.write(master, keys)
        if select.select([master], [], [], 0.1)[0]:
            try:
                chunk = os.read(master, 65536)
            except OSError:
                break
            screen.extend(chunk)
            evidence = spec["screen"] + ".jsonl"
            with open(evidence, "a") as output:
                output.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(), "bytes": base64.b64encode(chunk).decode("ascii")}) + "\n")
            os.chmod(evidence, 0o600)
            with open(spec["screen"], "wb") as output:
                output.write(screen)
            os.chmod(spec["screen"], 0o600)
            if len(screen) > 4 * 1024 * 1024:
                raise AssertionError("CLI screen output exceeded 4 MiB")
            if b"\x1b[6n" in chunk:
                os.write(master, b"\x1b[1;1R")
            if b"\x1b[?u" in chunk:
                os.write(master, b"\x1b[?0u")
            if b"\x1b[c" in chunk:
                os.write(master, b"\x1b[?1;2c")
            # Only initial setup of this empty synthetic project is accepted.
            # Tool approvals are never answered by the terminal driver.
            if spec.get("provider") == "claude" and (not spec.get("capture") or not os.path.exists(spec["capture"])):
                text = re.sub(rb"\x1b\[[0-?]*[ -/]*[@-~]", b"", bytes(screen)).lower()
                flat = re.sub(rb"\s+", b"", text)
                for label, patterns in [
                    ("theme", [b"choose the text style", b"select the text style"]),
                    ("security", [b"security notes"]),
                    ("project", [b"do you trust the files", b"trust this folder", b"is this a project you created"]),
                ]:
                    if label not in setup_steps and any(pattern.replace(b" ", b"") in flat for pattern in patterns):
                        setup_steps.add(label)
                        if label == "project":
                            setup_actions.append((time.monotonic() + 0.25, b"\x1b[B"))
                            setup_actions.append((time.monotonic() + 0.5, b"\r"))
                        else:
                            setup_actions.append((time.monotonic() + 0.25, b"\r"))
        if spec.get("marker") and os.path.exists(spec["marker"]):
            passed = open(spec["marker"]).read() == "RAYPX_TERMINAL_P1"
            break
        if spec.get("capture") and os.path.exists(spec["capture"]):
            records = [json.loads(line) for line in open(spec["capture"]) if line.strip()]
            if any("output" in record for record in records):
                decided_at = decided_at or time.monotonic()
                marker = os.path.join(spec["cwd"], "permission-marker.txt")
                if spec["decision"] == "allow" and os.path.exists(marker):
                    passed = open(marker).read() == "RAYPX_TERMINAL_P0"
                    break
                text = re.sub(rb"\x1b\[[0-?]*[ -/]*[@-~]", b"", bytes(screen)).lower()
                if spec["decision"] == "deny" and b"p0contracttestdeclined" in re.sub(rb"\s+", b"", text):
                    passed = not os.path.exists(marker)
                    break
            elif spec["decision"] == "fallback" and any(record.get("fallback") is True for record in records):
                text = re.sub(rb"\x1b\[[0-?]*[ -/]*[@-~]", b"", bytes(screen)).lower()
                flat = re.sub(rb"\s+", b"", text)
                if b"wouldyouliketorun" in flat or b"doyouwanttorun" in flat or b"doyouwanttoproceed" in flat:
                    passed = not os.path.exists(os.path.join(spec["cwd"], "permission-marker.txt"))
                    break
finally:
    if child.poll() is None:
        os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait(timeout=5)
    with open(spec["screen"], "wb") as output:
        output.write(screen)
    os.chmod(spec["screen"], 0o600)
    os.close(master)
    os.close(slave)
if not passed:
    raise AssertionError("Real terminal hook contract did not pass; inspect private screen capture")
