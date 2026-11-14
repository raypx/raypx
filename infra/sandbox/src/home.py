"""Computer-side helper. No host access, shell interpolation, or content logging."""
import base64
import itertools
import json
import os
import resource
import runpy
import signal
import shutil
import stat
import subprocess
import sys
import uuid

HOME = "/home/computer"
WORKSPACE = HOME + "/workspace"
MAX_BYTES = 32 * 1024 * 1024


class Refusal(Exception):
    def __init__(self, code):
        self.code = code


def parts(path):
    if not isinstance(path, str) or len(path) > 4096 or path.startswith("/") or "\\" in path or "\0" in path or ".." in path.split("/"):
        raise Refusal("INVALID_INPUT")
    return [p for p in path.split("/") if p and p != "."]


def directory(root, path, create=False):
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in parts(path):
            if create:
                try:
                    os.mkdir(part, dir_fd=fd)
                except FileExistsError:
                    pass
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def read(root, path, budget):
    components = parts(path)
    if not components:
        raise Refusal("INVALID_INPUT")
    parent = directory(root, "/".join(components[:-1]))
    try:
        fd = os.open(components[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode):
                raise Refusal("INVALID_INPUT")
            data = stream.read(budget + 1)
            if len(data) > budget:
                raise Refusal("LIMIT_EXCEEDED")
            return data
    finally:
        os.close(parent)


def write(root, path, data, mode=0o644):
    components = parts(path)
    if not components:
        raise Refusal("INVALID_INPUT")
    parent = directory(root, "/".join(components[:-1]), True)
    temporary = ".rpx-" + str(uuid.uuid4())
    try:
        try:
            info = os.stat(components[-1], dir_fd=parent, follow_symlinks=False)
            if not stat.S_ISREG(info.st_mode):
                raise Refusal("INVALID_INPUT")
        except FileNotFoundError:
            pass
        fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode, dir_fd=parent)
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), mode)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.rename(temporary, components[-1], src_dir_fd=parent, dst_dir_fd=parent)
    finally:
        try:
            os.unlink(temporary, dir_fd=parent)
        except FileNotFoundError:
            pass
        os.close(parent)


def export_home():
    entries = []
    remaining = MAX_BYTES

    def walk(path):
        nonlocal remaining
        fd = directory(HOME, path)
        try:
            for item in os.scandir(fd):
                name = (path + "/" if path else "") + item.name
                info = item.stat(follow_symlinks=False)
                mode = stat.S_IMODE(info.st_mode) & 0o777
                if len(entries) >= 10000:
                    raise Refusal("LIMIT_EXCEEDED")
                if stat.S_ISDIR(info.st_mode):
                    entries.append({"path": name, "kind": "directory", "mode": mode})
                    walk(name)
                elif stat.S_ISREG(info.st_mode):
                    data = read(HOME, name, remaining)
                    remaining -= len(data)
                    entries.append({"path": name, "kind": "file", "bytes": base64.b64encode(data).decode(), "mode": mode})
                elif stat.S_ISLNK(info.st_mode):
                    entries.append({"path": name, "kind": "symlink", "target": os.readlink(item.name, dir_fd=fd)})
                else:
                    raise Refusal("RESTORE_FAILED")
        finally:
            os.close(fd)
    walk("")
    return {"version": 1, "entries": entries}


def run(operation, value):
    if operation.startswith("screen-"):
        screen_run = runpy.run_path("/opt/raypx/screen.py")["run"]
        return screen_run(operation[7:], value, Refusal)
    if operation == "exec":
        # The supervisor holds the computer lock until this trusted ready prefix.
        # OCI errors before Python starts must never become command output.
        os.write(1, b"\x1eRAYPX_READY\n")
        execution_id = str(uuid.UUID(value["executionId"]))
        marker = "/tmp/rpx-cancel-" + execution_id
        pidfile = "/tmp/rpx-pid-" + execution_id
        cwd = directory(WORKSPACE, value["cwd"])
        try:
            os.fchdir(cwd)
        finally:
            os.close(cwd)
        if os.path.exists(marker):
            return 137
        environment = {"HOME": HOME, "PATH": "/usr/local/bin:/usr/bin:/bin", **value["environment"]}
        try:
            child = subprocess.Popen([value["executable"], *value["argv"]], env=environment, start_new_session=True, stdin=subprocess.PIPE if "stdin" in value else subprocess.DEVNULL)
        except FileNotFoundError:
            return 127
        with open(pidfile, "x") as stream:
            stream.write(str(child.pid))
        try:
            if os.path.exists(marker):
                os.killpg(child.pid, signal.SIGKILL)
            # Publish the PID before a pipe write can block, so cancellation can kill the child.
            if child.stdin is not None:
                try:
                    child.stdin.write(value["stdin"].encode("utf-8"))
                    child.stdin.close()
                except BrokenPipeError:
                    pass
            code = child.wait()
            return code if code >= 0 else 128 - code
        finally:
            # Reap descendants left in this command's process group.
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            os.unlink(pidfile)
            try:
                os.unlink(marker)
            except FileNotFoundError:
                pass
    if operation == "cancel":
        execution_id = str(uuid.UUID(value["executionId"]))
        marker = "/tmp/rpx-cancel-" + execution_id
        with open(marker, "a"):
            pass
        try:
            with open("/tmp/rpx-pid-" + execution_id) as stream:
                pid = int(stream.read())
            os.killpg(pid, signal.SIGKILL)
        except (FileNotFoundError, ProcessLookupError):
            pass
        return {}
    if operation == "list":
        fd = directory(WORKSPACE, value["path"])
        try:
            with os.scandir(fd) as scan:
                items = list(itertools.islice(scan, value["limit"] + 1))
            entries = []
            for item in sorted(items, key=lambda i: i.name)[:value["limit"]]:
                kind = "symlink" if item.is_symlink() else "file"
                if item.is_dir(follow_symlinks=False):
                    kind = "directory"
                entries.append({"path": (value["path"] + "/" if value["path"] else "") + item.name, "kind": kind})
            return {"entries": entries, "truncated": len(items) > value["limit"]}
        finally:
            os.close(fd)
    if operation == "read":
        return {"bytes": base64.b64encode(read(WORKSPACE, value["path"], value["maxBytes"])).decode()}
    if operation == "write":
        data = base64.b64decode(value["bytes"], validate=True)
        if len(data) > MAX_BYTES:
            raise Refusal("LIMIT_EXCEEDED")
        write(WORKSPACE, value["path"], data)
        return {}
    if operation == "export":
        return export_home()
    if operation == "import":
        # Only called on a fresh candidate volume after supervisor validation.
        for item in os.scandir(HOME):
            if item.is_dir(follow_symlinks=False):
                shutil.rmtree(item.path)
            else:
                os.unlink(item.path)
        for entry in sorted(value["archive"]["entries"], key=lambda e: (e["path"].count("/"), e["path"])):
            if entry["kind"] == "directory":
                fd = directory(HOME, entry["path"], True)
                os.close(fd)
            elif entry["kind"] == "file":
                write(HOME, entry["path"], base64.b64decode(entry["bytes"], validate=True), entry["mode"])
            elif entry["kind"] == "symlink":
                components = parts(entry["path"])
                parent = directory(HOME, "/".join(components[:-1]))
                try:
                    os.symlink(entry["target"], components[-1], dir_fd=parent)
                finally:
                    os.close(parent)
            else:
                raise Refusal("RESTORE_FAILED")
        for entry in sorted(value["archive"]["entries"], key=lambda e: -e["path"].count("/")):
            if entry["kind"] == "directory":
                fd = directory(HOME, entry["path"])
                try:
                    os.fchmod(fd, entry["mode"])
                finally:
                    os.close(fd)
        return {}
    raise Refusal("INVALID_INPUT")


if __name__ == "__main__":
    try:
        with open(sys.argv[2]) as stream:
            value = json.load(stream)
        os.unlink(sys.argv[2])
        # OCI exec may not inherit init-process rlimits under a user-space kernel.
        # Numeric supervisor arguments stay outside guest-writable input data.
        files, file_bytes, pids = map(int, sys.argv[3:6])
        for kind, ceiling in ((resource.RLIMIT_NOFILE, files),
                              (resource.RLIMIT_FSIZE, file_bytes),
                              (resource.RLIMIT_NPROC, pids or None)):
            if ceiling is not None:
                hard = resource.getrlimit(kind)[1]
                if hard != resource.RLIM_INFINITY:
                    ceiling = min(ceiling, hard)
                resource.setrlimit(kind, (ceiling, ceiling))
        result = run(sys.argv[1], value)
        if sys.argv[1] == "exec":
            sys.exit(result)
        print(json.dumps(result, separators=(",", ":")))
    except Refusal as error:
        print(json.dumps({"code": error.code}))
        sys.exit(1)
    except FileNotFoundError:
        print('{"code":"NOT_FOUND"}')
        sys.exit(1)
    except Exception:
        print('{"code":"INVALID_INPUT"}')
        sys.exit(1)
