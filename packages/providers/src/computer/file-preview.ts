/** Fixed computer-side reader. Isolated Python ignores workspace imports and opens no links. */
export const filePreviewScript = `import base64, errno, json, os, stat, sys
fds = []
try:
    parts = sys.argv[1].split("/")
    budget = int(sys.argv[2])
    fd = os.open("/home/computer/workspace", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    fds.append(fd)
    for part in parts[:-1]:
        fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
        fds.append(fd)
    leaf = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
    fds.append(leaf)
    info = os.fstat(leaf)
    if not stat.S_ISREG(info.st_mode):
        raise ValueError()
    with os.fdopen(os.dup(leaf), "rb") as stream:
        data = stream.read(budget + 1)
    print(json.dumps({"bytes": base64.b64encode(data[:budget]).decode(), "size": info.st_size, "truncated": info.st_size > budget or len(data) > budget}))
except FileNotFoundError:
    print(json.dumps({"code": "NOT_FOUND"}))
except (ValueError, OSError) as error:
    code = "INVALID_INPUT"
    if isinstance(error, OSError) and error.errno not in (errno.ELOOP, errno.ENOTDIR, errno.EACCES, errno.EPERM):
        code = "PROVIDER_UNAVAILABLE"
    print(json.dumps({"code": code}))
finally:
    for fd in reversed(fds):
        os.close(fd)
`;
