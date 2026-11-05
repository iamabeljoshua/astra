const PRESET_TEXTURES: Record<string, string[]> = {
  mercury: ['2k_mercury'],
  venus: ['2k_venus_atmosphere'],
  earth: ['2k_earth_daymap', '2k_earth_nightmap', '2k_earth_clouds'],
  moon: ['2k_moon'],
  mars: ['2k_mars'],
  jupiter: ['2k_jupiter'],
  saturn: ['2k_saturn', '2k_saturn_ring_alpha'],
  uranus: ['2k_uranus'],
  neptune: ['2k_neptune'],
};

const SKY_TEXTURE = '2k_stars_milky_way';

export function getNeededTextures(code: string): string[] {
  const used = Object.entries(PRESET_TEXTURES).filter(([preset]) => new RegExp(`['"\`]${preset}['"\`]`).test(code));
  return [SKY_TEXTURE, ...used.flatMap(([, names]) => names)];
}
