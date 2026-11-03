# Credits

## Fonts

The web app serves these fonts itself from `apps/web/public/fonts/`, so student browsers make no call to a font service. Both fonts use the SIL Open Font License 1.1, and the license text sits beside the font files.

| Font | Used for | Copyright | License file |
| --- | --- | --- | --- |
| [Barlow](https://github.com/jpt/barlow) | The interface | Copyright 2017 The Barlow Project Authors | `apps/web/public/fonts/OFL-Barlow.txt` |
| [Newsreader](https://github.com/productiontype/Newsreader) | The tutor's words and the home greeting | Copyright 2020 The Newsreader Project Authors | `apps/web/public/fonts/OFL-Newsreader.txt` |

The files come from the `@fontsource/barlow` and `@fontsource-variable/newsreader` packages, version 5.3.0. We ship the Latin, Latin Extended, and Vietnamese subsets. The Vietnamese subset also holds letters that Yoruba and Igbo names use, such as Ọ and Ẹ. A browser downloads a subset when the page uses a character in that subset's `unicode-range`. Neither font has Ṣ, ṣ, Ṅ, ṅ, Ǹ, or ǹ. The Latin Extended range still lists them, so a name with one of these letters downloads that file, finds no such letter in it, and shows the letter in a system font.
