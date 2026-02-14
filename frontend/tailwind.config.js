/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0b10",
        foreground: "#f8fafc",
        card: "#15171e",
        "card-foreground": "#f8fafc",
        primary: "#3b82f6",
        "primary-foreground": "#ffffff",
        secondary: "#1e293b",
        "secondary-foreground": "#f8fafc",
        accent: "#0ea5e9",
        "accent-foreground": "#ffffff",
        muted: "#1e293b",
        "muted-foreground": "#94a3b8",
        border: "#27272a",
        input: "#27272a",
        ring: "#3b82f6",
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.25rem",
      },
    },
  },
  plugins: [],
}
