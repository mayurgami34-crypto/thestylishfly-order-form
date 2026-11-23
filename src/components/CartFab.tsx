import { Link, useRouterState } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";

export function CartFab() {
  const { totalItems, totalPieces } = useCart();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Hide on cart page or admin pages
  if (pathname === "/cart" || pathname.startsWith("/admin")) return null;
  if (totalItems === 0) return null;

  return (
    <Link
      to="/cart"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-foreground px-5 py-3 text-white shadow-[var(--shadow-elegant)] hover:opacity-95"
    >
      <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-red)]">
        <ShoppingCart className="h-4 w-4" />
      </span>
      <span className="text-sm font-bold uppercase tracking-wider">
        Cart ({totalItems} {totalItems === 1 ? "item" : "items"})
      </span>
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold">{totalPieces} pcs</span>
    </Link>
  );
}