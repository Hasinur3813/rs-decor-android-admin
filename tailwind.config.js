/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#0c0d12",
        surface: "#151824",
        surface2: "#1d2233",
        cardborder: "#2b3247",
        gold: "#c9a227",
        goldbright: "#e8c547",
        ink: "#f4f1e8",
        muted: "#9aa1b5"
      },
      boxShadow: {
        soft: "0 8px 30px rgba(0,0,0,.25)",
        card: "0 2px 12px rgba(0,0,0,.18)"
      },
      borderRadius: { xl2: "1.1rem" }
    }
  },
  plugins: []
};
