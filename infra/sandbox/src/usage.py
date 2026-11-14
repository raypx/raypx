"""Trusted, bounded volume accounting; invoked outside the tenant namespace.

Count apparent and allocated bytes (including directories and symlinks), never
follow links, bound traversal by entry count and wall time. No filenames leave
this process. Any inability to measure is a refusal, never zero usage.
"""
import json
import os
import signal
import stat
import sys

signal.alarm(5)
limit = int(sys.argv[1])
byte_limit = int(sys.argv[2])
entries = 0
size = 0

def walk(fd):
    global entries, size
    with os.scandir(fd) as children:
        for child in children:
            info = child.stat(follow_symlinks=False)
            entries += 1
            size += max(info.st_size, info.st_blocks * 512)
            if entries > limit or size > byte_limit:
                return False
            if stat.S_ISDIR(info.st_mode):
                nested = os.open(child.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                try:
                    if not walk(nested):
                        return False
                finally:
                    os.close(nested)
    return True

try:
    root = os.open('/usage', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        complete = walk(root)
    finally:
        os.close(root)
    print(json.dumps({'bytes': size, 'entries': entries, 'complete': complete}), flush=True)
except Exception:
    sys.exit(1)
