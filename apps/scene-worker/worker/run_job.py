import json
import os
import pathlib
import re
import signal
import stat
import struct
import subprocess
import sys

WORKER = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(WORKER))
from gate import check_scene_code  # noqa: E402

SCENE_UID = 1000
SCENE_GID = 1000
JOB_ROOM = pathlib.Path("/tmp/job")
SCENE_ROOM = pathlib.Path("/scene")
SCENE_ENV = {"HOME": str(SCENE_ROOM), "TMPDIR": str(SCENE_ROOM), "XDG_RUNTIME_DIR": str(SCENE_ROOM), "PATH": "/usr/local/bin:/usr/bin:/bin", "PYTHONPATH": str(WORKER), "PYTHONDONTWRITEBYTECODE": "1"}
LATEST_MOMENT_SECONDS = 0.35
DURATION_SLACK_SECONDS = 1.0
TRUTH_NAMES = ("moon_orbit", "seasons(", "astra_truth")
LAYOUT_PROBLEM = re.compile(r"^\s*\[\d+\]\s*(.+)$")
LAYOUT_NOTE = re.compile(r"^\s*note:\s*(.+)$")
SCENE_LINE = re.compile(r'scene[^"]*\.py", line (\d+)')
MOST_ERROR_CHARACTERS = 600
MOST_OUTPUT_BYTES = 64 * 1024
MOST_SHEET_BYTES = 4 * 1024 * 1024
MOST_SHEETS_A_THEME = 6


class SceneFileRefused(Exception):
    pass


def take_stdout_for_records():
    """Keeps the real stdout for records, so anything else that prints lands on stderr."""
    stream = os.fdopen(os.dup(1), "wb", buffering=0)
    os.dup2(2, 1)
    return stream


record_stream = take_stdout_for_records()


def send_record(header, payload=b""):
    head = json.dumps({**header, "bytes": len(payload)}).encode()
    record_stream.write(struct.pack(">I", len(head)) + head + payload)


def end_scene_processes():
    """Only the scene's own uid can signal what a scene left running, so a short-lived child steps down and sends the signal."""
    child = os.fork()
    if child == 0:
        try:
            os.setgroups([])
            os.setgid(SCENE_GID)
            os.setuid(SCENE_UID)
            os.kill(-1, signal.SIGKILL)
        except OSError:
            pass
        os._exit(0)
    os.waitpid(child, 0)


def read_tail(path):
    with open(path, "rb") as stream:
        stream.seek(max(path.stat().st_size - MOST_OUTPUT_BYTES, 0))
        return stream.read().decode("utf-8", "replace")


def run_as_scene(arguments, cwd, name, limit_seconds):
    """Everything model-written runs here, under a uid that cannot open this process's descriptors in /proc."""
    output_path, error_path = JOB_ROOM / f"{name}.out", JOB_ROOM / f"{name}.err"
    with open(output_path, "wb") as output, open(error_path, "wb") as error:
        try:
            done = subprocess.run(arguments, cwd=cwd, env=SCENE_ENV, stdin=subprocess.DEVNULL, stdout=output, stderr=error, user=SCENE_UID, group=SCENE_GID, extra_groups=[], timeout=limit_seconds)
        finally:
            end_scene_processes()
    return done.returncode, read_tail(output_path), read_tail(error_path)


def read_scene_file(path, most_bytes):
    """The scene owns its folder, so a name there can be a link to anything this process could read."""
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > most_bytes:
            raise SceneFileRefused(f"{path.name} is not a file the worker can send")
        return stream.read(most_bytes + 1)


def build_source(job, theme, code):
    prelude = (WORKER / "prelude.py").read_text()
    head = prelude.replace("__MOMENTS__", repr(job["moments"])).replace("__DURATION__", repr(job["durationSeconds"])).replace("__THEME__", theme).replace("__VALUES__", repr(job.get("values", {})))
    truth = (WORKER / "astra_truth.py").read_text() if any(name in code for name in TRUTH_NAMES) else ""
    body = code.replace("from astra_truth import *", "").replace("import astra_truth", "")
    return head + "\n" + truth + "\n" + body + "\n", head.count("\n") + 1 + truth.count("\n")


def describe_failure(stderr, code, head_lines):
    lines = stderr.strip().splitlines()
    shown = []
    for line in lines:
        found = SCENE_LINE.search(line)
        if found:
            number = int(found.group(1)) - head_lines
            source = code.splitlines()
            if 0 < number <= len(source):
                shown.append(f"line {number}: {source[number - 1].strip()}")
    return (" | ".join(shown[-3:]) + " | " + (lines[-1] if lines else "failed"))[:MOST_ERROR_CHARACTERS]


def get_timing_problems(job, made):
    reasons = []
    unused = [moment for moment in job["moments"] if moment not in made["fired"]]
    late = {moment: seconds for moment, seconds in made["late"].items() if seconds > LATEST_MOMENT_SECONDS}
    if unused:
        reasons.append(f"moments never used: {unused}")
    if late:
        reasons.append(f"moments reached late, in seconds: {late}. Shorten the animations before them.")
    if made["seconds"] > job["durationSeconds"] + DURATION_SLACK_SECONDS:
        reasons.append(f"scene ran {made['seconds']} s, longer than {job['durationSeconds']} s")
    if made["seconds"] < job["durationSeconds"] - DURATION_SLACK_SECONDS:
        reasons.append(f"scene ended at {made['seconds']} s, before {job['durationSeconds']} s. Call self.finish() last.")
    return reasons


def write_source(job, theme, code):
    source, head_lines = build_source(job, theme, code)
    source_path = JOB_ROOM / f"scene-{theme}.py"
    source_path.write_text(source)
    return source_path, head_lines


def make_theme(job, theme, code):
    source_path, head_lines = write_source(job, theme, code)
    take_path = SCENE_ROOM / f"{theme}.take"
    returncode, output, error = run_as_scene([sys.executable, str(WORKER / "make_take.py"), str(source_path), str(take_path)], SCENE_ROOM, f"make-{theme}", job["stepLimitSeconds"])
    if returncode != 0:
        return None, [f"the scene ended with {returncode}: {describe_failure(error, code, head_lines)}"]
    made = json.loads(output.strip().splitlines()[-1])
    problems = get_timing_problems(job, made)
    if problems:
        return None, problems
    send_record({"kind": "take", "theme": theme, "made": {name: made[name] for name in ("makeMs", "seconds", "parts")}}, read_scene_file(take_path, job["mostTakeBytes"]))
    return made, []


def read_layout_report(output):
    problems = [found.group(1).strip() for found in map(LAYOUT_PROBLEM.match, output.splitlines()) if found]
    notes = [found.group(1).strip() for found in map(LAYOUT_NOTE.match, output.splitlines()) if found]
    return problems, notes


def inspect_theme(job, theme, code):
    source_path, _ = write_source(job, theme, code)
    sheet_prefix = SCENE_ROOM / f"{theme}-sheet"
    times = ",".join(f"{seconds:.3f}" for seconds in job["inspectSeconds"]) + ",end"
    returncode, output, error = run_as_scene(["manimgx", "inspect", str(source_path), "Lesson", "-o", f"{sheet_prefix}.png", "-t", times], SCENE_ROOM, f"inspect-{theme}", job["stepLimitSeconds"])
    sheets = sorted(SCENE_ROOM.glob(f"{theme}-sheet*.png"), key=lambda path: (len(path.name), path.name))[:MOST_SHEETS_A_THEME]
    if not sheets:
        send_record({"kind": "failed", "stage": "inspect", "reasons": [f"inspect ended with {returncode}: {(error or output)[-MOST_ERROR_CHARACTERS:]}"]})
        return False
    problems, notes = read_layout_report(output)
    send_record({"kind": "layout", "problems": problems, "notes": notes})
    for index, sheet in enumerate(sheets):
        send_record({"kind": "sheet", "theme": theme, "index": index}, read_scene_file(sheet, MOST_SHEET_BYTES))
    return True


def run(job):
    code = job["code"]
    gate = check_scene_code(code, job.get("values"))
    send_record({"kind": "gate", **gate})
    if not gate["ok"]:
        return
    JOB_ROOM.mkdir()
    for theme in job["themes"]:
        made, reasons = make_theme(job, theme, code)
        if made is None:
            send_record({"kind": "failed", "stage": "make", "reasons": reasons})
            return
    if job.get("inspectSeconds"):
        for theme in job["themes"]:
            if not inspect_theme(job, theme, code):
                return
    send_record({"kind": "done"})


def stop_at_the_limit(_signal, _frame):
    raise subprocess.TimeoutExpired("job", 0)


def main():
    signal.signal(signal.SIGALRM, stop_at_the_limit)
    try:
        job = json.load(sys.stdin)
        signal.alarm(job["wholeLimitSeconds"])
        run(job)
    except subprocess.TimeoutExpired:
        send_record({"kind": "failed", "stage": "time", "reasons": ["the scene took too long to make"]})
    except (SceneFileRefused, OSError, ValueError, KeyError, IndexError, TypeError) as error:
        send_record({"kind": "failed", "stage": "worker", "reasons": [str(error)[:MOST_ERROR_CHARACTERS]]})


if __name__ == "__main__":
    main()
