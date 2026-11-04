import { writeStyle } from '@astra/board/drawing';
import type { Image, ImageAsset } from '@astra/contracts';
import type { BoardItem, SliderHandlers } from './boardItems';

const ART_FOLDER = '/board-art';
/** A picture waits unseen this share of its entrance, which keeps one cleared and placed again under 3 flashes a second. */
const UNSEEN_ENTRANCE_SHARE = 0.42;

/** Each file's true size, so a picture holds its place before it has loaded. Credits are in docs/credits.md. */
const ART_SIZES: Record<ImageAsset, { width: number; height: number }> = {
  'great-wave': { width: 1200, height: 806 },
  'school-of-athens': { width: 1200, height: 931 },
  saturn: { width: 1200, height: 467 },
  'storming-of-the-bastille': { width: 1200, height: 856 },
  'death-of-socrates': { width: 1200, height: 799 },
  'great-pyramid': { width: 1200, height: 944 },
  melencolia: { width: 950, height: 1200 },
  sunflowers: { width: 1200, height: 848 },
  earthrise: { width: 1200, height: 1200 },
  'whole-earth': { width: 1200, height: 1200 },
};

// A file the board cannot show becomes its description in words, so a student never sees a broken picture.
export function createImageItem(wrapper: HTMLElement, content: Image, { onImageMissing }: SliderHandlers): BoardItem {
  const asset = 'asset' in content ? content.asset : null;
  const artSize = asset && ART_SIZES[asset];
  const image = artSize ? document.createElement('img') : null;
  let missing: HTMLElement | null = null;
  const showAsMissing = () => {
    image?.remove();
    missing = document.createElement('p');
    missing.className = 'board-image-missing';
    missing.dir = 'auto';
    missing.textContent = content.alt;
    wrapper.append(missing);
    onImageMissing?.(content.id);
  };
  if (image) {
    image.className = 'board-image';
    image.alt = content.alt;
    image.draggable = false;
    image.addEventListener('error', showAsMissing, { once: true });
    image.setAttribute('src', `${ART_FOLDER}/${asset}.jpg`);
    wrapper.append(image);
  } else {
    showAsMissing();
  }
  return {
    get ignoresPlacementScale() {
      return missing === null;
    },
    prepare({ maxWidth }) {
      writeStyle(wrapper, 'maxWidth', `${maxWidth}px`);
      if (missing || !artSize) return { fit: 'line', size: { width: wrapper.offsetWidth, height: wrapper.offsetHeight }, fromSize: null };
      return { fit: 'figure', size: { width: maxWidth, height: (maxWidth * artSize.height) / artSize.width }, fromSize: null };
    },
    paint({ placedSize }) {
      if (!image || missing || !placedSize) return;
      const width = String(Math.round(placedSize.width));
      const height = String(Math.round(placedSize.height));
      if (image.getAttribute('width') !== width) image.setAttribute('width', width);
      if (image.getAttribute('height') !== height) image.setAttribute('height', height);
    },
    getEntranceOpacity: ({ progress }) => Math.max(0, (progress - UNSEEN_ENTRANCE_SHARE) / (1 - UNSEEN_ENTRANCE_SHARE)),
    remove() {
      image?.remove();
      missing?.remove();
    },
  };
}
