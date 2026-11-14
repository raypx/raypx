"""Owned Linux-root fixture for the network service's local credential boundary."""
import json
import os
import pwd
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import uuid

stage = tempfile.mkdtemp(prefix="raypx-network-ipc-")
path = stage + "/socket/control.sock"
child = None
try:
    if sys.platform != "linux" or os.getuid() != 0:
        raise RuntimeError("Linux root fixture required")
    child = subprocess.Popen([sys.executable, "-I", sys.argv[1], "serve", stage + "/state", path,
                              pwd.getpwuid(0).pw_name], stdin=subprocess.DEVNULL,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        if os.path.exists(path):
            break
        if child.poll() is not None:
            raise RuntimeError("Owned service exited")
        time.sleep(.02)
    namespace = "ipc-" + uuid.uuid4().hex
    import hashlib
    value = {"operation": "reconcile", "namespace": namespace,
             "bridge": "rpx" + hashlib.sha256(namespace.encode()).hexdigest()[:10], "keys": []}
    with socket.socket(socket.AF_UNIX) as client:
        client.settimeout(5)
        client.connect(path)
        client.sendall(json.dumps(value).encode() + b"\n")
        response = json.loads(client.recv(4096))
        assert response == {}
    # Remove DAC rejection in this isolated fixture to prove the peer-UID check
    # itself rejects a different user. Production retains restrictive permissions.
    os.chmod(stage, 0o755)
    os.chmod(stage + "/socket", 0o755)
    os.chmod(path, 0o666)
    script = """import socket,sys
s=socket.socket(socket.AF_UNIX);s.settimeout(3);s.connect(sys.argv[1])
try:
 s.sendall(b'{}\\n'); result=s.recv(4096)
except (BrokenPipeError,ConnectionResetError): result=b''
assert not result
"""
    def drop_identity():
        os.setgroups([])
        os.setgid(65534)
        os.setuid(65534)
    rejected = subprocess.run([sys.executable, "-I", "-c", script, path],
                              preexec_fn=drop_identity, capture_output=True, timeout=5)
    assert rejected.returncode == 0
    print(json.dumps({"admittedUid": 0, "rejectedUid": 65534, "peerCredentialsVerified": True}))
finally:
    if child is not None:
        child.terminate()
        try:
            child.wait(timeout=3)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
    shutil.rmtree(stage)
