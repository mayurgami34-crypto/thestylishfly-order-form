import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Minus, Trash2, Send, ShoppingCart, ChevronDown } from "lucide-react";
import { inr, COLOR_PRESETS } from "@/lib/format";
import { toast } from "sonner";
import { useCart, type CartItem } from "@/lib/cart";
import { lineTotals, safeSizePriceMap, sizeRate, priceGroups } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { generateMultiOrderPdf } from "@/lib/order-pdf";
import { rememberOrder } from "@/lib/order-cache";
import type { Json, Tables } from "@/integrations/supabase/types";

// Fallback business number. Digits only, with country code (India = 91).
const STORE_OWNER_WHATSAPP = "919876543210";
const getAdminWhatsAppNumber = () => STORE_OWNER_WHATSAPP.replace(/\D/g, "");

function getSafeWhatsAppNumber(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length > 10) return digits.replace(/^0+/, "");
  return "";
}

function makeOrderId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function safeColorBreakdown(item: CartItem) {
  return Array.isArray(item.colorBreakdown)
    ? item.colorBreakdown.map((color) => {
        const sizes = color.sizes && typeof color.sizes === "object" ? color.sizes : {};
        const pieces = Object.values(sizes).reduce((sum, qty) => sum + (Number(qty) || 0), 0);

        return {
          color: String(color.color || "Color"),
          sizes,
          pieces,
        };
      })
    : [];
}

function safeSizes(item: CartItem, colorBreakdown = safeColorBreakdown(item)) {
  const existingSizes = Array.isArray(item.allSizes) ? item.allSizes.map(String) : [];
  const sizesFromBreakdown = colorBreakdown.flatMap((color) => Object.keys(color.sizes));
  return Array.from(new Set([...existingSizes, ...sizesFromBreakdown]));
}

function itemPieces(item: CartItem) {
  return safeColorBreakdown(item).reduce((sum, color) => sum + color.pieces, 0);
}

function itemAmount(item: CartItem) {
  return lineTotals(safeColorBreakdown(item), item.sizePrice, Number(item.price) || 0).amount;
}

function rs(value: number) {
  const amount = Number.isFinite(value) ? value : 0;
  return `Rs. ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export const Route = createFileRoute("/cart")({
  component: CartPage,
  head: () => ({
    meta: [
      { title: "Your Cart — THESTYLISHFLY" },
      { name: "description", content: "Review wholesale order items and checkout via WhatsApp." },
      { property: "og:title", content: "Your Wholesale Cart — THESTYLISHFLY" },
      { property: "og:description", content: "Review selected wholesale designs and complete your THESTYLISHFLY order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CartPage() {
  const { items, subtotal, totalPieces, updateItem, removeItem, clear } = useCart();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discount, setDiscount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState("");

  const cartItems = Array.isArray(items) ? items : [];
  const safeTotalPieces = Number.isFinite(totalPieces) ? totalPieces : cartItems.reduce((sum, item) => sum + itemPieces(item), 0);
  const safeSubtotal = Number.isFinite(subtotal)
    ? subtotal
    : cartItems.reduce((sum, item) => sum + itemAmount(item), 0);
  const safeDiscount = Number.isFinite(discount) ? Math.max(0, Math.min(100, discount)) : 0;
  const discountAmount = (safeSubtotal * safeDiscount) / 100;
  const netTotal = safeSubtotal - discountAmount;

  const setQty = (item: CartItem, color: string, size: string, n: number) => {
    const nextCB = safeColorBreakdown(item).map((c) =>
      c.color === color
        ? { ...c, sizes: { ...c.sizes, [size]: Math.max(0, n) } }
        : c,
    );
    updateItem(item.id, { colorBreakdown: nextCB });
  };

  const checkout = async () => {
    try {
      const name = String(customerName || "").trim();
      const phone = String(customerPhone || "").trim();
      const enteredPhoneDigits = phone.replace(/\D/g, "");

      if (!name) return toast.error("Please enter customer name");
      if (enteredPhoneDigits.length < 10) return toast.error("Please enter WhatsApp number");
      if (cartItems.length === 0) return toast.error("Cart is empty");
      if (!Number.isFinite(safeTotalPieces) || safeTotalPieces <= 0) return toast.error("Add at least one piece");

      setSubmitting(true);

      const orderLines = cartItems.flatMap((it, itemIndex) => {
        const colorBreakdown = safeColorBreakdown(it);
        const pieces = itemPieces(it);
        const base = Number(it.price) || 0;
        const sizeLines = colorBreakdown.flatMap((color) =>
          Object.entries(color.sizes || {})
            .filter(([, qty]) => Number(qty) > 0)
            .map(([size, qty]) => {
              const q = Number(qty) || 0;
              const r = sizeRate(size, it.sizePrice, base);
              return `   ${String(color.color || "Color")} / Size ${size}: ${q} pcs @ ${rs(r)}/pc = ${rs(q * r)}`;
            }),
        );
        const groups = priceGroups(safeSizes(it, colorBreakdown), it.sizePrice, base);
        const rateLine =
          groups.length > 1
            ? groups.map((g) => `${g.sizes.join("/")} @ ${rs(g.rate)}`).join(", ")
            : `${rs(groups[0]?.rate ?? base)} / pc`;

        return [
          `*${itemIndex + 1}. Design #${String(it.designNumber || "")}*`,
          `   *Rate:* ${rateLine}`,
          `   *Qty:* ${pieces} pcs`,
          ...sizeLines,
          `   *Total:* ${rs(itemAmount(it))}`,
        ];
      });

      const cleanMessage = [
        "*Hello, I want to place this order on Thestylishfly.*",
        "",
        `*Customer:* ${name}`,
        `*Customer WhatsApp:* ${phone}`,
        "",
        "*Order Details:*",
        ...orderLines,
        "",
        `*Items:* ${cartItems.length}`,
        `*Total Pieces:* ${safeTotalPieces}`,
        `*Gross Total:* ${rs(safeSubtotal)}`,
        `*Discount (${safeDiscount}%):* - ${rs(discountAmount)}`,
        `*Net Payable: ${rs(netTotal)}*`,
        "",
        "(Order PDF has been downloaded to my device — attaching it here.)",
      ].join("\n").replace(/₹/g, "Rs.");

      // 1) Build the order record once so the database save, local dashboard cache,
      // PDF, and WhatsApp message all use the exact same data.
      const orderId = makeOrderId();
      const createdAt = new Date().toISOString();
      const itemsPayload: Json = {
        items: cartItems.map((it) => ({
          id: it.id,
          productId: it.productId,
          designNumber: it.designNumber,
          price: Number(it.price) || 0,
          sizePrice: safeSizePriceMap(it.sizePrice),
          imageUrl: it.imageUrl ?? null,
          description: it.description ?? null,
          allSizes: safeSizes(it),
          colorBreakdown: safeColorBreakdown(it),
          pieces: itemPieces(it),
        })),
        design_number: cartItems.map((it) => it.designNumber).join(", "),
        image_url: cartItems[0]?.imageUrl ?? null,
        colors: Array.from(new Set(cartItems.flatMap((it) => safeColorBreakdown(it).map((c) => c.color)))),
      };
      const orderRecord: Tables<"orders"> = {
        id: orderId,
        customer_name: name,
        customer_phone: phone,
        items: itemsPayload,
        subtotal: safeSubtotal,
        discount_pct: safeDiscount,
        discount_amount: discountAmount,
        net_total: netTotal,
        total_pieces: safeTotalPieces,
        notes: null,
        created_at: createdAt,
      };

      // 2) Force the backend save to finish successfully before opening WhatsApp.
      // If the database rejects the order, show the exact error and stop here.
      try {
        const { error } = await supabase.from("orders").insert(orderRecord);
        if (error) {
          throw error;
        }
        rememberOrder(orderRecord);
        toast.success("Order saved. Opening WhatsApp…");
      } catch (err) {
        const databaseMessage = err instanceof Error ? err.message : typeof err === "object" && err !== null && "message" in err ? String((err as { message?: unknown }).message) : String(err);
        console.error("Order database save failed before WhatsApp redirect:", err);
        toast.error(`Database save failed: ${databaseMessage}`);
        window.alert(`Database save failed: ${databaseMessage}`);
        return;
      }

      // 3) Open WhatsApp only after the database save succeeds. Use wa.me with
      // a clean message string and let encodeURIComponent do all URL encoding.
      const phoneNumber = getSafeWhatsAppNumber(phone) || getAdminWhatsAppNumber();
      const encodedText = encodeURIComponent(cleanMessage);
      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedText}`;
      setCheckoutUrl(whatsappUrl);
      let openedInNewTab = false;
      try {
        const opened = window.open(whatsappUrl, "_blank");
        openedInNewTab = Boolean(opened);
        if (!opened) {
          clear();
          window.location.href = whatsappUrl;
          return;
        }
      } catch (redirectError) {
        console.error("WhatsApp redirect failed, falling back to same-tab redirect:", redirectError);
        clear();
        window.location.href = whatsappUrl;
        return;
      }

      // 4) Generate + download the PDF only after WhatsApp has already opened.
      // Any PDF failure must not affect checkout.
      if (openedInNewTab) {
        try {
          const doc = await generateMultiOrderPdf({
            customerName: name,
            customerPhone: phone,
            items: cartItems,
            subtotal: safeSubtotal,
            discountPct: safeDiscount,
            discountAmount,
            netTotal,
            totalPieces: safeTotalPieces,
            orderId,
          });
          const shortId = (orderId || Date.now().toString()).toString().replace(/-/g, "").slice(0, 6);
          const safeName = (name || "Order").replace(/[\\/:*?"<>|]/g, "").trim() || "Order";
          const fileName = `${safeName} - ORDER-${shortId}.pdf`;
          doc.save(fileName);
        } catch (err) {
          console.error("PDF generation failed after WhatsApp opened:", err);
        }
      }
      clear();
    } catch (error) {
      console.error("Checkout failed:", error);
      toast.error(error instanceof Error ? error.message : "Checkout failed. WhatsApp was not opened.");
    } finally {
      setSubmitting(false);
    }
  };

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <BrandHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <ShoppingCart className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-black uppercase tracking-wider">Your cart is empty</h2>
          <p className="mt-1 text-sm text-muted-foreground">Browse the catalog and add designs to place a wholesale order.</p>
          <Link to="/catalog" className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-[var(--brand-red)] px-6 font-bold uppercase tracking-wider text-white">
            Go to Catalog
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <BrandHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black uppercase tracking-wider sm:text-2xl">Your Cart</h2>
          <button onClick={clear} className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-[var(--brand-red)]">
            Clear all
          </button>
        </div>

        <div className="space-y-3">
          {cartItems.map((it, idx) => {
            const colorBreakdown = safeColorBreakdown(it);
            const allSizes = safeSizes(it, colorBreakdown);
            const linePieces = itemPieces(it);
            const lineTotal = itemAmount(it);
            const itemGroups = priceGroups(allSizes, it.sizePrice, Number(it.price) || 0);
            const isOpen = openId === it.id;
            return (
              <Card key={it.id} className="overflow-hidden border-2">
                <div className="flex items-start gap-3 p-3">
                  <div className="h-20 w-16 flex-shrink-0 overflow-hidden rounded-md border-2 border-border bg-muted">
                    {it.imageUrl ? (
                      <img src={it.imageUrl} alt={`Design ${it.designNumber}`} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Item {String(idx + 1).padStart(2, "0")}</div>
                        <div className="text-base font-black">Design #{it.designNumber}</div>
                      </div>
                      <button onClick={() => removeItem(it.id)} className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-[var(--brand-red)] hover:text-[var(--brand-red)]" aria-label="Remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="text-muted-foreground">
                        {itemGroups.length > 1
                          ? `${inr(itemGroups[0].rate)} – ${inr(itemGroups[itemGroups.length - 1].rate)} / pc`
                          : `${inr(itemGroups[0]?.rate ?? it.price)} / pc`}
                      </span>
                      <span className="rounded-full bg-foreground px-2 py-0.5 font-bold text-white">{linePieces} pcs</span>
                      <span className="font-black text-[var(--brand-red)]">{inr(lineTotal)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {colorBreakdown.map((cb) => {
                        const preset = COLOR_PRESETS.find((p) => p.name === cb.color);
                        return (
                          <span key={cb.color} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px]">
                            {preset && <span className="h-2.5 w-2.5 rounded-full border border-black/20" style={{ backgroundColor: preset.hex }} />}
                            {cb.color} · {cb.pieces}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setOpenId(isOpen ? null : it.id)}
                  className="flex w-full items-center justify-between border-t bg-secondary/40 px-3 py-2 text-xs font-bold uppercase tracking-wider"
                >
                  {isOpen ? "Hide" : "Edit"} sizes
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="space-y-3 p-3">
                    {colorBreakdown.map((cb) => (
                      <div key={cb.color} className="rounded-lg border-2 border-border p-2">
                        <div className="mb-1 text-xs font-bold">{cb.color}</div>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                          {allSizes.map((s) => (
                            <div key={s} className="rounded border border-border p-1.5 text-center">
                              <div className="text-[10px] font-bold uppercase text-muted-foreground">{s}</div>
                              <div className="text-[10px] font-bold text-[var(--brand-red)]">{inr(sizeRate(s, it.sizePrice, Number(it.price) || 0))}</div>
                              <div className="flex items-center justify-between gap-1">
                                <button onClick={() => setQty(it, cb.color, s, (cb.sizes[s] || 0) - 1)} className="flex h-6 w-6 items-center justify-center rounded border border-border">
                                  <Minus className="h-3 w-3" />
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  value={cb.sizes[s] || ""}
                                  onChange={(e) => setQty(it, cb.color, s, parseInt(e.currentTarget.value || "0", 10) || 0)}
                                  className="w-full bg-transparent text-center text-sm font-bold outline-none"
                                  placeholder="0"
                                />
                                <button onClick={() => setQty(it, cb.color, s, (cb.sizes[s] || 0) + 1)} className="flex h-6 w-6 items-center justify-center rounded border border-border">
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <Card className="mt-6 overflow-hidden border-2">
          <div className="bg-foreground px-4 py-2">
            <h3 className="text-sm font-bold uppercase tracking-widest text-white">Customer & Checkout</h3>
          </div>
          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cname">Customer Name</Label>
                <Input id="cname" value={customerName} onChange={(e) => setCustomerName(e.currentTarget.value || "")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cphone">WhatsApp Number</Label>
                <Input id="cphone" type="tel" inputMode="tel" placeholder="e.g. 8169152853" value={customerPhone} onChange={(e) => setCustomerPhone(e.currentTarget.value || "")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="disc">Discount %</Label>
                <Input id="disc" type="number" min={0} max={100} value={discount || ""} onChange={(e) => setDiscount(parseFloat(e.currentTarget.value) || 0)} placeholder="0" />
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border-2 border-foreground">
              <div className="space-y-1.5 bg-secondary/50 p-3 text-sm">
                <Row label="Items" value={String(cartItems.length)} />
                <Row label="Total Pieces" value={String(safeTotalPieces)} />
                <Row label="Gross Total" value={inr(safeSubtotal)} />
                <Row label={`Discount (${safeDiscount}%)`} value={`- ${inr(discountAmount)}`} accent />
              </div>
              <div className="flex items-center justify-between bg-foreground px-4 py-3 text-white">
                <span className="text-xs font-bold uppercase tracking-widest">Net Payable</span>
                <span className="text-2xl font-black text-[var(--brand-red)]">{inr(netTotal)}</span>
              </div>
            </div>

            <Button type="button" variant="whatsapp" size="lg" onClick={checkout} disabled={submitting} className="h-12 w-full font-bold">
              <Send className="h-5 w-5" /> Place Order via WhatsApp
            </Button>
            {checkoutUrl ? (
              <a href={checkoutUrl} target="_top" rel="noopener noreferrer" className="block text-center text-xs font-bold uppercase tracking-wider text-[var(--brand-red)]">
                Open WhatsApp again
              </a>
            ) : null}
          </div>
        </Card>
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

function buildMessage(d: {
  customerName: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  discountAmount: number;
  netTotal: number;
  totalPieces: number;
  orderId?: string;
}) {
  const blocks = d.items.map((it, i) => {
    const pieces = it.colorBreakdown.reduce((s, c) => s + c.pieces, 0);
    const lineTotal = pieces * it.price;
    const colorLines = it.colorBreakdown
      .map((cb) => {
        const sizeLines = Object.entries(cb.sizes)
          .filter(([, q]) => q > 0)
          .map(([s, q]) => `     • ${s}: ${q}`)
          .join("\n");
        return `  *${cb.color}* (${cb.pieces} pcs)\n${sizeLines}`;
      })
      .join("\n");
    return [
      `*━━ Design #${String(i + 1).padStart(2, "0")} · ${it.designNumber} ━━*`,
      it.imageUrl ? `Photo: ${it.imageUrl}` : "",
      `Rate: Rs. ${it.price} / pc`,
      colorLines,
      `Line total: ${pieces} pcs · Rs. ${lineTotal}`,
    ].filter(Boolean).join("\n");
  });

  return [
    "*THESTYLISHFLY*",
    "_The Classic Style of Girl's Collection_",
    "A Brand of AMBIKA GARMENT, Mumbai",
    "",
    `*Order${d.orderId ? ` #${d.orderId.slice(0, 8).toUpperCase()}` : ""}*`,
    `Customer: ${d.customerName}`,
    `Items: ${d.items.length}`,
    "",
    ...blocks,
    "",
    "*━━ SUMMARY ━━*",
    `Total Pieces: ${d.totalPieces}`,
    `Gross Total: Rs. ${d.subtotal}`,
    `Discount (${d.discount || 0}%): - Rs. ${d.discountAmount}`,
    "",
    `*NET PAYABLE: Rs. ${d.netTotal}*`,
  ].join("\n");
}