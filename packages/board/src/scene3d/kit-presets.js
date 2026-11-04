export const PRESETS = {
  sun: { map: '2k_sun' },
  mercury: { map: '2k_mercury', airless: true },
  venus: { map: '2k_venus_atmosphere', atmosphere: '#e9c88e', atmoPower: 0.9 },
  earth: { map: '2k_earth_daymap', night: '2k_earth_nightmap', clouds: '2k_earth_clouds', atmosphere: '#6aa8ff', tilt: 23.4, ocean: true },
  moon: { map: '2k_moon', airless: true, tilt: 6.7, power: 1.5 },
  mars: { map: '2k_mars', atmosphere: '#e09a68', atmoPower: 0.5, tilt: 25.2 },
  jupiter: { map: '2k_jupiter', atmosphere: '#e8cfa8', atmoPower: 0.35, tilt: 3.1 },
  saturn: { map: '2k_saturn', atmosphere: '#ecd9ae', atmoPower: 0.35, tilt: 26.7, rings: '2k_saturn_ring_alpha' },
  uranus: { map: '2k_uranus', atmosphere: '#a6e4ea', atmoPower: 0.5, tilt: 97.8 },
  neptune: { map: '2k_neptune', atmosphere: '#6f93ff', atmoPower: 0.6, tilt: 28.3 },
};
export const TEXTURES_BY_PRESET = Object.fromEntries(
  Object.entries(PRESETS).map(([k, p]) => [k, [p.map, p.night, p.clouds, p.rings].filter(Boolean)]),
);
