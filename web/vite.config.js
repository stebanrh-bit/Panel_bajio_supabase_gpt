import { defineConfig } from 'vite';

// El archivo de entrega también se genera legible, sin comprimir nombres ni líneas.
// El código de la biblioteca Supabase se incluye junto con el código del panel.
export default defineConfig({
  build: {
    minify: false,
    cssMinify: false,
  },
});
