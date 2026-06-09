import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [glsl()],
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']
  },
  server: {
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true }
    }
  }
});
