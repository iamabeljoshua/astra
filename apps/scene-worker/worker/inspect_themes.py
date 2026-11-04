import pathlib
import sys

import typer
from manimgx.cli.export import inspect

times, *sources_and_sheets = sys.argv[1:]
for source, sheet in zip(sources_and_sheets[::2], sources_and_sheets[1::2]):
    try:
        inspect(pathlib.Path(source), "Lesson", [times], pathlib.Path(sheet))
    except typer.Exit:
        pass
