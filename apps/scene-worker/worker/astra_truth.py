_PHASE_DEG = {"new": 0.0, "waxing-crescent": 45.0, "first-quarter": 90.0, "waxing-gibbous": 135.0, "full": 180.0, "waning-gibbous": 225.0, "last-quarter": 270.0, "waning-crescent": 315.0}
_PHASE_NAMES = [(22.5, "New moon"), (67.5, "Waxing crescent"), (112.5, "First quarter"), (157.5, "Waxing gibbous"), (202.5, "Full moon"), (247.5, "Waning gibbous"), (292.5, "Last quarter"), (337.5, "Waning crescent"), (360.1, "New moon")]
_SEASON_DEG = {"march-equinox": 0.0, "june-solstice": 90.0, "september-equinox": 180.0, "december-solstice": 270.0}
_FULL_TURN = 360.0
_LONE_KEY_SPAN_SECONDS = 10.0
_LONE_KEY_SPAN_DEG = 120.0


def _interpolate(t, keys):
    if t <= keys[0][0]:
        return keys[0][1] - (keys[0][0] - t) * (keys[1][1] - keys[0][1]) / max(keys[1][0] - keys[0][0], 1e-6)
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * (t - t0) / max(t1 - t0, 1e-6)
    (t0, v0), (t1, v1) = keys[-2], keys[-1]
    return v1 + (t - t1) * (v1 - v0) / max(t1 - t0, 1e-6)


def _keys_from_moments(named, degrees):
    keys, last = [], None
    for moment, name in sorted(named.items(), key=lambda item: T[item[0]]):
        angle = degrees[name]
        if last is not None:
            while angle <= last:
                angle += _FULL_TURN
        keys.append((T[moment], angle))
        last = angle
    if len(keys) == 1:
        keys.append((keys[0][0] + _LONE_KEY_SPAN_SECONDS, keys[0][1] + _LONE_KEY_SPAN_DEG))
    return keys


class MoonOrbit:
    def __init__(self, scene, moon, earth, radius, sun_dir, phases):
        self.scene, self.earth, self.radius = scene, earth, radius
        self.sun = scene.sun_from(sun_dir)
        self.az = math.atan2(self.sun[1], self.sun[0])
        self.keys = _keys_from_moments(phases, _PHASE_DEG)
        moon.add_updater(lambda o: o.move_to(self.position(scene.time)))
        moon.move_to(self.position(0))

    def angle(self, t):
        return _interpolate(t, self.keys)

    def position(self, t):
        a = math.radians(self.angle(t)) + self.az
        return self.earth.get_center() + self.radius * np.array([math.cos(a), math.sin(a), 0.0])

    def lit_fraction(self, t):
        return (1 - math.cos(math.radians(self.angle(t)))) / 2

    def phase_name(self, t):
        d = self.angle(t) % _FULL_TURN
        return next(name for limit, name in _PHASE_NAMES if d < limit)

    def view(self, radius=0.8, lit=None, dark=None):
        return moon_view(self, radius, lit, dark)


def moon_orbit(scene, moon, earth, radius, sun_dir, phases):
    return MoonOrbit(scene, moon, earth, radius, sun_dir, phases)


def _disk_outline(angle_deg, radius):
    # The Moon's lit part: a half circle plus the terminator's half ellipse, lit limb on the right while waxing, seen from the north.
    a = math.radians(angle_deg % _FULL_TURN)
    side = 1.0 if (angle_deg % _FULL_TURN) <= _FULL_TURN / 2 else -1.0
    limb = [np.array([side * radius * math.cos(u), radius * math.sin(u), 0.0]) for u in np.linspace(-math.pi / 2, math.pi / 2, 40)]
    terminator = [np.array([side * radius * math.cos(a) * math.cos(u), radius * math.sin(u), 0.0]) for u in np.linspace(math.pi / 2, -math.pi / 2, 40)]
    return limb + terminator


def moon_view(orbit, radius=0.8, lit=None, dark=None):
    lit_color, dark_color = lit if lit is not None else C.gold, dark if dark is not None else C.line
    disk = m.Circle(radius=radius, color=C.ink2, stroke_width=2).set_fill(dark_color, opacity=1)
    bright = m.Polygon(*_disk_outline(orbit.angle(0), radius), stroke_width=0).set_fill(lit_color, opacity=1)

    def redraw(shape):
        center = disk.get_center()
        shape.become(m.Polygon(*[point + center for point in _disk_outline(orbit.angle(orbit.scene.time), radius)], stroke_width=0).set_fill(lit_color, opacity=1))

    bright.add_updater(redraw)
    return m.VGroup(disk, bright)


class Seasons:
    def __init__(self, scene, earth, sun, radius, tilt_deg, moments):
        self.scene, self.sun, self.radius, self.tilt_deg = scene, sun, radius, tilt_deg
        self.keys = _keys_from_moments(moments, _SEASON_DEG)
        # At the June solstice the Sun lies toward -y from Earth, and the north pole leans that way all year.
        tilt = math.radians(tilt_deg)
        self.axis = np.array([0.0, -math.sin(tilt), math.cos(tilt)])
        earth.add_updater(lambda o: o.move_to(self.position(scene.time)))
        earth.move_to(self.position(0))

    def angle(self, t):
        return _interpolate(t, self.keys)

    def position(self, t):
        a = math.radians(self.angle(t))
        return self.sun.get_center() + self.radius * np.array([math.cos(a), math.sin(a), 0.0])

    def subsolar_lat(self, t):
        to_sun = self.sun.get_center() - self.position(t)
        to_sun = to_sun / np.linalg.norm(to_sun)
        return math.degrees(math.asin(float(np.dot(to_sun, self.axis))))

    def north_leans_to_sun(self, t):
        return self.subsolar_lat(t) > 0

    def season(self, t, hemisphere="north"):
        d = self.angle(t) % _FULL_TURN
        north = "Spring" if d < 45 or d >= 315 else "Summer" if d < 135 else "Autumn" if d < 225 else "Winter"
        return north if hemisphere == "north" else {"Spring": "Autumn", "Summer": "Winter", "Autumn": "Spring", "Winter": "Summer"}[north]

    def axis_line(self, length=1.6, color=None):
        line = m.Line3D(-self.axis * length / 2, self.axis * length / 2, color=color if color is not None else C.ink)
        line.add_updater(lambda o: o.move_to(self.position(self.scene.time)))
        return line


def seasons(scene, earth, sun, radius, tilt_deg=23.44, moments=None):
    return Seasons(scene, earth, sun, radius, tilt_deg, moments)
