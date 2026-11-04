import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { IMAGE_ASSETS, type Image } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { createImageItem } from './imageItem';

const PUBLIC_FOLDER = join(process.cwd(), 'public');

const getPictures = (asset: (typeof IMAGE_ASSETS)[number]) => {
  const wrapper = document.createElement('div');
  createImageItem(wrapper, { kind: 'image', id: 'picture', asset, alt: 'A picture' } as Image, {});
  const image = wrapper.querySelector('img') as HTMLImageElement;
  return (image.getAttribute('srcset') ?? '').split(', ').map((choice) => choice.split(' ') as [string, string]);
};

describe('a picture on the board', () => {
  it.each(IMAGE_ASSETS.map((asset) => [asset]))('offers a phone a smaller file of %s', (asset) => {
    const pictures = getPictures(asset);
    expect(pictures.map(([, width]) => Number.parseInt(width, 10)).slice(0, 2)).toEqual([480, 800]);
    for (const [path] of pictures) expect(existsSync(join(PUBLIC_FOLDER, path)), path).toBe(true);
  });
});
