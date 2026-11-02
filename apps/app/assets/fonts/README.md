# Reading fonts

These static TTF files ship with the app and work without a network connection.
Interface typography continues to use DM Sans and Lora.
Readers can select Chinese and English fonts independently in Settings → Reading;
the original Noto Serif SC / Source Serif 4 pairing remains the default.

- **Selah Scripture SC Regular** is a renamed subset of **Noto Serif SC Regular**
  (Google / Adobe's Source Han Serif design), covering every Chinese character in
  `packages/content/data/bible.json`, spaces, Latin characters and punctuation.
  License: [OFL-NotoSerifSC.txt](./OFL-NotoSerifSC.txt).
- **Source Serif 4 Regular**, optical size 18, is the unmodified static Google
  Fonts build by Adobe. License: [OFL-SourceSerif4.txt](./OFL-SourceSerif4.txt).
- **Selah Sans SC Regular** is a renamed subset of **Noto Sans SC Regular**
  (Google / Adobe's Source Han Sans design), with the same scripture coverage.
  License: [OFL-NotoSansSC.txt](./OFL-NotoSansSC.txt).
- **Selah WenKai Regular** is a renamed subset of **LXGW WenKai v1.530**,
  a handwritten Chinese face derived from Klee One, with the same coverage.
  Source: https://github.com/lxgw/LxgwWenKai/tree/v1.530
  License: [OFL-LXGWWenKai.txt](./OFL-LXGWWenKai.txt).
- **Lora** and **DM Sans** use the already bundled `@expo-google-fonts` packages;
  their licenses are included in those packages. **System** uses each platform's
  default font. No font is downloaded at runtime.

Pinned download URLs and SHA-256 checksums live in
`tools/assets/prepare-reading-fonts.py`. To regenerate after scripture changes,
install `fonttools` in a disposable Python environment and run that script.
It verifies source checksums and complete Chinese scripture glyph coverage.
Font generation is not required for normal app builds.
