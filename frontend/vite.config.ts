import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev proxy: the UI talks to the FastAPI backend without CORS friction.
// In production, set VITE_API_BASE to the deployed backend origin instead.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    proxy: {
      "/research": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
});
