/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f4f4f1",
        surface: "#fcfcfb",
        ink: "#17181a",
        ink2: "#52514e",
        muted: "#898781",
        line: "#e1e0d9",
        accent: "#2a78d6",
        "accent-deep": "#1c5cab",
        "accent-wash": "#e8f1fc",
        good: "#0ca30c",
        critical: "#d03b3b",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
