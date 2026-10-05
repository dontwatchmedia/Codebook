# Third-party notices

CodeBook's bundled emoji catalog in `src/data/emoji.json` is derived from
Unicode Emoji 15.1 and the English annotations in Unicode CLDR 44. It contains
3,773 fully qualified emoji, including skin-tone, joined, and flag variants.
English names and keywords are supplemented by CodeBook's writing and project
aliases. The catalog and search operate offline; the operating system supplies
the emoji artwork and determines which glyphs can be displayed.

Sources:

- [Unicode Emoji 15.1 test data](https://unicode.org/Public/emoji/15.1/emoji-test.txt), copyright © 2023 Unicode, Inc.
- [CLDR 44 English annotations](https://github.com/unicode-org/cldr/blob/release-44/common/annotations/en.xml) and [derived annotations](https://github.com/unicode-org/cldr/blob/release-44/common/annotationsDerived/en.xml), copyright © 1991–2023 Unicode, Inc.
- [Unicode CLDR 44 license](https://github.com/unicode-org/cldr/blob/release-44/LICENSE).

The original source versions and SHA-256 hashes are pinned in
`scripts/build-emoji-catalog.mjs`. Run that script from the repository root to
regenerate the catalog. It downloads these development inputs when needed and
verifies their hashes; no downloading occurs while using CodeBook.

The emoji and CLDR data are used under the following license.

## Unicode License V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 2004-2023 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.

## pdf-lib 1.17.1 — MIT License

CodeBook uses pdf-lib to inspect generated PDF documents and read their exact page counts. The following license is reproduced from the installed package's `LICENSE.md`.

MIT License

Copyright (c) 2019 Andrew Dillon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
