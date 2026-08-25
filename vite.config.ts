import { defineConfig } from 'vite';
import path from 'path';

/**
 * Build configuration for the Obsidian plugin.
 *
 * Produces dist/{main.js, styles.css}; manifest.json is copied by an npm
 * script. Those three files are the whole plugin — drop them into
 * <vault>/.obsidian/plugins/ribbon-groups/ and it runs.
 *
 * No React, no icon library: Obsidian's own Setting API and plain DOM cover the
 * settings pane, and the shipped artefact should be small enough that nobody
 * hesitates over installing it.
 */
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/main.ts'),
      name: 'RibbonGroups',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    outDir: 'dist',
    target: 'es2020',
    emptyOutDir: true,
    rollupOptions: {
      external: ['obsidian', 'electron'],
      output: {
        entryFileNames: 'main.js',
        // Obsidian only loads a stylesheet named styles.css
        assetFileNames: 'styles.css',
      },
    },
  },
});
