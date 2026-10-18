import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Dedicated clean-code-only public repository: ALWAYS private D1/R2 gallery.
// No legacy public JSON/image fallback can be built from this repository.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  if (env.VITE_PRIVATE_GALLERY_READY !== 'true') {
    throw new Error('PRIVATE_ONLY_BUILD_REQUIRED: VITE_PRIVATE_GALLERY_READY=true');
  }
  return {
    plugins: [react()],
    base: '/pikmin-MinMay/',
    publicDir: false,
    build: { emptyOutDir: true },
  };
});
