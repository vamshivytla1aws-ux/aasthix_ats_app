module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts}",
  ],
  theme: {
    extend: {
      colors: {
        ats: {
          page: "var(--ats-bg-page)",
          elevated: "var(--ats-bg-elevated)",
          border: "var(--ats-border)",
          primary: "var(--ats-primary)",
          accent: "var(--ats-accent)",
        },
      },
      boxShadow: {
        ats: "var(--ats-shadow-md)",
        "ats-sm": "var(--ats-shadow-sm)",
        "ats-ring": "var(--ats-shadow-ring)",
      },
      transitionTimingFunction: {
        "ats-out": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

