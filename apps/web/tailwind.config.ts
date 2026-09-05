import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        page: "#0A0C10",
        surface: {
          DEFAULT: "#12151C",
          dim: "#0A0C10",
          raised: "#12151C",
          card: "#1A1F29",
          border: "#252B37",
          divider: "#252B37",
          hover: "#202633",
        },
        brand: {
          cyan: "#22D3EE",
          "cyan-dim": "rgba(34, 211, 238, 0.12)",
          violet: "#A78BFA",
          "violet-dim": "rgba(167, 139, 250, 0.12)",
        },
        text: {
          primary: "#E8EAED",
          secondary: "#9AA3B2",
          muted: "#6B7280",
        },
        status: {
          success: "#34D399",
          "success-dim": "rgba(52, 211, 153, 0.12)",
          warning: "#FBBF24",
          "warning-dim": "rgba(251, 191, 36, 0.12)",
          error: "#F87171",
          "error-dim": "rgba(248, 113, 113, 0.12)",
          info: "#60A5FA",
          "info-dim": "rgba(96, 165, 250, 0.12)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "'JetBrains Mono'",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        btn: "6px",
        card: "8px",
        chip: "4px",
      },
      maxWidth: {
        content: "1280px",
      },
      spacing: {
        sidebar: "240px",
        "sidebar-collapsed": "72px",
      },
    },
  },
  plugins: [],
};

export default config;
