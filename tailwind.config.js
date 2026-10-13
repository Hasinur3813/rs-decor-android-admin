/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#182230",
        surface: "#263448",
        surface2: "#33445c",
        cardborder: "#e7eaf1",
        gold: "#4263eb",
        goldbright: "#6d83f2",
        ink: "#f8fafc",
        muted: "#aab4c2"
      },
      boxShadow: {
        soft: "0 12px 32px rgba(24,34,48,.12)",
        card: "0 2px 8px rgba(24,34,48,.04)"
      },
      borderRadius: { xl2: "1.1rem" }
    }
  },
  plugins: []
};
