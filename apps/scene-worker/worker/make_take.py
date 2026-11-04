import importlib.util
import json
import sys
import time

source_path, take_path = sys.argv[1], sys.argv[2]
started = time.perf_counter()
spec = importlib.util.spec_from_file_location("scene", source_path)
scene_module = importlib.util.module_from_spec(spec)
sys.modules["scene"] = scene_module
spec.loader.exec_module(scene_module)
written = 0
with open(take_path, "wb") as take_file:
    def send(chunk):
        global written
        written += len(chunk)
        take_file.write(chunk)

    lesson = scene_module.Lesson()
    lesson.render(take=send)
print(json.dumps({"makeMs": round((time.perf_counter() - started) * 1000), "bytes": written, "seconds": round(lesson.time, 3), "fired": lesson.fired, "late": lesson.late, "parts": list(lesson._parts)}))
