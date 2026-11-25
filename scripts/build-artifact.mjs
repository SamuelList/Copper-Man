// Builds the game as ONE self-contained page for publishing as a Claude artifact:
//   npm run build:artifact   ->   dist-artifact/project-copper.html
//
// An artifact is a single HTML fragment shown in a locked-down frame (no other files, no
// outside network), wrapped by its host in a page skeleton. So the script and styles are
// inlined, there is no <html>/<head>/<body> of our own, and the page sizes itself to the frame
// rather than to the screen (see FRAME_STYLE).
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const outFile = fileURLToPath(new URL('../dist-artifact/project-copper.html', import.meta.url));

const { output } = await build({
  root,
  logLevel: 'warn',
  build: {
    write: false,
    // One script and one stylesheet, so each can be inlined whole.
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});

const scripts = output.filter((o) => o.type === 'chunk');
const styles = output.filter((o) => o.type === 'asset' && o.fileName.endsWith('.css'));
const others = output.filter(
  (o) => o.type === 'asset' && !o.fileName.endsWith('.css') && !o.fileName.endsWith('.html'),
);
if (scripts.length !== 1 || others.length > 0) {
  const names = [...scripts, ...others].map((o) => o.fileName).join(', ');
  throw new Error(`Expected one script and no loose assets to inline, got: ${names}`);
}

/**
 * The host skeleton already pads the page top and bottom by the phone's safe-area insets, and
 * gives the page the frame's height. So here the game fills its parent instead of the screen,
 * and leaves those two insets alone (the sides are still the game's to clear).
 */
const FRAME_STYLE = `
:root { --safe-top: 0px; --safe-bottom: 0px; }
html, body, #root { height: 100%; }
`;

// Inline script text ends at the first "</script", and "<!--" changes how the rest is parsed.
const inlineScript = (code) => code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const inlineStyle = (css) => css.replace(/<\/(style)/gi, '<\\/$1');

const page = `<title>Project Copper</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<style>${styles.map((s) => inlineStyle(String(s.source))).join('\n')}${FRAME_STYLE}</style>
<div id="root"></div>
<script type="module">${inlineScript(scripts[0].code)}</script>
`;

await mkdir(fileURLToPath(new URL('../dist-artifact/', import.meta.url)), { recursive: true });
await writeFile(outFile, page);
console.log(`${outFile}  ${(page.length / 1024).toFixed(0)} kB`);
