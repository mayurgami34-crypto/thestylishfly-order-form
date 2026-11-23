import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Minus, ShoppingCart, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { inr, COLOR_PRESETS } from "@/lib/format";
import { resolveColorHex, safeColorHexMap } from "@/lib/colors";
import { lineTotals, priceGroups, safeSizePriceMap, sizeRate } from "@/lib/pricing";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/product/$id")({
  component: ProductPage,
  head: () => ({ meta: [
    { title: "Wholesale Product — THESTYLISHFLY" },
    { name: "description", content: "View design details, size-wise rates, stock, and restock information from THESTYLISHFLY." },
    { property: "og:title", content: "Wholesale Product — THESTYLISHFLY" },
    { property: "og:description", content: "View a THESTYLISHFLY wholesale design and prepare your order." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

type Product = {
  id: string;
  design_number: string;
  price: number;
  colors: string[];
  sizes: string[];
  color_hex?: Record<string, string> | null;
  size_price?: Record<string, number> | null;
  description: string | null;
  out_of_stock?: boolean | null;
  stock_qty?: number | null;
  restock_days?: number | null;
  restock_note?: string | null;
  product_images: { url: string; sort_order: number }[];
};

function ProductPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [p, setP] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgIdx, setImgIdx] = useState(0);
  // qtyByColor[color][size] = number
  const [qtyByColor, setQtyByColor] = useState<Record<string, Record<string, number>>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id, design_number, price, colors, sizes, color_hex, size_price, description, out_of_stock, stock_qty, restock_days, restock_note, product_images(url, sort_order)")
        .eq("id", id)
        .maybeSingle();
      setP(data as Product | null);
      setLoading(false);
    })();
  }, [id]);

  const images = useMemo(
    () => [...(p?.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [p],
  );

  const selectedColors = useMemo(() => Object.keys(qtyByColor), [qtyByColor]);
  const hexMap = useMemo(() => safeColorHexMap(p?.color_hex), [p]);
  const sizePriceMap = useMemo(() => safeSizePriceMap(p?.size_price), [p]);

  const colorBreakdown = useMemo(
    () =>
      selectedColors.map((color) => {
        const sizes = qtyByColor[color] || {};
        const pieces = Object.values(sizes).reduce((s, n) => s + (n || 0), 0);
        return { color, hex: resolveColorHex(color, hexMap[color]), sizes, pieces };
      }),
    [qtyByColor, selectedColors, hexMap],
  );

  const rate = Number(p?.price ?? 0);
  const { pieces: totalPieces, amount: lineTotal } = useMemo(
    () => lineTotals(colorBreakdown, sizePriceMap, rate),
    [colorBreakdown, sizePriceMap, rate],
  );

  const setSizeQty = (color: string, size: string, n: number) =>
    setQtyByColor((prev) => ({
      ...prev,
      [color]: { ...(prev[color] || {}), [size]: Math.max(0, n) },
    }));

  const toggleColor = (c: string) => {
    setQtyByColor((prev) => {
      if (prev[c]) {
        const { [c]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [c]: {} };
    });
    setExpanded((e) => ({ ...e, [c]: !e[c] || !qtyByColor[c] }));
  };

  const addToCart = (goToCart: boolean) => {
    if (p?.out_of_stock) {
      toast.error("This design is out of stock right now");
      return;
    }
    if (selectedColors.length === 0) {
      toast.error("Please select at least one color");
      return;
    }
    if (totalPieces === 0) {
      toast.error("Please add at least one piece");
      return;
    }
    addItem({
      productId: p!.id,
      designNumber: p!.design_number,
      price: rate,
      sizePrice: sizePriceMap,
      imageUrl: images[0]?.url,
      description: p!.description ?? undefined,
      allSizes: sizeOptions,
      colorBreakdown,
    });
    toast.success(`Design #${p!.design_number} added to cart`);
    if (goToCart) navigate({ to: "/cart" });
    else {
      setQtyByColor({});
      setExpanded({});
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <BrandHeader />
        <div className="mx-auto max-w-5xl p-6">
          <div className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }
  if (!p) {
    return (
      <div className="min-h-screen bg-background">
        <BrandHeader />
        <div className="mx-auto max-w-5xl p-6 text-center">
          <p>Product not found.</p>
          <Link to="/" className="font-semibold text-[var(--brand-red)] underline">Back to catalog</Link>
        </div>
      </div>
    );
  }

  const colorOptions = (p.colors.length ? p.colors : COLOR_PRESETS.map((c) => c.name));
  const sizeOptions = p.sizes.length
    ? p.sizes
    : ["S/M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL", "7XL", "9XL"];
  const groups = priceGroups(sizeOptions, sizePriceMap, rate);
  const mixedRates = groups.length > 1;

  return (
    <div className="min-h-screen bg-background">
      <BrandHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="relative aspect-[3/4] overflow-hidden rounded-xl border-2 border-border bg-muted">
              {images[imgIdx] ? (
                <img src={images[imgIdx].url} alt={`Design ${p.design_number}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">No image</div>
              )}
              {images.length > 1 && (
                <>
                  <button onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)} className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Previous">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button onClick={() => setImgIdx((i) => (i + 1) % images.length)} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Next">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {images.map((im, i) => (
                  <button key={i} onClick={() => setImgIdx(i)} className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-md border-2 ${i === imgIdx ? "border-[var(--brand-red)]" : "border-border"}`}>
                    <img src={im.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <Card className="overflow-hidden border-2">
            <div className="bg-foreground px-5 py-3">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white">Design #{p.design_number}</h2>
            </div>
            <div className="space-y-5 p-5">
              {p.out_of_stock && (
                <div className="rounded-xl bg-[var(--brand-red)] px-4 py-3 text-center text-sm font-black uppercase tracking-wider text-white">
                  Out of Stock
                </div>
              )}
              <div className="text-3xl font-black text-[var(--brand-red)]">
                {mixedRates ? `${inr(groups[0].rate)} – ${inr(groups[groups.length - 1].rate)}` : inr(groups[0]?.rate ?? rate)}
              </div>
              {typeof p.stock_qty === "number" && !p.out_of_stock && (
                <div className="text-sm font-bold text-muted-foreground">
                  {p.stock_qty > 0 ? `Stock available: ${p.stock_qty} pcs` : "Stock: not available"}
                </div>
              )}
              {(typeof p.restock_days === "number" || p.restock_note) && (
                <div className="rounded-xl border-2 border-[var(--brand-red)]/30 bg-[var(--brand-red)]/5 px-4 py-3">
                  {typeof p.restock_days === "number" && (
                    <p className="text-sm font-black text-[var(--brand-red)]">
                      Restock expected in {p.restock_days} {p.restock_days === 1 ? "day" : "days"}
                    </p>
                  )}
                  {p.restock_note && <p className="mt-1 text-sm text-muted-foreground">{p.restock_note}</p>}
                </div>
              )}
              {mixedRates && (
                <div className="space-y-1 rounded-xl border-2 border-border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Size-wise rates</p>
                  {groups.map((g) => (
                    <div key={g.rate} className="flex items-center justify-between text-sm">
                      <span className="font-bold">{g.sizes.join(", ")}</span>
                      <span className="font-black tabular-nums text-[var(--brand-red)]">{inr(g.rate)} / pc</span>
                    </div>
                  ))}
                </div>
              )}
              {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Select Colors</Label>
                <p className="text-xs text-muted-foreground">Tap a color to add sizes for it. Each color keeps its own size breakdown.</p>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((c) => {
                    const active = selectedColors.includes(c);
                    const swatch = resolveColorHex(c, hexMap[c]);
                    return (
                      <button key={c} type="button" onClick={() => toggleColor(c)} className={`flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all ${active ? "border-[var(--brand-red)] bg-[var(--brand-red)] text-white" : "border-border bg-background hover:border-foreground"}`}>
                        <span className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ backgroundColor: swatch }} />
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedColors.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Size Breakdown per Color</Label>
                  {selectedColors.map((color) => {
                    const sizes = qtyByColor[color] || {};
                    const pieces = Object.values(sizes).reduce((s, n) => s + (n || 0), 0);
                    const isOpen = expanded[color] !== false;
                    return (
                      <div key={color} className="overflow-hidden rounded-xl border-2 border-border">
                        <button
                          type="button"
                          onClick={() => setExpanded((e) => ({ ...e, [color]: !isOpen }))}
                          className="flex w-full items-center justify-between bg-secondary/50 px-3 py-2.5 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="h-4 w-4 rounded-full border border-black/20" style={{ backgroundColor: resolveColorHex(color, hexMap[color]) }} />
                            <span className="font-bold">{color}</span>
                            <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-bold text-white">{pieces} pcs</span>
                          </div>
                          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </button>
                        {isOpen && (
                          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
                            {sizeOptions.map((s) => (
                              <div key={s} className="rounded-lg border-2 border-border p-2 text-center">
                                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{s}</div>
                                <div className="mb-1 text-[11px] font-bold text-[var(--brand-red)]">{inr(sizeRate(s, sizePriceMap, rate))}/pc</div>
                                <div className="flex items-center justify-between gap-1">
                                  <button type="button" onClick={() => setSizeQty(color, s, (sizes[s] || 0) - 1)} className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-foreground hover:text-white">
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <input type="number" min={0} inputMode="numeric" value={sizes[s] || ""} onChange={(e) => setSizeQty(color, s, parseInt(e.target.value || "0", 10) || 0)} className="w-full bg-transparent text-center text-base font-bold outline-none" placeholder="0" />
                                  <button type="button" onClick={() => setSizeQty(color, s, (sizes[s] || 0) + 1)} className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-foreground hover:text-white">
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="overflow-hidden rounded-xl border-2 border-foreground">
                <div className="space-y-1.5 bg-secondary/50 p-3 text-sm">
                  <Row label="Total Pieces" value={String(totalPieces)} />
                  <Row
                    label="Rate / Pc"
                    value={mixedRates ? "Size-wise (see above)" : inr(groups[0]?.rate ?? rate)}
                  />
                </div>
                <div className="flex items-center justify-between bg-foreground px-4 py-3 text-white">
                  <span className="text-xs font-bold uppercase tracking-widest">Line Total</span>
                  <span className="text-2xl font-black text-[var(--brand-red)]">{inr(lineTotal)}</span>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline" size="lg" disabled={Boolean(p.out_of_stock)} onClick={() => addToCart(false)} className="h-12 font-bold">
                  <Plus className="h-5 w-5" /> Add & Keep Shopping
                </Button>
                <Button type="button" variant="brand" size="lg" disabled={Boolean(p.out_of_stock)} onClick={() => addToCart(true)} className="h-12 font-bold">
                  <ShoppingCart className="h-5 w-5" /> {p.out_of_stock ? "Out of Stock" : "Add to Cart"}
                </Button>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                Add multiple designs, then checkout via WhatsApp from the cart.
              </p>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold tabular-nums ${accent ? "text-[var(--brand-red)]" : "text-foreground"}`}>{value}</span>
    </div>
  );
}