import { COLOR_PRESETS } from "@/lib/format";

// Fallback map so legacy products (name only, no hex) still render a swatch.
const NAME_HEX: Record<string, string> = {
  red: "#ff0000",
  black: "#000000",
  white: "#ffffff",
  offwhite: "#f5f5f0",
  cream: "#fdf6e3",
  navy: "#000080",
  navyblue: "#000080",
  blue: "#1e6fd9",
  skyblue: "#87ceeb",
  royalblue: "#4169e1",
  green: "#2e8b57",
  darkgreen: "#14532d",
  olive: "#6b6b3a",
  yellow: "#ffd700",
  mustard: "#d6a800",
  orange: "#ff8c00",
  peach: "#f7c9b3",
  pink: "#f4b6c2",
  babypink: "#f9c9d6",
  rani: "#d81b60",
  ranipink: "#d81b60",
  magenta: "#c2185b",
  purple: "#7b1fa2",
  lavender: "#c5b4e3",
  maroon: "#7a1f2b",
  wine: "#722f37",
  brown: "#795548",
  coffee: "#6f4e37",
  beige: "#d8c8a8",
  grey: "#808080",
  gray: "#808080",
  lightgrey: "#c9c9c9",
  darkgrey: "#4a4a4a",
  silver: "#c0c0c0",
  gold: "#d4af37",
  teal: "#008080",
  turquoise: "#40e0d0",
  mint: "#aaf0d1",
  rust: "#b7410e",
  copper: "#b87333",
  multicolor: "#8e8e8e",
};

const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

export const isHex = (v: unknown): v is string =>
  typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());

/** Resolve a display hex for a color name, preferring an explicitly saved hex. */
export function resolveColorHex(name: string, hex?: string | null): string {
  if (isHex(hex)) return normalizeHex(hex);
  const preset = COLOR_PRESETS.find((c) => key(c.name) === key(name || ""));
  if (preset) return normalizeHex(preset.hex);
  const k = key(name || "");
  if (NAME_HEX[k]) return NAME_HEX[k];
  const partial = Object.keys(NAME_HEX).find((n) => k.includes(n));
  return partial ? NAME_HEX[partial] : "#9e9e9e";
}

export function normalizeHex(hex: string): string {
  let h = hex.trim().toLowerCase();
  if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return h;
}

/** Hex -> [r,g,b] for jsPDF fill colors. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(isHex(hex) ? hex : "#9e9e9e").slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export type ColorHexMap = Record<string, string>;

export function safeColorHexMap(value: unknown): ColorHexMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: ColorHexMap = {};
  for (const [name, hex] of Object.entries(value as Record<string, unknown>)) {
    if (isHex(hex)) out[String(name)] = normalizeHex(hex as string);
  }
  return out;
}
