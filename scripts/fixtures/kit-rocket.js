// A rocket lifting off a textured Earth, on the moments of the 2D take of "How a rocket escapes Earth". It proves the player, and the scenes owner's scene replaces it in a real store.
function scene(kit) {
  kit.stage('space', { sky: 0.2, stars: 9000 });
  kit.post.set({ bloom: 0.45, threshold: 1.1, radius: 0.7, exposure: 1.05, vignette: 0.32 });
  kit.sunAt([140, 60, 90]);

  const EARTH_RADIUS = 30;
  const earth = kit.planet({ id: 'earth', preset: 'earth', radius: EARTH_RADIUS, spin: 0.6, spinStart: 240, segments: 128 });
  earth.place([0, -EARTH_RADIUS, 0]);

  const rocket = kit.group({ id: 'rocket' });
  const parts = [
    kit.mesh({ id: 'hull', shape: 'cylinder', radius: 0.42, length: 4.6, material: 'ceramic', color: '#e8e4da' }).place([0, 2.3, 0]),
    kit.mesh({ id: 'nose', shape: 'cone', radius: 0.42, length: 1.2, material: 'ceramic', color: '#d8d2c6' }).place([0, 5.2, 0]),
    kit.mesh({ id: 'band', shape: 'cylinder', radius: 0.43, length: 0.3, material: 'matte', color: '#26262a' }).place([0, 3.8, 0]),
    kit.mesh({ id: 'bell', shape: 'cone', radius: 0.36, length: 0.7, material: 'metal', color: '#6a6660' }).place([0, -0.25, 0]).turn(Math.PI, 0, 0),
  ];
  for (const part of parts) rocket.add(part);
  const flame = kit.glow({ id: 'flame', color: '#ffb468', size: 2.6, intensity: 2.2 });
  const plume = kit.path({ id: 'plume', fn: (u) => [0, -0.6 - 5 * u, 0], color: '#ffc27e', width: 12, glow: 2.2, segments: 30 });
  const gravity = kit.path({ id: 'gravity-arrow', fn: (u) => [1.8, 3 - 4.2 * u, 0], color: '#FFCC94', width: 4, glow: 1.2, head: 1, segments: 12 });

  kit.label('Gravity pulls back', { at: 'hull', show: 'gravity-arrow', hide: 'gauge-starts', side: 'right', sub: 'Weaker with height, never gone' });
  kit.label('Speed left to lose', { at: 'nose', show: 'gauge-starts', hide: 'never-zero', side: 'right' });
  kit.label('Pull never reaches zero', { at: 'earth', show: 'never-zero', side: 'left' });
  kit.title('Not to scale', { place: 'corner', show: 'earth-and-rocket' });

  kit.shots([
    { at: 0, move: 'cut', target: [0, 2.5, 0], distance: 15, azimuth: 24, elevation: 4, fov: 34, orbit: 0.9 },
    { at: 'gravity-arrow', move: 'dollyTo', target: 'rocket', distance: 13, azimuth: 40, elevation: 7, fov: 34, over: 3, orbit: 0.8 },
    { at: 'gauge-starts', move: 'dollyTo', target: 'rocket', distance: 26, azimuth: 66, elevation: 10, fov: 32, over: 3.2, orbit: 0.7 },
    { at: 'gauge-falls', move: 'dollyTo', target: 'rocket', distance: 64, azimuth: 92, elevation: 14, fov: 32, over: 3, orbit: 0.5 },
    { at: 'never-zero', move: 'dollyTo', target: [0, -6, 0], distance: 130, azimuth: 118, elevation: 16, fov: 32, over: 4.4, orbit: 0.5 },
  ]);

  return {
    parts: ['earth', 'rocket', 'gravity-arrow'],
    render(t) {
      const flight = kit.clamp01((t - 1) / (kit.duration - 1));
      const height = 110 * flight * flight;
      rocket.place([0, height, 0]);
      flame.place([0, height - 0.6, 0]);
      plume.place([0, height, 0]);
      gravity.place([0, height, 0]);
      const burning = kit.env(t, 'earth-and-rocket', null, 1);
      flame.intensity(2 * burning);
      plume.show(burning);
      plume.reveal(burning);
      gravity.show(kit.env(t, 'gravity-arrow', 'never-zero', 0.6));
      gravity.reveal(kit.p(t, 'gravity-arrow', 1));
    },
  };
}
