# Credits

## Fonts

The web app serves these fonts itself from `apps/web/public/fonts/`, so student browsers make no call to a font service. Both fonts use the SIL Open Font License 1.1, and the license text sits beside the font files.

| Font | Used for | Copyright | License file |
| --- | --- | --- | --- |
| [Barlow](https://github.com/jpt/barlow) | The interface | Copyright 2017 The Barlow Project Authors | `apps/web/public/fonts/OFL-Barlow.txt` |
| [Newsreader](https://github.com/productiontype/Newsreader) | The tutor's words and the home greeting | Copyright 2020 The Newsreader Project Authors | `apps/web/public/fonts/OFL-Newsreader.txt` |

The files come from the `@fontsource/barlow` and `@fontsource-variable/newsreader` packages, version 5.3.0. We ship the Latin, Latin Extended, and Vietnamese subsets. The Vietnamese subset also holds letters that Yoruba and Igbo names use, such as Ọ and Ẹ. A browser downloads a subset when the page uses a character in that subset's `unicode-range`. Neither font has Ṣ, ṣ, Ṅ, ṅ, Ǹ, or ǹ. The Latin Extended range still lists them, so a name with one of these letters downloads that file, finds no such letter in it, and shows the letter in a system font.

## Pictures on cards

Each file is in `apps/web/public/picks/`, cropped to a square and resized to 240 pixels. Every picture a student sees is public domain or our own, and no game, film, or team images appear (PRD Q16). Add a row here when you add a picture.

The prototype's wave is a different image, a Commons scan of a reprint made between 1926 and 1989, so the app uses the Met's impression of the original print.

| File | Work | Source | Status |
| --- | --- | --- | --- |
| `wave.jpg` | Katsushika Hokusai, *Under the Wave off Kanagawa*, about 1830 to 1832 | [The Metropolitan Museum of Art, JP1847](https://www.metmuseum.org/art/collection/search/45434), [image file](https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg) | Public domain. The Met's Open Access record sets `isPublicDomain` to true. |
| `saturn.jpg` | *The Day the Earth Smiled*, taken by the Cassini spacecraft on 19 July 2013. Credit NASA/JPL-Caltech/SSI. | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:The_Day_the_Earth_Smiled_-_PIA17172.jpg), from [NASA Photojournal, PIA17172](https://photojournal.jpl.nasa.gov/catalog/PIA17172) | NASA content has no copyright in the United States. NASA asks for credit, and its images must not imply that NASA endorses a product. |
| `athens.jpg` | Raphael, *The School of Athens*, 1509 to 1511 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%22The_School_of_Athens%22_by_Raffaello_Sanzio_da_Urbino.jpg), stitched there from vatican.va | Public Domain Mark 1.0 on Commons. The painter died in 1520. Commons notes that some countries may restrict reuse of a photograph of an old work, and the Vatican Museums' terms forbid reproducing images from their site. Abel chose to keep it and accept that risk on 3 November 2026. |

## Our own drawings

We made these drawings for this product, and they are in `apps/web/src/home/drawings.tsx`: `arc`, `forces`, `growth`, and `helix`.
