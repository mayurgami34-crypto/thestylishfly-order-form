export const inr = (n: number) =>
  `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const SIZES = [
  "S/M",
  "L",
  "XL",
  "XXL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
  "7XL",
  "9XL",
] as const;
export type Size = (typeof SIZES)[number];

export const COLOR_PRESETS = [
  { name: "Navy", hex: "#1e2a4a" },
  { name: "Black", hex: "#111111" },
  { name: "Maroon", hex: "#7a1f2b" },
  { name: "Peach", hex: "#f7c9b3" },
  { name: "White", hex: "#f5f5f5" },
  { name: "Red", hex: "#c1272d" },
  { name: "Olive", hex: "#6b6b3a" },
  { name: "Beige", hex: "#d8c8a8" },
  { name: "Pink", hex: "#f4b6c2" },
  { name: "Mustard", hex: "#d6a800" },
];