import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("computer_home", Path(__file__).parents[1] / "src" / "home.py")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class FileBoundary(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        helper.HOME = self.temporary.name + "/home"
        helper.WORKSPACE = helper.HOME + "/workspace"
        os.makedirs(helper.WORKSPACE)
        self.outside = self.temporary.name + "/outside"
        os.mkdir(self.outside)

    def tearDown(self):
        self.temporary.cleanup()

    def test_rejects_symlinks_at_every_component_and_final_target(self):
        os.symlink(self.outside, helper.WORKSPACE + "/escape")
        Path(self.outside + "/secret").write_bytes(b"fixture")
        for action in [lambda: helper.read(helper.WORKSPACE, "escape/secret", 100), lambda: helper.write(helper.WORKSPACE, "escape/new", b"fixture"), lambda: helper.run("list", {"path": "escape", "limit": 1})]:
            with self.assertRaises((OSError, helper.Refusal)):
                action()
        os.symlink(self.outside + "/secret", helper.WORKSPACE + "/link")
        with self.assertRaises((OSError, helper.Refusal)):
            helper.write(helper.WORKSPACE, "link", b"fixture")
        self.assertFalse(Path(self.outside + "/new").exists())

    def test_bounds_files_lists_and_snapshot_and_keeps_all_home_files(self):
        helper.write(helper.WORKSPACE, "nested/hello", b"fixture")
        self.assertEqual(helper.read(helper.WORKSPACE, "nested/hello", 20), b"fixture")
        with self.assertRaises(helper.Refusal):
            helper.read(helper.WORKSPACE, "nested/hello", 1)
        helper.write(helper.HOME, ".configuration", b"fixture")
        archive = helper.export_home()
        self.assertIn(".configuration", [e["path"] for e in archive["entries"]])
        helper.write(helper.WORKSPACE, "another", b"fixture")
        result = helper.run("list", {"path": "", "limit": 1})
        self.assertEqual(len(result["entries"]), 1)
        self.assertTrue(result["truncated"])
        os.symlink(self.outside, helper.WORKSPACE + "/link")
        self.assertIn("symlink", [e["kind"] for e in helper.export_home()["entries"]])

    def test_rejects_traversal_and_special_files_without_blocking(self):
        for path in ["../secret", "/etc/passwd", "a/../../secret", "a\\b"]:
            with self.assertRaises(helper.Refusal):
                helper.write(helper.WORKSPACE, path, b"fixture")
        os.mkfifo(helper.WORKSPACE + "/fifo")
        with self.assertRaises(helper.Refusal):
            helper.read(helper.WORKSPACE, "fifo", 10)


if __name__ == "__main__":
    unittest.main()
