import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves from /EZBrushPlus/; the APK and local builds use relative paths.
export default defineConfig({ base: process.env.PAGES_BASE ?? "./", plugins: [react()] });
