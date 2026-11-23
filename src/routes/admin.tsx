import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { Package, ClipboardList, Store, LogOut } from "lucide-react";
import { AdminGate, clearAdminKey } from "@/lib/admin-gate";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
  head: () => ({ meta: [
    { title: "Admin Dashboard — THESTYLISHFLY" },
    { name: "description", content: "Manage THESTYLISHFLY wholesale orders and product catalog." },
    { property: "og:title", content: "Admin Dashboard — THESTYLISHFLY" },
    { property: "og:description", content: "Manage THESTYLISHFLY wholesale orders and product catalog." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function AdminLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <AdminGate>
    <div className="min-h-screen bg-background">
      <header className="border-b-2 border-border bg-foreground text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-lg font-black tracking-wider">
              THESTYLISH<span className="text-[var(--brand-red)]">FLY</span>
            </Link>
            <span className="rounded-full bg-[var(--brand-red)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">Dashboard</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/admin" className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${path === "/admin" ? "bg-white text-foreground" : "text-white/80 hover:text-white"}`}>
              <ClipboardList className="h-4 w-4" /> Orders
            </Link>
            <Link to="/admin/products" className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${path.startsWith("/admin/products") ? "bg-white text-foreground" : "text-white/80 hover:text-white"}`}>
              <Package className="h-4 w-4" /> Products
            </Link>
            <Link to="/catalog" className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${path === "/catalog" ? "bg-white text-foreground" : "text-white/80 hover:text-white"}`}>
              <Store className="h-4 w-4" /> Catalog
            </Link>
            <button
              type="button"
              onClick={() => { clearAdminKey(); window.location.reload(); }}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white/80 hover:text-white"
              aria-label="Lock dashboard"
            >
              <LogOut className="h-4 w-4" /> Lock
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
    </AdminGate>
  );
}