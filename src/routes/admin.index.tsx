import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/format";
import { generateInvoicePdf } from "@/lib/pdf";
import { generateMultiOrderPdf } from "@/lib/order-pdf";
import { forgetOrder, readCachedOrders, subscribeToOrderUpdates, type CachedOrder } from "@/lib/order-cache";
import { listOrdersAdmin, deleteOrderAdmin } from "@/lib/admin-orders.functions";
import { getAdminKey } from "@/lib/admin-gate";
import type { CartColorBreakdown, CartItem } from "@/lib/cart";
import { safeSizePriceMap } from "@/lib/pricing";
import { Download, Trash2, Package as PackageIcon, IndianRupee, ListOrdered } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
  head: () => ({ meta: [
    { title: "Wholesale Orders — THESTYLISHFLY" },
    { name: "description", content: "Review wholesale orders and order totals for THESTYLISHFLY." },
    { property: "og:title", content: "Wholesale Orders — THESTYLISHFLY" },
    { property: "og:description", content: "Review wholesale orders and order totals for THESTYLISHFLY." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

type Order = {
  id: string;
  customer_name: string;
  customer_phone: string;
  items: any;
  subtotal: number;
  discount_pct: number;
  discount_amount: number;
  net_total: number;
  total_pieces: number;
  created_at: string;
};

function mergeOrders(databaseOrders: Order[], cachedOrders: CachedOrder[]) {
  const byId = new Map<string, Order>();
  [...cachedOrders, ...databaseOrders].forEach((order) => byId.set(order.id, order as Order));
  return [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function normalizeColorBreakdown(value: any): CartColorBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const sizes = raw?.sizes && typeof raw.sizes === "object" ? raw.sizes : {};
    const safeSizes = Object.fromEntries(
      Object.entries(sizes)
        .map(([size, qty]) => [String(size), Math.max(0, Number(qty) || 0)] as const)
        .filter(([, qty]) => qty > 0),
    );
    return {
      color: String(raw?.color || "Color"),
      sizes: safeSizes,
      pieces: Object.values(safeSizes).reduce((sum, qty) => sum + qty, 0),
    };
  });
}

function normalizeOrderItem(raw: any, index: number): CartItem {
  const colorBreakdown = normalizeColorBreakdown(raw?.colorBreakdown);
  const allSizes = Array.isArray(raw?.allSizes)
    ? raw.allSizes.map(String)
    : Array.from(new Set(colorBreakdown.flatMap((color) => Object.keys(color.sizes))));

  return {
    id: String(raw?.id || `${index}`),
    productId: String(raw?.productId || raw?.product_id || raw?.id || `${index}`),
    designNumber: String(raw?.designNumber || raw?.design_number || "-"),
    price: Math.max(0, Number(raw?.price) || 0),
    sizePrice: safeSizePriceMap(raw?.sizePrice ?? raw?.size_price),
    imageUrl: typeof raw?.imageUrl === "string" ? raw.imageUrl : undefined,
    description: typeof raw?.description === "string" ? raw.description : undefined,
    allSizes,
    colorBreakdown,
  };
}

function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const cachedOrders = readCachedOrders();
    let rows: Order[] = [];
    let lastError: unknown = null;
    // Retry: a single hiccup must never make the dashboard fall back to this
    // device's local cache and look like historical orders disappeared.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await listOrdersAdmin({ data: { masterKey: getAdminKey() } });
        rows = (res.orders as unknown as Order[]) ?? [];
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        console.error(`Order load failed (attempt ${attempt + 1}):`, error);
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    if (lastError) {
      const message = lastError instanceof Error ? lastError.message : "Could not load orders";
      setSyncError(message);
      if (cachedOrders.length === 0) toast.error(`Could not load orders: ${message}`);
    } else {
      setSyncError(null);
    }
    setOrders(mergeOrders(rows, cachedOrders));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsubscribe = subscribeToOrderUpdates(load);
    const onFocus = () => load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    // Cross-device sync: poll periodically (orders are read through the
    // master-key server layer, so no public realtime channel is used).
    const timer = window.setInterval(load, 30000);

    return () => {
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, []);

  const totalRevenue = orders.reduce((s, o) => s + Number(o.net_total), 0);
  const totalPieces = orders.reduce((s, o) => s + o.total_pieces, 0);

  const downloadInvoice = async (o: Order) => {
    const multiItems = Array.isArray(o.items?.items)
      ? o.items.items.map((item: any, index: number) => normalizeOrderItem(item, index))
      : [];

    if (multiItems.length > 0) {
      try {
        const doc = await generateMultiOrderPdf({
          customerName: o.customer_name,
          customerPhone: o.customer_phone,
          items: multiItems,
          subtotal: Number(o.subtotal),
          discountPct: Number(o.discount_pct),
          discountAmount: Number(o.discount_amount),
          netTotal: Number(o.net_total),
          totalPieces: Number(o.total_pieces),
          orderId: o.id,
          date: new Date(o.created_at),
        });
        doc.save(`ORDER-${o.id.slice(0, 6)}.pdf`);
      } catch (error) {
        console.error("Order PDF download failed:", error);
        toast.error("Could not download order PDF");
      }
      return;
    }

    const rate = o.total_pieces > 0 ? Number(o.subtotal) / o.total_pieces : 0;
    // Support new (colorBreakdown) and legacy (lines) order shapes.
    let colorBreakdown = o.items?.colorBreakdown as
      | { color: string; sizes: Record<string, number>; pieces: number }[]
      | undefined;
    let allSizes: string[] = o.items?.allSizes ?? [];
    if (!colorBreakdown) {
      const sizes: Record<string, number> = {};
      (o.items?.lines ?? []).forEach((l: any) => (sizes[l.size] = l.quantity));
      const colors: string[] = o.items?.colors ?? [];
      colorBreakdown = [
        {
          color: colors.join(", ") || "-",
          sizes,
          pieces: o.total_pieces,
        },
      ];
      if (!allSizes.length) allSizes = Object.keys(sizes);
    }
    const doc = generateInvoicePdf({
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      designNumber: o.items?.design_number ?? "-",
      rate,
      colorBreakdown,
      allSizes,
      totalPieces: o.total_pieces,
      grossTotal: Number(o.subtotal),
      discountPct: Number(o.discount_pct),
      discountAmount: Number(o.discount_amount),
      netTotal: Number(o.net_total),
      orderId: o.id,
      date: new Date(o.created_at),
      imageUrl: o.items?.image_url ?? undefined,
    });
    doc.save(`INV-${o.id.slice(0, 6)}.pdf`);
  };

  const removeOrder = async (id: string) => {
    if (!confirm("Delete this order?")) return;
    try {
      await deleteOrderAdmin({ data: { masterKey: getAdminKey(), id } });
    } catch (error) {
      return toast.error(error instanceof Error ? error.message : "Could not delete order");
    }
    forgetOrder(id);
    setOrders((prev) => prev.filter((o) => o.id !== id));
    toast.success("Order deleted");
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      {syncError && (
        <Card className="border-2 border-destructive/40 bg-destructive/5 p-4">
          <div className="text-sm font-bold text-destructive">Server sync failed — showing this device only</div>
          <p className="mt-1 text-xs text-muted-foreground">
            No orders were deleted. The totals below are incomplete until sync succeeds. ({syncError})
          </p>
          <Button size="sm" variant="outline" className="mt-3 font-bold" onClick={() => void load()}>
            Retry sync
          </Button>
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Orders" value={String(orders.length)} icon={<ListOrdered className="h-5 w-5" />} />
        <Stat label="Total Pieces" value={String(totalPieces)} icon={<PackageIcon className="h-5 w-5" />} />
        <Stat label="Revenue" value={inr(totalRevenue)} icon={<IndianRupee className="h-5 w-5" />} accent />
      </div>

      <Card className="overflow-hidden border-2">
        <div className="bg-foreground px-5 py-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white">Recent Orders</h2>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No orders yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {orders.map((o) => (
              <div key={o.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{o.customer_name}</span>
                    <span className="text-xs text-muted-foreground">· {o.customer_phone}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Design #{o.items?.design_number ?? "-"} · {o.total_pieces} pcs ·{" "}
                    {(o.items?.colors ?? []).join(", ") || "-"}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("en-IN")} · #{o.id.slice(0, 8).toUpperCase()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-lg font-black text-[var(--brand-red)]">{inr(Number(o.net_total))}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void downloadInvoice(o)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeOrder(o.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}

function Stat({ label, value, icon, accent = false }: { label: string; value: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <Card className="flex items-center justify-between border-2 p-4">
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-black ${accent ? "text-[var(--brand-red)]" : ""}`}>{value}</div>
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-white">
        {icon}
      </div>
    </Card>
  );
}