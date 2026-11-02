# Credits

## Fonts

The web app serves these fonts itself from `apps/web/public/fonts/`, so student browsers make no call to a font service. Both fonts use the SIL Open Font License 1.1, and the license text sits beside the font files.

| Font | Used for | Copyright | License file |
| --- | --- | --- | --- |
| [Barlow](https://github.com/jpt/barlow) | The interface | Copyright 2017 The Barlow Project Authors | `apps/web/public/fonts/OFL-Barlow.txt` |
| [Newsreader](https://github.com/productiontype/Newsreader) | The tutor's words and the home greeting | Copyright 2020 The Newsreader Project Authors | `apps/web/public/fonts/OFL-Newsreader.txt` |

The files come from the `@fontsource/barlow` and `@fontsource-variable/newsreader` packages, version 5.3.0. We ship the Latin, Latin Extended, and Vietnamese subsets. The Vietnamese subset also holds letters that Yoruba and Igbo names use, such as Ọ and Ẹ. A browser downloads a subset only when the page uses a letter from it. Neither font has the letter Ṣ, so a name with it shows that letter in a system font.
