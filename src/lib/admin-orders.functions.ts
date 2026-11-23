import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Orders hold customer names/phones, so all reads/writes go through the
 * master-key protected server layer — never straight from the browser. */
export const listOrdersAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ masterKey: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { assertMasterKey } = await import("@/lib/admin-key.server");
    assertMasterKey(data.masterKey);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { orders: rows ?? [] };
  });

export const deleteOrderAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ masterKey: z.string().min(1), id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { assertMasterKey } = await import("@/lib/admin-key.server");
    assertMasterKey(data.masterKey);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
