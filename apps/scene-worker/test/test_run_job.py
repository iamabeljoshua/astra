import os
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "worker"))
from run_job import SceneFileRefused, read_scene_file  # noqa: E402


class ReadingWhatASceneLeftTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.path = pathlib.Path(self.folder.name) / "light.take"

    def test_it_reads_a_plain_file(self):
        self.path.write_bytes(b"take")
        self.assertEqual(read_scene_file(self.path, 10), b"take")

    def test_it_refuses_a_link_to_what_only_the_worker_can_read(self):
        secret = pathlib.Path(self.folder.name) / "secret"
        secret.write_bytes(b"secret")
        self.path.symlink_to(secret)
        with self.assertRaises(OSError):
            read_scene_file(self.path, 10)

    def test_it_refuses_a_file_past_its_limit(self):
        self.path.write_bytes(b"x" * 11)
        with self.assertRaises(SceneFileRefused):
            read_scene_file(self.path, 10)

    def test_it_refuses_a_pipe_that_would_hang_it(self):
        os.mkfifo(self.path)
        with self.assertRaises(SceneFileRefused):
            read_scene_file(self.path, 10)


if __name__ == "__main__":
    unittest.main()
