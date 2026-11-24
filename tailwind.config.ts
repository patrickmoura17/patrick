import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Inter Variable'", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          950: "#0f1216",
          900: "#161a20",
          800: "#1f252d",
          700: "#2b323c",
          600: "#3b4450",
        },
        stone: {
          50: "#faf9f7",
          100: "#f4f2ee",
          150: "#ece9e3",
          200: "#e3dfd7",
          300: "#cfc9be",
          400: "#a8a093",
          500: "#857d70",
          600: "#675f54",
          700: "#4d473f",
          800: "#35312c",
          900: "#211f1c",
        },
        brass: {
          50: "#faf6ee",
          100: "#f2e9d6",
          200: "#e5d2ad",
          300: "#d4b67f",
          400: "#c39e5d",
          500: "#b08a48",
          600: "#946f39",
          700: "#755631",
          800: "#5c442b",
        },
        slateblue: {
          50: "#f1f5f8",
          100: "#dfe8ef",
          400: "#6f8fa8",
          500: "#4f7190",
          600: "#3e5a74",
          700: "#33495d",
        },
        sage: { 50: "#f1f6f2", 100: "#dcebdf", 500: "#4f8a5e", 600: "#3f7150", 700: "#335a41" },
        clay: { 50: "#fbf1ee", 100: "#f6ddd5", 500: "#c0583d", 600: "#a24630", 700: "#813828" },
        amberx: { 50: "#fdf6e9", 100: "#f9e6c3", 500: "#d08a16", 600: "#ad700f" },
      },
      boxShadow: {
        card: "0 1px 2px rgba(22,26,32,.04), 0 1px 3px rgba(22,26,32,.06)",
        pop: "0 12px 32px -8px rgba(22,26,32,.22), 0 2px 6px rgba(22,26,32,.08)",
      },
      borderRadius: { xl: "0.875rem" },
    },
  },
  plugins: [],
};
export default config;
