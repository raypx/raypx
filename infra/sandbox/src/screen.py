"""Private local-X helper. It opens no listener and never writes screen bytes to logs."""
import base64
import json
import os
import shutil
import signal
import struct
import subprocess
import time
import zlib

ROOT = "/run/raypx/screen"
WIDTH, HEIGHT = 1024, 768
ENV = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/home/computer", "DISPLAY": ":99"}


def refusal(code):
    raise Refusal(code)


def processes():
    try:
        with open(ROOT + "/processes.json") as stream:
            return json.load(stream)
    except FileNotFoundError:
        return []


def identity(pid):
    try:
        with open("/proc/" + str(pid) + "/stat") as stream:
            return stream.read().split(") ", 1)[1].split()[19]
    except (FileNotFoundError, ProcessLookupError):
        return None


def running():
    items = processes()
    return bool(items) and identity(items[0][0]) == items[0][1] and os.path.isfile(ROOT + "/ready")


def availability():
    return {"available": bool(shutil.which("Xvfb")), "running": running(), "width": WIDTH, "height": HEIGHT}


def stop():
    for pid, started in reversed(processes()):
        if identity(pid) == started:
            try:
                os.killpg(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
    for name in ["processes.json", "ready"]:
        try:
            os.unlink(ROOT + "/" + name)
        except FileNotFoundError:
            pass
    return availability()


def desktop_command(argv, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        refusal("PROVIDER_UNAVAILABLE")
    try:
        return subprocess.run(["xdotool", *argv], env=ENV, stdout=subprocess.PIPE,
                              stderr=subprocess.DEVNULL, timeout=min(1, remaining))
    except subprocess.TimeoutExpired:
        return None


def visible_window(name, deadline):
    while time.monotonic() < deadline:
        result = desktop_command(["search", "--onlyvisible", "--name", name], deadline)
        if result is not None and result.returncode == 0:
            windows = result.stdout.decode("ascii").splitlines()
            if windows and windows[0].isdigit():
                return windows[0]
        time.sleep(0.05)
    refusal("PROVIDER_UNAVAILABLE")


def activate_terminal(window, deadline):
    while time.monotonic() < deadline:
        active = desktop_command(["windowactivate", "--sync", window], deadline)
        if active is not None and active.returncode == 0:
            focused = desktop_command(["getwindowfocus"], deadline)
            if focused is not None and focused.returncode == 0 and focused.stdout.decode("ascii").strip() == window:
                return
        time.sleep(0.05)
    refusal("PROVIDER_UNAVAILABLE")


def start():
    if running():
        return availability()
    if not shutil.which("Xvfb"):
        refusal("SCREEN_UNAVAILABLE")
    stop()
    os.makedirs(ROOT, mode=0o700, exist_ok=True)
    items = []

    def spawn(argv):
        process = subprocess.Popen(argv, env=ENV, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL, start_new_session=True)
        items.append([process.pid, identity(process.pid)])
        with open(ROOT + "/processes.json", "w") as stream:
            json.dump(items, stream)
        return process

    try:
        # All readiness checks share this budget, inside the Engine's ten-second deadline.
        deadline = time.monotonic() + 8
        spawn(["Xvfb", ":99", "-nolisten", "tcp", "-screen", "0", "1024x768x24", "-fbdir", ROOT])
        while not os.path.exists("/tmp/.X11-unix/X99"):
            if identity(items[0][0]) != items[0][1] or time.monotonic() >= deadline:
                refusal("PROVIDER_UNAVAILABLE")
            time.sleep(0.05)
        spawn(["openbox", "--sm-disable"])
        browser = shutil.which("netsurf-gtk") or shutil.which("netsurf")
        if not browser:
            refusal("SCREEN_UNAVAILABLE")
        spawn([browser, "file:///opt/raypx/screen.html"])
        # Wait for the browser to map before creating the terminal. A late browser map
        # could otherwise steal focus after Start returned and silently discard typing.
        visible_window("^Computer", deadline)
        spawn(["xterm", "-geometry", "90x22+64+320", "-title", "Workspace", "-bg", "#ffffff", "-fg", "#202020"])
        window = visible_window("^Workspace$", deadline)
        activate_terminal(window, deadline)
        with open(ROOT + "/ready", "w"):
            pass
        return availability()
    except Exception:
        stop()
        raise


def png_chunk(name, data):
    return struct.pack(">I", len(data)) + name + data + struct.pack(">I", zlib.crc32(name + data))


def screenshot():
    if not running():
        refusal("NOT_RUNNING")
    with open(ROOT + "/Xvfb_screen0", "rb") as stream:
        header = struct.unpack(">25I", stream.read(100))
        _, version, _, _, width, height, _, order, _, _, _, bits, stride, _, red, green, blue, _, _, colors, *_ = header
        if version != 7 or width != WIDTH or height != HEIGHT or bits != 32 or stride > WIDTH * 8:
            refusal("PROVIDER_UNAVAILABLE")
        stream.seek(header[0] + colors * 12)
        pixels = stream.read(stride * height)
    if len(pixels) != stride * height or (red, green, blue) != (0xff0000, 0xff00, 0xff):
        refusal("PROVIDER_UNAVAILABLE")
    output = bytearray((width * 3 + 1) * height)
    # Xvfb stores BGRx on little-endian hosts and xRGB on big-endian hosts.
    channels = (2, 1, 0) if order == 0 else (1, 2, 3)
    for y in range(height):
        row = pixels[y * stride:(y + 1) * stride]
        offset = y * (width * 3 + 1) + 1
        for channel, source in enumerate(channels):
            output[offset + channel:offset + width * 3:3] = row[source:width * 4:4]
    png = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += png_chunk(b"IDAT", zlib.compress(output, 4)) + png_chunk(b"IEND", b"")
    if len(png) > 1024 * 1024:
        refusal("LIMIT_EXCEEDED")
    return {"width": width, "height": height, "mimeType": "image/png", "bytes": base64.b64encode(png).decode()}


def input_event(value):
    if not running():
        refusal("NOT_RUNNING")
    kind = value["kind"]
    if kind == "pointer":
        if value["x"] >= WIDTH or value["y"] >= HEIGHT:
            refusal("INVALID_INPUT")
        argv = ["xdotool", "mousemove", str(value["x"]), str(value["y"])]
        if value["action"] != "move":
            button = {"left": "1", "middle": "2", "right": "3"}[value["button"]]
            argv += ["mousedown" if value["action"] == "down" else "mouseup", button]
    elif kind == "key":
        aliases = {"Enter": "Return", "Backspace": "BackSpace", "ArrowLeft": "Left", "ArrowRight": "Right",
                   "ArrowUp": "Up", "ArrowDown": "Down", "Control": "Control_L", "Alt": "Alt_L", "Shift": "Shift_L",
                   "Meta": "Super_L", "Space": "space", "Delete": "Delete", "Escape": "Escape"}
        action = {"down": "keydown", "up": "keyup", "press": "key"}[value["action"]]
        argv = ["xdotool", action, aliases.get(value["key"], value["key"])]
    elif kind == "text":
        argv = ["xdotool", "type", "--clearmodifiers", "--delay", "0", "--", value["text"]]
    else:
        refusal("INVALID_INPUT")
    subprocess.run(argv, env=ENV, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL, timeout=2, check=True)
    return {}


def run(operation, value, refusal_type):
    global Refusal
    Refusal = refusal_type
    if operation == "get":
        return availability()
    if operation == "start":
        return start()
    if operation == "stop":
        return stop()
    if operation == "screenshot":
        return screenshot()
    if operation == "input":
        return input_event(value["input"])
    refusal("INVALID_INPUT")
