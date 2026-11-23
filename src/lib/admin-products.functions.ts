import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const hexMap = z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/));
const sizePriceMap = z.record(z.string(), z.number().min(0).max(10_000_000));

const saveInput = z.object({
  masterKey: z.string().min(1),
  id: z.string().uuid().optional().nullable(),
  design_number: z.string().min(1).max(60),
  price: z.number().min(0).max(10_000_000),
  net_price: z.number().min(0).max(10_000_000).optional().default(0),
  colors: z.array(z.string().min(1).max(60)).max(80),
  color_hex: hexMap,
  sizes: z.array(z.string().min(1).max(20)).max(60),
  size_price: sizePriceMap.optional().default({}),
  size_net_price: sizePriceMap.optional().default({}),
  description: z.string().max(2000).nullable().optional(),
  out_of_stock: z.boolean().optional().default(false),
  stock_qty: z.number().int().min(0).max(10_000_000).nullable().optional(),
  restock_days: z.number().int().min(0).max(3650).nullable().optional(),
  restock_note: z.string().max(500).nullable().optional(),
});

export const saveProductAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => saveInput.parse(d))
  .handler(async ({ data }) => {
    const { assertMasterKey } = await import("@/lib/admin-key.server");
    assertMasterKey(data.masterKey);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload = {
      design_number: data.design_number,
      price: data.price,
      net_price: data.net_price ?? 0,
      colors: data.colors,
      color_hex: data.color_hex,
      sizes: data.sizes,
      size_price: data.size_price ?? {},
      size_net_price: data.size_net_price ?? {},
      description: data.description ?? null,
      out_of_stock: data.out_of_stock ?? false,
      stock_qty: data.stock_qty ?? null,
      restock_days: data.restock_days ?? null,
      restock_note: data.restock_note?.trim() || null,
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("products").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id, created: false };
    }
    const { data: row, error } = await supabaseAdmin
      .from("products")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, created: true };
  });

export const deleteProductAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ masterKey: z.string().min(1), id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { assertMasterKey } = await import("@/lib/admin-key.server");
    assertMasterKey(data.masterKey);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProductImageAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ masterKey: z.string().min(1), id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { assertMasterKey } = await import("@/lib/admin-key.server");
    assertMasterKey(data.masterKey);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("product_images").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });