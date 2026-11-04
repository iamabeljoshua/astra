import math
import numpy as np
import manimgx as m
from astra_numbers import num, money, percent

T = __MOMENTS__
DURATION = __DURATION__
THEME = "__THEME__"
_VALUES = __VALUES__
_FONTS = ["/worker/fonts"]


class C:
    pass


_TOKENS = {
    "light": dict(paper="#F6F1E6", panel="#EFE8DA", ink="#1B1815", ink2="#5F574C", line="#CFC6B5", accent="#1B1815", blue="#2F6690", red="#A63D2F", green="#4C7A3F", gold="#B07A1E", violet="#6B4E8A"),
    "dark": dict(paper="#000000", panel="#0E0D0B", ink="#FFFBF5", ink2="#A79F92", line="#2B2823", accent="#FFCC94", blue="#7FB2D9", red="#E0806F", green="#8FBF7F", gold="#FFCC94", violet="#B79AD6"),
}
for _name, _color in _TOKENS[THEME].items():
    setattr(C, _name, m.ManimColor(_color))
m.config.background_color = C.panel
# The engine's default is white, which vanishes on the light panel, and axis numbers and readouts use it.
for _kind in (m.Text, m.MathTex, m.DecimalNumber, m.Integer, m.Dot, m.Line):
    _kind.set_default(color=C.ink)
m.config.frame_rate = 60
m.config.pixel_width, m.config.pixel_height = 1280, 720


def value(name, default, lo, hi):
    return float(_VALUES.get(name, default))


def ui(text, size=24, color=None, **kw):
    return m.Text(text, font="Barlow", font_paths=_FONTS, font_size=size, color=color if color is not None else C.ink, **kw)


def voice(text, size=30, color=None, **kw):
    return m.Text(text, font="Newsreader", font_paths=_FONTS, font_size=size, color=color if color is not None else C.ink, **kw)


def formula(tex, size=36, color=None, **kw):
    return m.MathTex(tex, font_size=size, color=color if color is not None else C.ink, **kw)


class _Lesson:
    def setup(self):
        super().setup()
        self._parts = {}
        self.fired = {}
        self.late = {}

    def until(self, moment):
        target = T[moment]
        late = self.time - target
        self.fired[moment] = round(self.time, 3)
        self.late[moment] = round(late, 3)
        if late < -1e-3:
            self.wait(-late)
            self.fired[moment] = round(self.time, 3)

    def part(self, name, mob):
        self._parts[name] = mob
        return mob

    def sun_from(self, direction):
        d = np.array(direction, dtype=float)
        d = d / np.linalg.norm(d)
        self.camera.light_source.move_to(d * 1000.0)
        return d

    def finish(self):
        if self.time < DURATION:
            self.wait(DURATION - self.time)


class Lesson2D(_Lesson, m.Scene):
    pass


class Lesson3D(_Lesson, m.ThreeDScene):
    pass
