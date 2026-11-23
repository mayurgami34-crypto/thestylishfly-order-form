import type { Tables } from "@/integrations/supabase/types";

export type CachedOrder = Tables<"orders">;

export const ORDER_CACHE_KEY = "tsf_orders_cache_v1";
export const ORDER_UPDATED_EVENT = "tsf-orders-updated";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function sortOrders(orders: CachedOrder[]) {
  return [...orders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function readCachedOrders(): CachedOrder[] {
  if (!canUseStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ORDER_CACHE_KEY) || "[]");
    return Array.isArray(parsed) ? sortOrders(parsed as CachedOrder[]) : [];
  } catch {
    return [];
  }
}

export function rememberOrder(order: CachedOrder) {
  if (!canUseStorage()) return;
  try {
    const existing = readCachedOrders().filter((item) => item.id !== order.id);
    window.localStorage.setItem(ORDER_CACHE_KEY, JSON.stringify(sortOrders([order, ...existing])));
    window.dispatchEvent(new Event(ORDER_UPDATED_EVENT));
  } catch (error) {
    console.error("Order cache update failed:", error);
  }
}

export function forgetOrder(id: string) {
  if (!canUseStorage()) return;
  try {
    const remaining = readCachedOrders().filter((item) => item.id !== id);
    window.localStorage.setItem(ORDER_CACHE_KEY, JSON.stringify(remaining));
    window.dispatchEvent(new Event(ORDER_UPDATED_EVENT));
  } catch (error) {
    console.error("Order cache remove failed:", error);
  }
}

export function subscribeToOrderUpdates(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key === ORDER_CACHE_KEY) callback();
  };

  window.addEventListener(ORDER_UPDATED_EVENT, callback);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(ORDER_UPDATED_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}