/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Misale brand palette — Ethiopian gold on near-black
        brand: {
          gold:      "#C9933A",
          "gold-lt": "#D4A843",
          bg:        "#0D0C0B",
          surface:   "#1A1917",
          "surface2":"#242220",
          text:      "#F5F0E8",
          muted:     "#7A7066",
          border:    "#2E2B28",
          success:   "#4CAF72",
          error:     "#E05A5A",
        },
      },
      fontFamily: {
        serif:    ["NotoSerifEthiopic_400Regular"],
        "serif-b":["NotoSerifEthiopic_700Bold"],
        sans:     ["System"],
      },
    },
  },
  plugins: [],
};
