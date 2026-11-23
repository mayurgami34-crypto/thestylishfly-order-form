/** Size-wise pricing helpers: each size can carry its own rate per piece. */

export type SizePriceMap = Record<string, number>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function safeSizePriceMap(value: unknown): SizePriceMap {
  if (!isRecord(value)) return {};
  const out: SizePriceMap = {};
  for (const [size, raw] of Object.entries(value)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) out[String(size)] = n;
  }
  return out;
}

/** Rate for one size, falling back to the product's base price. */
export function sizeRate(size: string, sizePrice: SizePriceMap | undefined | null, basePrice: number) {
  const map = safeSizePriceMap(sizePrice);
  const rate = map[size];
  return Number.isFinite(rate) && rate > 0 ? rate : Math.max(0, Number(basePrice) || 0);
}

type Breakdown = { sizes: Record<string, number> };

/** Pieces + amount for one line, priced size by size. */
export function lineTotals(
  colorBreakdown: Breakdown[] | undefined | null,
  sizePrice: SizePriceMap | undefined | null,
  basePrice: number,
) {
  let pieces = 0;
  let amount = 0;
  for (const cb of Array.isArray(colorBreakdown) ? colorBreakdown : []) {
    for (const [size, qty] of Object.entries(cb?.sizes ?? {})) {
      const q = Math.max(0, Number(qty) || 0);
      if (!q) continue;
      pieces += q;
      amount += q * sizeRate(size, sizePrice, basePrice);
    }
  }
  return { pieces, amount };
}

/** Distinct rates used by a line, for compact "Rate" display. */
export function rateRange(
  colorBreakdown: Breakdown[] | undefined | null,
  sizePrice: SizePriceMap | undefined | null,
  basePrice: number,
) {
  const rates = new Set<number>();
  for (const cb of Array.isArray(colorBreakdown) ? colorBreakdown : []) {
    for (const [size, qty] of Object.entries(cb?.sizes ?? {})) {
      if ((Number(qty) || 0) > 0) rates.add(sizeRate(size, sizePrice, basePrice));
    }
  }
  const list = [...rates].sort((a, b) => a - b);
  if (list.length === 0) return { min: Math.max(0, Number(basePrice) || 0), max: Math.max(0, Number(basePrice) || 0), mixed: false };
  return { min: list[0], max: list[list.length - 1], mixed: list.length > 1 };
}

/** Group sizes that share the same rate: [{ rate, sizes: [...] }] */
export function priceGroups(sizes: string[], sizePrice: SizePriceMap | undefined | null, basePrice: number) {
  const groups = new Map<number, string[]>();
  for (const s of sizes) {
    const r = sizeRate(s, sizePrice, basePrice);
    groups.set(r, [...(groups.get(r) ?? []), s]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, list]) => ({ rate, sizes: list }));
}

/** Rate modes available for the catalog PDF. */
export type RateMode = "standard" | "manual_net" | "discount";

export type RateOptions = {
  mode: RateMode;
  /** Discount percent, used when mode === "discount". */
  discountPct?: number;
};

export type RateSource = {
  price: number;
  sizePrice?: SizePriceMap | null;
  netPrice?: number | null;
  sizeNetPrice?: SizePriceMap | null;
};

const discounted = (v: number, pct: number) => Math.max(0, Math.round(v * (1 - pct / 100)));

/**
 * Resolve the effective base price + size-wise rates for a chosen rate mode.
 * Standard rates and size structures are never mutated — a new map is returned.
 */
export function applyRateMode(src: RateSource, opts: RateOptions): { price: number; sizePrice: SizePriceMap } {
  const base = Math.max(0, Number(src.price) || 0);
  const sizes = safeSizePriceMap(src.sizePrice);

  if (opts.mode === "manual_net") {
    const net = Math.max(0, Number(src.netPrice) || 0);
    const sizeNet = safeSizePriceMap(src.sizeNetPrice);
    const price = net > 0 ? net : base;
    const out: SizePriceMap = {};
    for (const [size, rate] of Object.entries(sizes)) out[size] = rate;
    for (const [size, rate] of Object.entries(sizeNet)) out[size] = rate;
    // Sizes with a standard rate but no net rate keep their standard rate.
    return { price, sizePrice: out };
  }

  if (opts.mode === "discount") {
    const pct = Math.min(100, Math.max(0, Number(opts.discountPct) || 0));
    const out: SizePriceMap = {};
    for (const [size, rate] of Object.entries(sizes)) out[size] = discounted(rate, pct);
    return { price: discounted(base, pct), sizePrice: out };
  }

  return { price: base, sizePrice: sizes };
}
