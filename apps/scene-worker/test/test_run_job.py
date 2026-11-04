import os
import pathlib
import signal
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "worker"))
import run_job  # noqa: E402
from run_job import SceneFileRefused, read_scene_file, run_as_scene  # noqa: E402


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


class StepLimitTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.saved = run_job.JOB_ROOM, run_job.SCENE_ROOM, run_job.SCENE_ACCOUNT, run_job.end_scene_processes
        self.addCleanup(self.restore)
        run_job.JOB_ROOM = run_job.SCENE_ROOM = pathlib.Path(folder.name)
        run_job.SCENE_ACCOUNT = {}
        self.ended = []
        run_job.end_scene_processes = self.end_everything

    def restore(self):
        run_job.JOB_ROOM, run_job.SCENE_ROOM, run_job.SCENE_ACCOUNT, run_job.end_scene_processes = self.saved

    def end_everything(self):
        self.ended.append(True)
        for process in subprocess.run(["pgrep", "-P", str(os.getpid()), "sleep"], capture_output=True, text=True).stdout.split():
            os.kill(int(process), signal.SIGKILL)

    def test_it_ends_a_step_at_its_limit_and_not_at_the_whole_job_limit(self):
        started = time.monotonic()
        with self.assertRaises(subprocess.TimeoutExpired):
            run_as_scene({"forever": ["sleep", "30"]}, 0.3)
        self.assertLess(time.monotonic() - started, 5)
        self.assertEqual(self.ended, [True])

    def test_it_runs_steps_at_once_on_one_limit(self):
        started = time.monotonic()
        results = run_as_scene({"one": ["sleep", "0.4"], "two": ["sleep", "0.4"]}, 5)
        self.assertLess(time.monotonic() - started, 0.75)
        self.assertEqual([results["one"][0], results["two"][0]], [0, 0])

    def test_it_stops_every_step_when_one_runs_past_the_limit(self):
        with self.assertRaises(subprocess.TimeoutExpired):
            run_as_scene({"short": ["sleep", "0.05"], "forever": ["sleep", "30"]}, 0.2)
        self.assertEqual(self.ended, [True])


if __name__ == "__main__":
    unittest.main()
