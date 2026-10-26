import { defineConfig } from 'vite';

// Root hosting remains the local default; Pages supplies its project subpath.
export default defineConfig({
  base: process.env.DEPLOY_BASE_PATH || '/',
});
