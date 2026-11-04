"""Writes every wheel's hash for Linux on both architectures into requirements.lock. Run it after changing a version, then rebuild the image."""
import json
import pathlib
import re
import urllib.request

LOCK = pathlib.Path(__file__).resolve().parent / "requirements.lock"
FITS = re.compile(r"(-py3-none-any|-py2\.py3-none-any|-(cp314|abi3|py3)-[^-]*-[^-]*(manylinux|musllinux)[^-]*(x86_64|aarch64))\.whl$|-cp3\d+-abi3-[^-]*(x86_64|aarch64)\.whl$")


def get_hashes(name, version):
    with urllib.request.urlopen(f"https://pypi.org/pypi/{name}/{version}/json") as reply:
        files = json.load(reply)["urls"]
    return sorted(file["digests"]["sha256"] for file in files if FITS.search(file["filename"]))


def main():
    lines = []
    for entry in re.split(r"\n(?=\S)", LOCK.read_text().strip()):
        name, version = re.match(r"(\S+)==([^\s\\]+)", entry).groups()
        hashes = get_hashes(name, version)
        if not hashes:
            raise SystemExit(f"{name} {version} has no wheel for this image")
        lines.append(f"{name}=={version} \\\n" + " \\\n".join(f"    --hash=sha256:{value}" for value in hashes))
    LOCK.write_text("\n".join(lines) + "\n")


main()
