import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("computer_screen", Path(__file__).parents[1] / "src" / "screen.py")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class Refusal(Exception):
    pass


class ScreenReadiness(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.clock = 0
        self.spawned = []
        self.browser_checks = 0
        self.activations = 0
        self.browser_blocked = False
        self.activation_blocked = False
        self.focused = "101"
        helper.ROOT = self.temporary.name + "/screen"
        helper.Refusal = Refusal
        original_exists = helper.os.path.exists
        self.patches = [
            patch.object(helper.shutil, "which", side_effect=lambda name: "/usr/bin/" + name),
            patch.object(helper.time, "monotonic", side_effect=lambda: self.clock),
            patch.object(helper.time, "sleep", side_effect=self.sleep),
            patch.object(helper, "identity", side_effect=lambda pid: str(pid)),
            patch.object(helper.os.path, "exists", side_effect=lambda path: path == "/tmp/.X11-unix/X99" or original_exists(path)),
            patch.object(helper.subprocess, "Popen", side_effect=self.spawn),
            patch.object(helper.subprocess, "run", side_effect=self.command),
            patch.object(helper.os, "killpg"),
        ]
        for current in self.patches:
            current.start()

    def tearDown(self):
        for current in reversed(self.patches):
            current.stop()
        self.temporary.cleanup()

    def sleep(self, duration):
        self.clock += duration

    def spawn(self, argv, **kwargs):
        self.spawned.append(argv[0])
        if argv[0] == "xterm":
            self.assertGreaterEqual(self.browser_checks, 3)
        self.assertTrue(kwargs["start_new_session"])
        return SimpleNamespace(pid=len(self.spawned))

    def command(self, argv, **kwargs):
        self.assertGreater(kwargs["timeout"], 0)
        self.assertLessEqual(kwargs["timeout"], 1)
        action = argv[1]
        if action == "search":
            if argv[-1] == "^Computer":
                self.browser_checks += 1
                ready = self.browser_checks >= 3 and not self.browser_blocked
                return SimpleNamespace(returncode=0 if ready else 1, stdout=b"101\n")
            return SimpleNamespace(returncode=0, stdout=b"202\n")
        if action == "windowactivate":
            self.activations += 1
            if self.activations >= 3 and not self.activation_blocked:
                self.focused = "202"
            return SimpleNamespace(returncode=0 if self.activations >= 2 else 1, stdout=b"")
        if action == "getwindowfocus":
            return SimpleNamespace(returncode=0, stdout=(self.focused + "\n").encode())
        self.fail("Unexpected fixed display command")

    def test_waits_for_mapped_browser_and_confirmed_terminal_focus(self):
        result = helper.start()
        self.assertTrue(result["running"])
        self.assertEqual(self.focused, "202")
        self.assertGreaterEqual(self.activations, 3)
        self.assertEqual(self.spawned, ["Xvfb", "openbox", "/usr/bin/netsurf-gtk", "xterm"])
        self.assertLess(self.clock, 8)

    def test_never_reports_ready_with_focus_stolen_and_cleans_started_processes(self):
        self.activation_blocked = True
        with self.assertRaisesRegex(Refusal, "PROVIDER_UNAVAILABLE"):
            helper.start()
        self.assertFalse(helper.running())
        self.assertFalse(Path(helper.ROOT + "/ready").exists())
        self.assertEqual(helper.os.killpg.call_count, 4)
        self.assertLessEqual(self.clock, 8.1)

    def test_browser_timeout_does_not_start_a_terminal_or_leave_a_partial_session(self):
        self.browser_blocked = True
        with self.assertRaisesRegex(Refusal, "PROVIDER_UNAVAILABLE"):
            helper.start()
        self.assertNotIn("xterm", self.spawned)
        self.assertFalse(helper.running())
        self.assertEqual(helper.os.killpg.call_count, 3)
        self.assertLessEqual(self.clock, 8.1)

    def test_live_display_without_completed_readiness_is_not_a_running_session(self):
        Path(helper.ROOT).mkdir()
        Path(helper.ROOT + "/processes.json").write_text(json.dumps([[1, "1"]]))
        self.assertFalse(helper.running())


if __name__ == "__main__":
    unittest.main()
