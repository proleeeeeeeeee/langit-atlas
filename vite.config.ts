import { defineConfig } from 'vite';

export default defineConfig(({mode}) => ({
  base: './',
  build: {
    target: 'es2022', modulePreload: false,
    rolldownOptions: mode === 'offline' ? {output:{codeSplitting:false}} : {}
  }
}));
