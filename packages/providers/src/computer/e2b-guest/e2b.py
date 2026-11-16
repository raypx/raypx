"""Fixed E2B guest entry point. Transport is JSON over stdin and bounded JSON output."""
import base64
import fcntl
import json
import os
import runpy
import selectors
import signal
import stat
import sys

home = runpy.run_path("/opt/raypx/home.py")
MAX_JSON = home["MAX_BYTES"] * 2
LOCK_PATH = "/opt/raypx/process.lock"
Refusal = home["Refusal"]


def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)


def preview(value):
    parts = home["parts"](value["path"])
    if not parts:
        raise Refusal("INVALID_INPUT")
    parent = home["directory"](home["WORKSPACE"], "/".join(parts[:-1]))
    try:
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode):
                raise Refusal("INVALID_INPUT")
            limit = value["maxBytes"]
            data = stream.read(limit + 1)
            return {
                "bytes": base64.b64encode(data[:limit]).decode(),
                "size": info.st_size,
                "truncated": info.st_size > limit or len(data) > limit,
            }
    finally:
        os.close(parent)


def execute(value):
    pipes = {kind: os.pipe() for kind in ("stdout", "stderr")}
    pid = os.fork()
    if pid == 0:
        try:
            for kind, (read_fd, write_fd) in pipes.items():
                os.close(read_fd)
                os.dup2(write_fd, 1 if kind == "stdout" else 2)
                os.close(write_fd)
            os._exit(home["run"]("exec", value, ready=False))
        except (Refusal, OSError):
            os._exit(126)

    def cancel(_signal, _frame):
        home["run"]("cancel", value)

    signal.signal(signal.SIGTERM, cancel)
    signal.signal(signal.SIGINT, cancel)
    signal.signal(signal.SIGALRM, cancel)
    signal.alarm(50)
    remaining = value["outputBudget"]
    truncated = False
    with selectors.DefaultSelector() as streams:
        for kind, (read_fd, write_fd) in pipes.items():
            os.close(write_fd)
            streams.register(read_fd, selectors.EVENT_READ, kind)
        try:
            while streams.get_map():
                for entry, _ in streams.select():
                    data = os.read(entry.fd, 8192)
                    if not data:
                        streams.unregister(entry.fd)
                        os.close(entry.fd)
                        continue
                    take = min(remaining, len(data))
                    if take:
                        emit({"kind": entry.data, "bytes": base64.b64encode(data[:take]).decode()})
                    remaining -= take
                    truncated |= take < len(data)
        finally:
            for entry in list(streams.get_map().values()):
                os.close(entry.fd)
            if sys.exc_info()[0]:
                cancel(None, None)
            _, status = os.waitpid(pid, 0)
    code = os.waitstatus_to_exitcode(status)
    emit({"kind": "exit", "status": code if code >= 0 else 128 - code,
          "cancelled": False, "truncated": truncated})


def main(operation):
    raw = sys.stdin.buffer.read(MAX_JSON + 1025)
    if len(raw) > MAX_JSON + 1024:
        raise Refusal("LIMIT_EXCEEDED")
    value = json.loads(raw)
    if operation == "cancel":
        emit(home["run"](operation, value))
        return
    if operation not in ("exec", "list", "read", "preview", "write", "replace", "search", "export", "import"):
        raise Refusal("INVALID_INPUT")
    # Archives wait for admitted commands to finish before reading the home.
    with open(LOCK_PATH, "r") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX if operation in ("export", "import") else fcntl.LOCK_SH)
        if operation == "exec":
            execute(value)
        else:
            result = preview(value) if operation == "preview" else home["run"](operation, value)
            encoded = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
            if len(encoded.encode()) > MAX_JSON:
                raise Refusal("LIMIT_EXCEEDED")
            print(encoded, flush=True)


if __name__ == "__main__":
    try:
        main(sys.argv[1])
    except Refusal as error:
        emit({"code": error.code})
    except FileNotFoundError:
        emit({"code": "NOT_FOUND"})
    except (ValueError, OSError):
        emit({"code": "INVALID_INPUT"})
