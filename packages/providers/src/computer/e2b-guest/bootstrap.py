"""Install the released helpers before the candidate admits its first command."""
import json
import os
import pwd
import stat
import subprocess
import sys
import tempfile

ROOT = "/opt/raypx"
HOME = "/home/computer"

if os.geteuid() != 0:
    raise RuntimeError("Raypx guest bootstrap requires root")
# The template is in our provider, but its filesystem is still an external input.
# Check the directories without following links before installing privileged files.
for parent in ("/opt", "/home"):
    info = os.lstat(parent)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise RuntimeError("Unsafe Raypx guest parent")
try:
    account = pwd.getpwnam("computer")
except KeyError:
    subprocess.run(
        ["/usr/sbin/useradd", "--user-group", "--create-home", "--home-dir", HOME,
         "--shell", "/bin/sh", "computer"],
        check=True, timeout=10,
    )
    account = pwd.getpwnam("computer")
if account.pw_uid <= 0 or account.pw_gid <= 0 or account.pw_dir != HOME:
    raise RuntimeError("Unexpected Raypx guest account")

os.makedirs(ROOT, mode=0o755, exist_ok=True)
info = os.lstat(ROOT)
if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
    raise RuntimeError("Unsafe Raypx helper directory")
info = os.lstat(HOME)
if not stat.S_ISDIR(info.st_mode) or info.st_uid != account.pw_uid:
    raise RuntimeError("Unexpected Raypx guest home")

workspace = HOME + "/workspace"
try:
    os.mkdir(workspace, mode=0o700)
    os.chown(workspace, account.pw_uid, account.pw_gid, follow_symlinks=False)
except FileExistsError:
    info = os.lstat(workspace)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != account.pw_uid:
        raise RuntimeError("Unexpected Raypx guest workspace")

sources = json.load(sys.stdin)
for name, source, mode in (
    ("home.py", sources["home"], 0o644),
    ("e2b.py", sources["guest"], 0o644),
    ("process.lock", "", 0o444),
):
    with tempfile.NamedTemporaryFile(dir=ROOT, delete=False) as staged:
        try:
            staged.write(source.encode("utf-8"))
            staged.flush()
            os.fchmod(staged.fileno(), mode)
            os.replace(staged.name, os.path.join(ROOT, name))
        finally:
            if os.path.exists(staged.name):
                os.unlink(staged.name)
