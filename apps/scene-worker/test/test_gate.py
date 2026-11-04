import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "worker"))
from astra_numbers import money, num, percent  # noqa: E402
from gate import check_scene_code  # noqa: E402

LESSON = "class Lesson(Lesson2D):\n    def construct(self):\n        self.finish()\n"


class GateTest(unittest.TestCase):
    def test_a_plain_lesson_passes(self):
        self.assertTrue(check_scene_code(LESSON)["ok"])

    def test_it_refuses_what_a_scene_may_not_reach(self):
        for line in ("import os", "import socket", "from subprocess import run", "open('/etc/passwd')", "x = ().__class__", "eval('1')", "getattr(m, 'x')", "__import__('os')"):
            with self.subTest(line=line):
                self.assertFalse(check_scene_code(f"{line}\n{LESSON}")["ok"])

    def test_it_needs_the_lesson_class(self):
        self.assertFalse(check_scene_code("class Other:\n    pass\n")["ok"])

    def test_bad_syntax_is_a_refusal_and_not_a_crash(self):
        self.assertFalse(check_scene_code("def (:\n")["ok"])
        self.assertFalse(check_scene_code("x = 1\x00")["ok"])


class DeclaredValuesTest(unittest.TestCase):
    DECLARING = f"RATE = value('rate', 0.05, lo=0.01, hi=0.2)\n{LESSON}"

    def test_it_reads_what_a_scene_declares(self):
        self.assertEqual(check_scene_code(self.DECLARING)["declared"]["rate"], {"name": "rate", "default": 0.05, "lo": 0.01, "hi": 0.2})

    def test_it_takes_a_declared_value_inside_its_range(self):
        self.assertTrue(check_scene_code(self.DECLARING, {"rate": 0.1})["ok"])

    def test_it_refuses_an_undeclared_value(self):
        result = check_scene_code(self.DECLARING, {"studentName": 1})
        self.assertFalse(result["ok"])
        self.assertIn("not declared", result["reasons"][0])

    def test_it_refuses_a_value_outside_its_range(self):
        self.assertFalse(check_scene_code(self.DECLARING, {"rate": 9})["ok"])

    def test_it_refuses_a_declaration_it_cannot_read(self):
        self.assertFalse(check_scene_code(f"RATE = value('rate', 1 + 1, lo=0, hi=9)\n{LESSON}")["ok"])
        self.assertFalse(check_scene_code(f"RATE = value(name, 1, lo=0, hi=9)\n{LESSON}")["ok"])


class NumbersTest(unittest.TestCase):
    def test_it_groups_thousands_and_keeps_the_places_it_is_asked_for(self):
        self.assertEqual(num(1234567.891, 2), "1,234,567.89")
        self.assertEqual(num(2.9999999, 2), "3.00")
        self.assertEqual(num(1000000), "1,000,000")

    def test_it_writes_a_true_minus_and_no_negative_zero(self):
        self.assertEqual(num(-4.5, 1), "−4.5")
        self.assertEqual(num(-0.001, 1), "0.0")

    def test_money_and_percent(self):
        self.assertEqual(money(1628.894, 2), "$1,628.89")
        self.assertEqual(money(-20), "−$20")
        self.assertEqual(percent(0.05), "5%")
        self.assertEqual(percent(0.0725, 2), "7.25%")


if __name__ == "__main__":
    unittest.main()
