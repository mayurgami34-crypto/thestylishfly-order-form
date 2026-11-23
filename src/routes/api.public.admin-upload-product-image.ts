import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const sha1Hex = async (text: string) => {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-1", data);
  return toHex(hash);
};

const MOBILE_IMAGE_EXTENSIONS = /\.(avif|gif|heic|heif|jpeg|jpg|png|webp)$/i;

const isImageUpload = (file: File) => {
  const type = file.type.toLowerCase();
  return type.startsWith("image/") || MOBILE_IMAGE_EXTENSIONS.test(file.name);
};

const uploadToCloudinary = async (file: File, folder: string) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary is not configured");
  }
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // Signature: sha1 of "folder=...&timestamp=...{api_secret}"
  const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = await sha1Hex(toSign);

  const body = new FormData();
  body.append("file", file);
  body.append("api_key", apiKey);
  body.append("timestamp", timestamp);
  body.append("folder", folder);
  body.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body,
  });
  const result = (await res.json()) as { secure_url?: string; public_id?: string; error?: { message?: string } };
  if (!res.ok || !result.secure_url || !result.public_id) {
    throw new Error(result.error?.message || "Cloudinary upload failed");
  }
  return { url: result.secure_url, publicId: result.public_id };
};

export const Route = createFileRoute("/api/public/admin-upload-product-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const expectedKey = process.env["ADMIN_MASTER_KEY"];
        if (!expectedKey) return new Response("Admin master key is not configured", { status: 500 });
        if (String(form.get("masterKey") || "") !== expectedKey) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const file = form.get("file");
        const productId = String(form.get("productId") || "");
        const sortOrder = Number(form.get("sortOrder") || 0);
        if (!(file instanceof File)) return new Response("Image file is required", { status: 400 });
        if (!/^[0-9a-f-]{36}$/i.test(productId)) return new Response("Invalid product", { status: 400 });
        if (file.size > 20 * 1024 * 1024) return new Response("Image must be under 20 MB", { status: 400 });
        if (!isImageUpload(file)) return new Response("Only image uploads are allowed", { status: 400 });

        const { data: product, error: productError } = await supabaseAdmin
          .from("products")
          .select("id")
          .eq("id", productId)
          .maybeSingle();
        if (productError || !product) return new Response("Product not found", { status: 404 });

        let url: string;
        let publicId: string;
        try {
          const uploaded = await uploadToCloudinary(file, `products/${productId}`);
          url = uploaded.url;
          publicId = uploaded.publicId;
        } catch (err: any) {
          console.error("[cloudinary] upload failed", err);
          return new Response(`Image upload failed: ${err.message || "unknown error"}`, { status: 400 });
        }

        const { data: image, error: dbError } = await supabaseAdmin
          .from("product_images")
          .insert({ product_id: productId, url, storage_path: publicId, sort_order: Number.isFinite(sortOrder) ? sortOrder : 0 })
          .select("id, url, storage_path, sort_order")
          .single();
        if (dbError) {
          // best-effort rollback in Cloudinary
          try {
            const ts = Math.floor(Date.now() / 1000).toString();
            const sig = await sha1Hex(`public_id=${publicId}&timestamp=${ts}${process.env.CLOUDINARY_API_SECRET}`);
            const body = new FormData();
            body.append("public_id", publicId);
            body.append("api_key", process.env.CLOUDINARY_API_KEY!);
            body.append("timestamp", ts);
            body.append("signature", sig);
            await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/destroy`, { method: "POST", body });
          } catch {}
          return new Response(`Saving image record failed: ${dbError.message}`, { status: 400 });
        }

        return json({ image });
      },
    },
  },
});