"""The first line against a scene's code. It refuses what the code may not use and reads its declared values. The container is the real wall."""
import ast

ALLOWED_IMPORTS = {"math", "numpy", "manimgx", "itertools", "functools", "dataclasses", "typing", "collections", "astra_truth"}
BANNED_NAMES = {"open", "exec", "eval", "compile", "__import__", "globals", "locals", "getattr", "setattr", "delattr", "input", "breakpoint", "vars", "dir", "memoryview", "print"}
MOST_REASONS = 5
LESSON_CLASS = "Lesson"
VALUE_FUNCTION = "value"


def _read_number(node):
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        inner = _read_number(node.operand)
        return None if inner is None else -inner
    if isinstance(node, ast.Constant) and type(node.value) in (int, float):
        return float(node.value)
    return None


def _read_declaration(call):
    """A declared value is value('name', default, lo=.., hi=..) with every argument written out."""
    fields = {keyword.arg: _read_number(keyword.value) for keyword in call.keywords}
    name = call.args[0].value if call.args and isinstance(call.args[0], ast.Constant) and isinstance(call.args[0].value, str) else None
    default = _read_number(call.args[1]) if len(call.args) == 2 else None
    lo, hi = fields.get("lo"), fields.get("hi")
    if name is None or default is None or lo is None or hi is None or set(fields) != {"lo", "hi"} or not lo <= default <= hi:
        return None
    return {"name": name, "default": default, "lo": lo, "hi": hi}


def _check_node(node, reasons, declared):
    if isinstance(node, ast.Import):
        for alias in node.names:
            if alias.name.split(".")[0] not in ALLOWED_IMPORTS:
                reasons.append(f"import {alias.name} is not allowed")
    elif isinstance(node, ast.ImportFrom):
        if (node.module or "").split(".")[0] not in ALLOWED_IMPORTS:
            reasons.append(f"import from {node.module} is not allowed")
    elif isinstance(node, ast.Name) and node.id in BANNED_NAMES:
        reasons.append(f"{node.id} is not allowed")
    elif isinstance(node, ast.Attribute) and node.attr.startswith("__"):
        reasons.append(f"{node.attr} is not allowed")
    elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == VALUE_FUNCTION:
        declaration = _read_declaration(node)
        if declaration is None:
            reasons.append("value() needs a name, a default, lo, and hi, all written as plain numbers")
        else:
            declared[declaration["name"]] = declaration


def _check_values(values, declared, reasons):
    for name, number in values.items():
        declaration = declared.get(name)
        if declaration is None:
            reasons.append(f"value {name} is not declared by this scene")
        elif not declaration["lo"] <= number <= declaration["hi"]:
            reasons.append(f"value {name} is outside what this scene declares")


def check_scene_code(code, values=None):
    """Returns {"ok", "reasons", "declared"}. Values the scene does not declare are refused here, so nothing about a student can slip in as a new name."""
    try:
        tree = ast.parse(code)
    except (SyntaxError, ValueError) as error:
        return {"ok": False, "reasons": [f"syntax: {error}"], "declared": {}}
    reasons, declared = [], {}
    for node in ast.walk(tree):
        _check_node(node, reasons, declared)
    if LESSON_CLASS not in [node.name for node in tree.body if isinstance(node, ast.ClassDef)]:
        reasons.append("the code must define class Lesson")
    _check_values(values or {}, declared, reasons)
    return {"ok": not reasons, "reasons": reasons[:MOST_REASONS], "declared": declared}
