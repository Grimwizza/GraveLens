import type { Config } from "tailwindcss";

// Theme values live in src/app/globals.css @theme block (Tailwind v4).
// This file only exists for editor tooling / IDE autocomplete.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
};

export default config;
