import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { lineTotals, safeSizePriceMap, type SizePriceMap } from "@/lib/pricing";

export type CartColorBreakdown = {
  color: string;
  sizes: Record<string, number>;
  pieces: number;
  hex?: string;
};

export type CartItem = {
  id: string; // local uid
  productId: string;
  designNumber: string;
  price: number;
  /** Optional per-size rates. Sizes absent here fall back to `price`. */
  sizePrice?: SizePriceMap;
  imageUrl?: string;
  description?: string;
  allSizes: string[];
  colorBreakdown: CartColorBreakdown[];
};

type CartCtx = {
  items: CartItem[];
  totalItems: number;
  totalPieces: number;
  subtotal: number;
  addItem: (item: Omit<CartItem, "id">) => void;
  updateItem: (id: string, next: Partial<CartItem>) => void;
  removeItem: (id: string) => void;
  clear: () => void;
};

const Ctx = createContext<CartCtx | null>(null);
const STORAGE_KEY = "tsf_cart_v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeCartId() {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

function safeSizes(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([size, qty]) => [String(size), Math.max(0, Number(qty) || 0)] as const)
      .filter(([, qty]) => qty > 0),
  );
}

function safeBreakdown(value: unknown): CartColorBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const row = isRecord(raw) ? raw : {};
    const sizes = safeSizes(row.sizes);
    const pieces = Object.values(sizes).reduce((sum, qty) => sum + qty, 0);

    return {
      color: String(row.color || "Color"),
      hex: typeof row.hex === "string" ? row.hex : undefined,
      sizes,
      pieces,
    };
  });
}

function normalizeCartItem(raw: unknown): CartItem | null {
  if (!isRecord(raw)) return null;

  let colorBreakdown = safeBreakdown(raw.colorBreakdown);

  // Recovery for older cart entries saved before the multi-size cart format.
  if (colorBreakdown.length === 0) {
    const color = String(raw.color || raw.selectedColor || "Color");
    const size = String(raw.size || raw.selectedSize || "Free Size");
    const quantity = Math.max(0, Number(raw.quantity) || 0);
    if (quantity > 0) {
      colorBreakdown = [{ color, sizes: { [size]: quantity }, pieces: quantity }];
    }
  }

  const allSizes = Array.isArray(raw.allSizes)
    ? raw.allSizes.map((size) => String(size))
    : Array.from(new Set(colorBreakdown.flatMap((color) => Object.keys(color.sizes))));

  const designNumber = String(raw.designNumber || raw.designNo || raw.design || "").trim();
  const productId = String(raw.productId || raw.product_id || raw.id || designNumber || makeCartId());

  if (!designNumber && colorBreakdown.length === 0) return null;

  return {
    id: String(raw.id || makeCartId()),
    productId,
    designNumber: designNumber || productId,
    price: Math.max(0, Number(raw.price) || 0),
    sizePrice: safeSizePriceMap(raw.sizePrice ?? (raw as { size_price?: unknown }).size_price),
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : typeof raw.image === "string" ? raw.image : undefined,
    description: typeof raw.description === "string" ? raw.description : undefined,
    allSizes,
    colorBreakdown: recalc(colorBreakdown),
  };
}

function recalc(cb: CartColorBreakdown[]): CartColorBreakdown[] {
  return safeBreakdown(cb).map((c) => ({
    ...c,
    pieces: Object.values(c.sizes).reduce((s, n) => s + (Number(n) || 0), 0),
  }));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        const nextItems = Array.isArray(parsed)
          ? parsed.map(normalizeCartItem).filter((item): item is CartItem => Boolean(item))
          : [];
        setItems(nextItems);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items, hydrated]);

  const value = useMemo<CartCtx>(() => {
    const totalPieces = items.reduce(
      (s, it) => s + safeBreakdown(it.colorBreakdown).reduce((a, c) => a + c.pieces, 0),
      0,
    );
    const subtotal = items.reduce(
      (s, it) => s + lineTotals(safeBreakdown(it.colorBreakdown), it.sizePrice, Number(it.price) || 0).amount,
      0,
    );
    return {
      items,
      totalItems: items.length,
      totalPieces,
      subtotal,
      addItem: (item) =>
        setItems((prev) => {
          const normalized = normalizeCartItem({ ...item, id: makeCartId() });
          return normalized ? [...prev, normalized] : prev;
        }),
      updateItem: (id, next) =>
        setItems((prev) =>
          prev
            .map((it) =>
              it.id === id
                ? normalizeCartItem({
                    ...it,
                    ...next,
                    colorBreakdown: recalc(next.colorBreakdown ?? it.colorBreakdown),
                  })
                : it,
            )
            .filter((item): item is CartItem => Boolean(item)),
        ),
      removeItem: (id) => setItems((prev) => prev.filter((it) => it.id !== id)),
      clear: () => setItems([]),
    };
  }, [items]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}