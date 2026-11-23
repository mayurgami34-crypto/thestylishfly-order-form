import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

export function BrandHeader() {
  return (
    <header className="text-white" style={{ background: "var(--gradient-brand)" }}>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link
          to="/catalog"
          className="rounded-md bg-white/15 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white backdrop-blur-sm transition-colors hover:bg-white/25 active:bg-white/30 sm:text-base"
        >
          ← Catalog
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/admin"
            className="rounded-md bg-white/15 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white backdrop-blur-sm transition-colors hover:bg-white/25 active:bg-white/30 sm:text-base"
          >
            Dashboard
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 pb-6 pt-2 text-center">
        <h1 className="text-3xl font-black tracking-[0.18em] sm:text-4xl">
          <Link to="/admin">
            THESTYLISH<span className="text-[var(--brand-red)]">FLY</span>
          </Link>
        </h1>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.25em] text-white/80 sm:text-sm">
          The Classic Style of Girl's Collection
        </p>
        <div className="mt-3 inline-block border-t border-white/20 pt-2 text-[11px] uppercase tracking-widest text-white/70">
          A Brand of Ambika Garment · Mumbai
        </div>
      </div>
    </header>
  );
}

export function AdminBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-red)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
      <ShieldCheck className="h-3 w-3" /> Admin
    </span>
  );
}

export function LogoutButton() {
  return (
    <Link to="/admin" className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent">
      Dashboard
    </Link>
  );
}
