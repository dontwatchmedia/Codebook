import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Native build outputs can be locked by the Windows linker.
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/.tools/**",
        "**/.cache/**",
        "**/release/**",
        "**/test-results/**",
      ],
    },
  },
  clearScreen: false,
});
