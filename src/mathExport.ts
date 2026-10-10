/// <reference types="vite/client" />
import katexCSS from "katex/dist/katex.min.css?raw";
const fonts = import.meta.glob<string>(
  "/node_modules/katex/dist/fonts/*.woff2",
  { query: "?inline", import: "default", eager: true },
);
/** Embed WOFF2 fonts so downloaded HTML and the native PDF work fully offline. */
export const mathExportCSS =
  katexCSS.replace(/src:[^;}]+;?/g, (source) => {
    const name = source.match(/fonts\/([^)'"\s]+\.woff2)/)?.[1];
    const font = name && fonts[`/node_modules/katex/dist/fonts/${name}`];
    return font ? `src:url("${font}") format("woff2");` : source;
  }) +
  `
[data-codebook-math="inline"]{display:inline-block;max-width:100%;vertical-align:baseline}
[data-codebook-math="block"]{display:block;max-width:100%;margin:12px 0;overflow-x:auto;break-inside:avoid}
[data-codebook-math] .katex{color:inherit;white-space:nowrap}
[data-codebook-math] .katex-display{margin:0}
.math-fallback{font-family:Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
@media print{[data-codebook-math="block"]{overflow:visible}}
`;
