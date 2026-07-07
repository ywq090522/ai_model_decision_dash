/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f6f7f8",
        surface: "#ffffff",
        surface2: "#f1f4f5",
        ink: "#111827",
        ink2: "#3f4a56",
        muted: "#6b7280",
        line: "#dce2e7",
        accent: "#0f766e",
        "accent-deep": "#115e59",
        "accent-wash": "#e7f4f2",
        audit: "#b45309",
        "audit-deep": "#92400e",
        "audit-wash": "#fff7ed",
        good: "#218b4d",
        critical: "#ba3c3c",
      },
      fontFamily: {
        display: ["Inter", "system-ui", "-apple-system", "Segoe UI", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
