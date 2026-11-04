import json
import os
import pathlib
import re
import struct
import subprocess
import sys
import tempfile

WORKER = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(WORKER))
from gate import check_scene_code  # noqa: E402

LATEST_MOMENT_SECONDS = 0.35
DURATION_SLACK_SECONDS = 1.0
TRUTH_NAMES = ("moon_orbit", "seasons(", "astra_truth")
LAYOUT_PROBLEM = re.compile(r"^\s*\[\d+\]\s*(.+)$")
LAYOUT_NOTE = re.compile(r"^\s*note:\s*(.+)$")
SCENE_LINE = re.compile(r'scene\.py", line (\d+)')
MOST_ERROR_CHARACTERS = 600


def take_stdout_for_records():
    """Keeps the real stdout for records, so anything else that prints lands on stderr."""
    stream = os.fdopen(os.dup(1), "wb", buffering=0)
    os.dup2(2, 1)
    return stream


record_stream = take_stdout_for_records()


def send_record(header, payload=b""):
    head = json.dumps({**header, "bytes": len(payload)}).encode()
    record_stream.write(struct.pack(">I", len(head)) + head + payload)


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


def make_theme(job, theme, code, folder):
    source, head_lines = build_source(job, theme, code)
    source_path = folder / f"scene-{theme}.py"
    take_path = folder / f"{theme}.take"
    source_path.write_text(source)
    done = subprocess.run([sys.executable, str(WORKER / "make_take.py"), str(source_path), str(take_path)], capture_output=True, text=True, timeout=job["stepLimitSeconds"])
    if done.returncode != 0:
        return None, [describe_failure(done.stderr, code, head_lines)]
    made = json.loads(done.stdout.strip().splitlines()[-1])
    problems = get_timing_problems(job, made)
    if problems:
        return None, problems
    send_record({"kind": "take", "theme": theme, "made": made}, take_path.read_bytes())
    take_path.unlink()
    return made, []


def read_layout_report(output):
    problems = [found.group(1).strip() for found in map(LAYOUT_PROBLEM.match, output.splitlines()) if found]
    notes = [found.group(1).strip() for found in map(LAYOUT_NOTE.match, output.splitlines()) if found]
    return problems, notes


def inspect_scene(job, code, folder):
    source, _ = build_source(job, job["themes"][0], code)
    (folder / "scene.py").write_text(source)
    times = ",".join(f"{seconds:.3f}" for seconds in job["inspectSeconds"]) + ",end"
    done = subprocess.run(["manimgx", "inspect", "scene.py", "Lesson", "-o", "sheet.png", "-t", times], cwd=folder, capture_output=True, text=True, timeout=job["stepLimitSeconds"])
    sheets = sorted(folder.glob("sheet*.png"), key=lambda path: (len(path.name), path.name))
    if not sheets:
        send_record({"kind": "failed", "stage": "inspect", "reasons": [(done.stderr or done.stdout)[-MOST_ERROR_CHARACTERS:]]})
        return
    problems, notes = read_layout_report(done.stdout)
    send_record({"kind": "layout", "problems": problems, "notes": notes})
    for index, sheet in enumerate(sheets):
        send_record({"kind": "sheet", "index": index}, sheet.read_bytes())


def run(job):
    code = job["code"]
    gate = check_scene_code(code, job.get("values"))
    send_record({"kind": "gate", **gate})
    if not gate["ok"]:
        return
    with tempfile.TemporaryDirectory(dir="/tmp") as folder_name:
        folder = pathlib.Path(folder_name)
        for theme in job["themes"]:
            made, reasons = make_theme(job, theme, code, folder)
            if made is None:
                send_record({"kind": "failed", "stage": "make", "reasons": reasons})
                return
        if job.get("inspectSeconds"):
            inspect_scene(job, code, folder)
    send_record({"kind": "done"})


try:
    run(json.load(sys.stdin))
except subprocess.TimeoutExpired:
    send_record({"kind": "failed", "stage": "time", "reasons": ["the scene took too long to make"]})
