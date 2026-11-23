import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandHeader } from "@/components/BrandHeader";
import { inr } from "@/lib/format";
import { Package, Search, X, Share2, FileDown } from "lucide-react";
import { generateCatalogPdf, type CatalogLayout } from "@/lib/catalog-pdf";
import { safeColorHexMap } from "@/lib/colors";
import { applyRateMode, priceGroups, safeSizePriceMap, type RateMode } from "@/lib/pricing";
import { toast } from "sonner";

export const Route = createFileRoute("/catalog")({
  component: Catalog,
  head: () => ({
    meta: [
      { title: "THESTYLISHFLY — Wholesale Catalog" },
      { name: "description", content: "Browse the wholesale collection from THESTYLISHFLY by Ambika Garment, Mumbai." },
      { property: "og:title", content: "THESTYLISHFLY — Wholesale Catalog" },
      { property: "og:description", content: "Browse designs, sizes, rates, stock, and restock details from THESTYLISHFLY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function priceLabel(p: { price: number; sizes?: string[] | null; size_price?: Record<string, number> | null }) {
  const groups = priceGroups(p.sizes ?? [], safeSizePriceMap(p.size_price), Number(p.price) || 0);
  if (groups.length > 1) return `${inr(groups[0].rate)} – ${inr(groups[groups.length - 1].rate)}`;
  return inr(groups[0]?.rate ?? (Number(p.price) || 0));
}

type Product = {
  id: string;
  design_number: string;
  price: number;
  colors: string[];
  sizes: string[];
  color_hex?: Record<string, string> | null;
  size_price?: Record<string, number> | null;
  net_price?: number | null;
  size_net_price?: Record<string, number> | null;
  out_of_stock?: boolean | null;
  stock_qty?: number | null;
  restock_days?: number | null;
  restock_note?: string | null;
  product_images: { url: string; sort_order: number }[];
};

function Catalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [downloadingCatalog, setDownloadingCatalog] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [layout, setLayout] = useState<CatalogLayout>("three");
  const [rateMode, setRateMode] = useState<RateMode | "custom">("standard");
  const [customPct, setCustomPct] = useState<number>(10);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("products")
        .select(
          "id, design_number, price, colors, sizes, color_hex, size_price, net_price, size_net_price, out_of_stock, stock_qty, restock_days, restock_note, product_images(url, sort_order)",
        )
        .order("created_at", { ascending: false });
      setProducts((data as Product[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? products.filter((p) => p.design_number.toLowerCase().includes(q))
    : products;

  const handleShareCatalog = async () => {
    try {
      const url = typeof window !== "undefined" ? window.location.origin : "";
      const message = `Hello! Check out our latest wholesale collection on Thestylishfly. Click the link below to view designs, sizes, and rates directly: ${url}`;
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({ title: "THESTYLISHFLY Wholesale Catalog", text: message, url });
          return;
        } catch {
          // user cancelled or unsupported — fall through to wa.me
        }
      }
      const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.location.href = waUrl;
    } catch {
      try {
        const url = typeof window !== "undefined" ? window.location.origin : "";
        window.location.href = `https://wa.me/?text=${encodeURIComponent(url)}`;
      } catch {
        // no-op
      }
    }
  };

  const handleDownloadCatalog = async (chosen: CatalogLayout) => {
    if (downloadingCatalog) return;
    setLayoutOpen(false);
    setDownloadingCatalog(true);
    const pct = rateMode === "custom" ? Math.min(90, Math.max(0, Number(customPct) || 0)) : 5;
    const opts =
      rateMode === "manual_net"
        ? ({ mode: "manual_net" } as const)
        : rateMode === "discount" || rateMode === "custom"
          ? ({ mode: "discount" as const, discountPct: rateMode === "custom" ? pct : 5 })
          : ({ mode: "standard" } as const);
    const badge =
      rateMode === "standard"
        ? undefined
        : rateMode === "manual_net"
          ? "Net Rate Catalog"
          : `Net Rate Catalog · -${rateMode === "custom" ? pct : 5}%`;
    const whatsappUrl =
      "https://wa.me/?text=" +
      encodeURIComponent(
        "Hello, I am sharing the downloaded Wholesale Catalog PDF of Thestylishfly with you. Please find the attached PDF file below.",
      );
    try {
      const list = products.map((p) => {
        const img = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.url;
        const rates = applyRateMode(
          {
            price: Number(p.price) || 0,
            sizePrice: safeSizePriceMap(p.size_price),
            netPrice: Number(p.net_price) || 0,
            sizeNetPrice: safeSizePriceMap(p.size_net_price),
          },
          opts,
        );
        return {
          design_number: p.design_number,
          price: rates.price,
          colors: p.colors ?? [],
          sizes: p.sizes ?? [],
          colorHex: safeColorHexMap(p.color_hex),
          sizePrice: rates.sizePrice,
          imageUrl: img,
          outOfStock: Boolean(p.out_of_stock),
          stockQty: typeof p.stock_qty === "number" ? p.stock_qty : null,
          restockDays: typeof p.restock_days === "number" ? p.restock_days : null,
          restockNote: p.restock_note ?? undefined,
        };
      });

      let doc;
      try {
        doc = await generateCatalogPdf(list, chosen, badge);
      } catch (err) {
        console.error("catalog pdf image path failed, retrying text-only", err);
        doc = await generateCatalogPdf(list.map((p) => ({ ...p, imageUrl: undefined })), chosen, badge);
      }

      try {
        doc.save(badge ? "Thestylishfly_Net_Rate_Catalog.pdf" : "Thestylishfly_Catalog.pdf");
      } catch (err) {
        console.error("catalog pdf save failed", err);
      }

      setTimeout(() => {
        window.location.href = whatsappUrl;
      }, 800);
    } catch (err) {
      console.error("catalog download failed", err);
      toast.error("Could not generate catalog PDF. Please try again.");
      setTimeout(() => {
        window.location.href = whatsappUrl;
      }, 300);
    } finally {
      setDownloadingCatalog(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <BrandHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
        <div className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black uppercase tracking-wider sm:text-2xl">Collection</h2>
              <p className="text-sm text-muted-foreground">Tap any design to place a wholesale order.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setLayoutOpen(true)}
                disabled={downloadingCatalog || loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-xs font-bold uppercase tracking-wider text-background shadow-sm transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60 sm:px-4 sm:py-2.5 sm:text-sm"
                aria-label="Download and share PDF catalog"
              >
                <FileDown className="h-4 w-4" />
                {downloadingCatalog ? "Preparing..." : "Download & Share PDF"}
              </button>
              <button
                type="button"
                onClick={handleShareCatalog}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--brand-red)] px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:opacity-90 active:opacity-80 sm:px-4 sm:py-2.5 sm:text-sm"
                aria-label="Share catalog link on WhatsApp"
              >
                <Share2 className="h-4 w-4" />
                Share Link
              </button>
            </div>
          </div>
        </div>

        <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by design number (e.g. 02)"
            aria-label="Search designs by number"
            className="w-full rounded-xl border-2 border-border bg-card py-2.5 pl-10 pr-10 text-sm font-semibold outline-none transition-colors focus:border-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border p-10 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-semibold">No products yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add designs from the{" "}
              <Link to="/admin/products" className="font-semibold text-[var(--brand-red)] underline">
                Product Dashboard
              </Link>
              .
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border p-10 text-center">
            <Search className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-semibold">No design matches "{query}"</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a different design number.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => {
              const img = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.url;
              return (
                <Link
                  key={p.id}
                  to="/product/$id"
                  params={{ id: p.id }}
                  className="group block overflow-hidden rounded-xl border-2 border-border bg-card transition-all hover:border-foreground hover:shadow-[var(--shadow-card)]"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                    {p.out_of_stock && (
                      <span className="absolute left-0 right-0 top-1/2 z-10 -translate-y-1/2 bg-[var(--brand-red)] py-1 text-center text-[11px] font-black uppercase tracking-wider text-white">
                        Out of Stock
                      </span>
                    )}
                    {img ? (
                      <img
                        src={img}
                        alt={`Design ${p.design_number}`}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Package className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Design</span>
                      <span className="text-sm font-black">#{p.design_number}</span>
                    </div>
                    <div className="text-lg font-black text-[var(--brand-red)]">{priceLabel(p)}</div>
                    {typeof p.stock_qty === "number" && (
                      <div className="text-[11px] font-bold text-muted-foreground">
                        {p.stock_qty > 0 ? `Stock: ${p.stock_qty} pcs` : "Stock: not available"}
                      </div>
                    )}
                    {typeof p.restock_days === "number" && (
                      <div className="text-[11px] font-black text-[var(--brand-red)]">
                        Restock in {p.restock_days} {p.restock_days === 1 ? "day" : "days"}
                      </div>
                    )}
                    {p.restock_note && (
                      <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">{p.restock_note}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-muted-foreground">
          © THESTYLISHFLY · Ambika Garment, Mumbai
        </p>
      </main>

      {layoutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Choose catalog PDF layout"
          onClick={() => setLayoutOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border-2 border-border bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-black uppercase tracking-wider">Choose PDF Layout</h3>
              <button
                type="button"
                onClick={() => setLayoutOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">Pick how products appear in the catalog PDF.</p>

            <div className="space-y-2">
              {([
                { v: "one" as CatalogLayout, t: "1 Product per Page", d: "Full page — larger image and bigger details." },
                { v: "three" as CatalogLayout, t: "3 Products per Page", d: "Compact list layout (recommended)." },
              ]).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setLayout(o.v)}
                  aria-pressed={layout === o.v}
                  className={`w-full rounded-xl border-2 p-3 text-left transition-colors ${
                    layout === o.v ? "border-foreground bg-muted" : "border-border hover:border-foreground/40"
                  }`}
                >
                  <span className="block text-sm font-bold">{o.t}</span>
                  <span className="block text-xs text-muted-foreground">{o.d}</span>
                </button>
              ))}
            </div>

            <p className="mb-2 mt-5 text-xs font-black uppercase tracking-wider text-muted-foreground">
              Rate Selection
            </p>
            <div className="space-y-2">
              {([
                { v: "standard" as const, t: "Standard Rates", d: "Original regular prices." },
                { v: "manual_net" as const, t: "Manual Net Rates", d: "Uses the net prices set in the admin form." },
                { v: "discount" as const, t: "Automatic -5% Net Rate", d: "Rounded to clean whole rupees." },
                { v: "custom" as const, t: "Custom Discount %", d: "Enter your own percentage below." },
              ]).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setRateMode(o.v)}
                  aria-pressed={rateMode === o.v}
                  className={`w-full rounded-xl border-2 p-3 text-left transition-colors ${
                    rateMode === o.v ? "border-[var(--brand-red)] bg-muted" : "border-border hover:border-foreground/40"
                  }`}
                >
                  <span className="block text-sm font-bold">{o.t}</span>
                  <span className="block text-xs text-muted-foreground">{o.d}</span>
                </button>
              ))}
            </div>

            {rateMode === "custom" && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border-2 border-border p-3">
                <label htmlFor="custom-pct" className="text-sm font-bold">
                  Discount %
                </label>
                <input
                  id="custom-pct"
                  type="number"
                  min={0}
                  max={90}
                  inputMode="decimal"
                  value={customPct || ""}
                  onChange={(e) => setCustomPct(parseFloat(e.target.value) || 0)}
                  className="h-10 w-24 rounded-lg border-2 border-border bg-card px-3 text-sm font-bold outline-none focus:border-foreground"
                />
                <span className="text-xs text-muted-foreground">e.g. 10 or 15</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleDownloadCatalog(layout)}
              disabled={downloadingCatalog}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand-red)] px-4 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <FileDown className="h-4 w-4" />
              {downloadingCatalog ? "Preparing..." : "Generate & Share PDF"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}