import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    // Ensures assets are fully inlined
    assetsInlineLimit: 100000000, 
  },
});