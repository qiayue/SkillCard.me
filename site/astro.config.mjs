import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://skillcard.me',
  output: 'static',
  build: {
    format: 'directory',
  },
});
