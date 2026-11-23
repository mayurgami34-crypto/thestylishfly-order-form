import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { COLOR_PRESETS, SIZES, inr } from "@/lib/format";
import { resolveColorHex, safeColorHexMap, type ColorHexMap } from "@/lib/colors";
import { safeSizePriceMap, type SizePriceMap } from "@/lib/pricing";
import { getAdminKey } from "@/lib/admin-gate";
import { saveProductAdmin, deleteProductAdmin, deleteProductImageAdmin } from "@/lib/admin-products.functions";
import { Plus, Upload, Trash2, X, ImagePlus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/products")({
  component: AdminProducts,
  head: () => ({ meta: [
    { title: "Product Management — THESTYLISHFLY" },
    { name: "description", content: "Manage THESTYLISHFLY designs, prices, stock, restock timing, and product photos." },
    { property: "og:title", content: "Product Management — THESTYLISHFLY" },
    { property: "og:description", content: "Manage THESTYLISHFLY wholesale catalog products and stock details." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

type ProductImage = { id: string; url: string; storage_path: string | null; sort_order: number };
type PendingImage = {
  id: string;
  file: File;
  previewUrl: string;
  revokePreview: boolean;
};
type Product = {
  id: string;
  design_number: string;
  price: number;
  colors: string[];
  color_hex?: Record<string, string> | null;
  sizes: string[];
  size_price?: Record<string, number> | null;
  net_price?: number | null;
  size_net_price?: Record<string, number> | null;
  images?: string[] | null;
  description: string | null;
  out_of_stock?: boolean | null;
  stock_qty?: number | null;
  restock_days?: number | null;
  restock_note?: string | null;
  product_images: ProductImage[];
};

const DEFAULT_FORM = {
  id: "" as string | "",
  design_number: "",
  price: 0,
  net_price: 0,
  colors: [] as string[],
  color_hex: {} as ColorHexMap,
  sizes: [...SIZES] as string[],
  size_price: {} as SizePriceMap,
  size_net_price: {} as SizePriceMap,
  description: "",
  out_of_stock: false,
  stock_qty: "" as string,
  restock_days: "" as string,
  restock_note: "",
};

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MOBILE_IMAGE_EXTENSIONS = /\.(avif|gif|heic|heif|jpeg|jpg|png|webp)$/i;

const isLikelyImageFile = (file: File) => file.type.startsWith("image/") || MOBILE_IMAGE_EXTENSIONS.test(file.name);

const createImagePreview = (file: File) => {
  try {
    return Promise.resolve({ previewUrl: URL.createObjectURL(file), revokePreview: true });
  } catch {
    return new Promise<{ previewUrl: string; revokePreview: boolean }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ previewUrl: String(reader.result), revokePreview: false });
      reader.onerror = () => reject(reader.error ?? new Error("Could not read selected image"));
      reader.readAsDataURL(file);
    });
  }
};

// Product images are uploaded to Cloudinary via a server route that holds the
// signing secret. The returned secure_url is stored in product_images.url and
// the Cloudinary public_id is stored in product_images.storage_path so we can
// delete the asset later.

function AdminProducts() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [existingImages, setExistingImages] = useState<ProductImage[]>([]);
  const [customColor, setCustomColor] = useState("");
  const [customColorHex, setCustomColorHex] = useState("#000080");
  const [customSize, setCustomSize] = useState("");
  const [saving, setSaving] = useState(false);
  const pendingImagesRef = useRef<PendingImage[]>([]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("products")
      .select("*, product_images(*)")
      .order("created_at", { ascending: false });
    setItems((data as Product[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  useEffect(
    () => () => {
      pendingImagesRef.current.forEach((img) => {
        if (img.revokePreview) URL.revokeObjectURL(img.previewUrl);
      });
    },
    [],
  );

  const clearPendingImages = () => {
    setPendingImages((prev) => {
      prev.forEach((img) => {
        if (img.revokePreview) URL.revokeObjectURL(img.previewUrl);
      });
      return [];
    });
  };

  const resetForm = () => {
    setForm({ ...DEFAULT_FORM });
    clearPendingImages();
    setExistingImages([]);
  };

  const editProduct = (p: Product) => {
    setForm({
      id: p.id,
      design_number: p.design_number,
      price: Number(p.price),
      net_price: Number(p.net_price ?? 0),
      colors: p.colors,
      color_hex: safeColorHexMap(p.color_hex),
      sizes: p.sizes,
      size_price: safeSizePriceMap(p.size_price),
      size_net_price: safeSizePriceMap(p.size_net_price),
      description: p.description ?? "",
      out_of_stock: Boolean(p.out_of_stock),
      stock_qty: typeof p.stock_qty === "number" ? String(p.stock_qty) : "",
      restock_days: typeof p.restock_days === "number" ? String(p.restock_days) : "",
      restock_note: p.restock_note ?? "",
    });
    setExistingImages([...p.product_images].sort((a, b) => a.sort_order - b.sort_order));
    clearPendingImages();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleColor = (c: string) =>
    setForm((f) => {
      if (f.colors.includes(c)) {
        const { [c]: _removed, ...rest } = f.color_hex;
        return { ...f, colors: f.colors.filter((x) => x !== c), color_hex: rest };
      }
      return {
        ...f,
        colors: [...f.colors, c],
        color_hex: { ...f.color_hex, [c]: f.color_hex[c] ?? resolveColorHex(c) },
      };
    });

  const setColorHex = (name: string, hex: string) =>
    setForm((f) => ({ ...f, color_hex: { ...f.color_hex, [name]: hex } }));
  const toggleSize = (s: string) =>
    setForm((f) => {
      if (f.sizes.includes(s)) {
        const { [s]: _removed, ...rest } = f.size_price;
        const { [s]: _removedNet, ...restNet } = f.size_net_price;
        return { ...f, sizes: f.sizes.filter((x) => x !== s), size_price: rest, size_net_price: restNet };
      }
      return { ...f, sizes: [...f.sizes, s] };
    });

  const setSizePrice = (size: string, value: number) =>
    setForm((f) => {
      const next = { ...f.size_price };
      if (value > 0) next[size] = value;
      else delete next[size];
      return { ...f, size_price: next };
    });

  const setSizeNetPrice = (size: string, value: number) =>
    setForm((f) => {
      const next = { ...f.size_net_price };
      if (value > 0) next[size] = value;
      else delete next[size];
      return { ...f, size_net_price: next };
    });

  const addCustomColor = () => {
    const c = customColor.trim();
    if (c && !form.colors.includes(c))
      setForm((f) => ({
        ...f,
        colors: [...f.colors, c],
        color_hex: { ...f.color_hex, [c]: customColorHex },
      }));
    setCustomColor("");
  };
  const addCustomSize = () => {
    const s = customSize.trim().toUpperCase();
    if (s && !form.sizes.includes(s)) setForm((f) => ({ ...f, sizes: [...f.sizes, s] }));
    setCustomSize("");
  };

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFiles = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";

    if (pickedFiles.length === 0) return;

    const acceptedFiles = pickedFiles.filter((file) => file.size > 0 && file.size <= MAX_IMAGE_BYTES && isLikelyImageFile(file));
    const rejectedCount = pickedFiles.length - acceptedFiles.length;

    if (rejectedCount > 0) {
      toast.error(`Skipped ${rejectedCount} file${rejectedCount > 1 ? "s" : ""}. Use image files under 20 MB.`);
    }
    if (acceptedFiles.length === 0) return;

    try {
      const previews = await Promise.all(
        acceptedFiles.map(async (file, index) => {
          const preview = await createImagePreview(file);
          return {
            id: `${Date.now()}-${index}-${file.name || "mobile-image"}-${file.size}`,
            file,
            ...preview,
          };
        }),
      );
      setPendingImages((prev) => [...prev, ...previews]);
    } catch (err: any) {
      toast.error(err.message || "Could not read selected image");
    }
  };

  const removePending = (id: string) =>
    setPendingImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target?.revokePreview) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });

  const removeExistingImage = async (img: ProductImage) => {
    if (!confirm("Remove this image?")) return;
    try {
      await deleteProductImageAdmin({ data: { masterKey: getAdminKey(), id: img.id } });
      setExistingImages((p) => p.filter((x) => x.id !== img.id));
      toast.success("Image removed");
    } catch (err: any) {
      toast.error(err?.message || "Could not remove image");
    }
  };

  const uploadViaServer = async (productId: string, pendingImage: PendingImage, sortOrder: number) => {
    const body = new FormData();
    body.append("productId", productId);
    body.append("sortOrder", String(sortOrder));
    body.append("masterKey", getAdminKey());
    body.append("file", pendingImage.file, pendingImage.file.name || `product-${productId}-${sortOrder}.jpg`);

    const res = await fetch("/api/public/admin-upload-product-image", {
      method: "POST",
      body,
    });
    if (!res.ok) {
      const message = await res.text();
      throw new Error(message || "Image upload failed");
    }
    const json = (await res.json()) as { image: ProductImage };
    return json.image;
  };

  const uploadImagesFor = async (productId: string, startSort: number) => {
    const uploaded: ProductImage[] = [];
    for (let i = 0; i < pendingImages.length; i++) {
      uploaded.push(await uploadViaServer(productId, pendingImages[i], startSort + i));
    }
    return uploaded;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.design_number.trim()) return toast.error("Design number is required");
    if (form.price <= 0) return toast.error("Price must be greater than 0");
    if (form.colors.length === 0) return toast.error("Please add at least one color");
    if (form.sizes.length === 0) return toast.error("Please add at least one size");

    setSaving(true);
    let createdProductId: string | null = null;
    try {
      const saved = await saveProductAdmin({
        data: {
          masterKey: getAdminKey(),
          id: form.id || null,
          design_number: form.design_number,
          price: form.price,
          net_price: form.net_price || 0,
          colors: form.colors,
          color_hex: Object.fromEntries(form.colors.map((c) => [c, form.color_hex[c] ?? resolveColorHex(c)])),
          sizes: form.sizes,
          size_price: Object.fromEntries(
            form.sizes
              .filter((s) => Number(form.size_price[s]) > 0)
              .map((s) => [s, Number(form.size_price[s])]),
          ),
          size_net_price: Object.fromEntries(
            form.sizes
              .filter((s) => Number(form.size_net_price[s]) > 0)
              .map((s) => [s, Number(form.size_net_price[s])]),
          ),
          description: form.description || null,
          out_of_stock: form.out_of_stock,
          stock_qty: form.stock_qty.trim() === "" ? null : Math.max(0, Math.round(Number(form.stock_qty) || 0)),
          restock_days: form.restock_days.trim() === "" ? null : Math.max(0, Math.round(Number(form.restock_days) || 0)),
          restock_note: form.restock_note.trim() || null,
        },
      });
      const productId = saved.id;
      if (saved.created) createdProductId = saved.id;
      if (pendingImages.length > 0) {
        const uploaded = await uploadImagesFor(productId, existingImages.length);
        setExistingImages((prev) => [...prev, ...uploaded].sort((a, b) => a.sort_order - b.sort_order));
        clearPendingImages();
      }
      toast.success(form.id ? "Product updated" : "Product created");
      resetForm();
      load();
    } catch (err: any) {
      if (createdProductId) {
        try {
          await deleteProductAdmin({ data: { masterKey: getAdminKey(), id: createdProductId } });
        } catch {}
      }
      toast.error(err.message || "Failed to save");
      load();
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (p: Product) => {
    if (!confirm(`Delete design #${p.design_number}? This will remove all its images.`)) return;
    try {
      await deleteProductAdmin({ data: { masterKey: getAdminKey(), id: p.id } });
      toast.success("Product deleted");
    } catch (err: any) {
      toast.error(err?.message || "Could not delete product");
    }
    load();
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      {/* Form */}
      <Card className="overflow-hidden border-2">
        <div className="flex items-center justify-between bg-foreground px-5 py-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white">
            {form.id ? `Edit Design #${form.design_number}` : "Add New Product"}
          </h2>
          {form.id && (
            <button onClick={resetForm} className="text-xs text-white/70 hover:text-white">
              Cancel edit
            </button>
          )}
        </div>
        <form onSubmit={save} className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Design Number</Label>
              <Input value={form.design_number} onChange={(e) => setForm({ ...form, design_number: e.target.value })} placeholder="e.g. 402" />
            </div>
            <div className="space-y-2">
              <Label>Base Price (₹ per pc)</Label>
              <Input type="number" min={0} value={form.price || ""} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} placeholder="0" />
              <p className="text-[11px] text-muted-foreground">Used for any size without its own rate below.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Net / Wholesale Price (₹ per pc) — optional</Label>
            <Input
              type="number"
              min={0}
              value={form.net_price || ""}
              onChange={(e) => setForm({ ...form, net_price: parseFloat(e.target.value) || 0 })}
              placeholder="Leave blank if same as base price"
            />
            <p className="text-[11px] text-muted-foreground">
              Used only when the catalog PDF is generated with “Manual Net Rates”.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Fabric, fit, occasion…" />
          </div>

          <div className="space-y-2">
            <Label>Stock Quantity (pcs) — optional</Label>
            <Input
              type="number"
              min={0}
              value={form.stock_qty}
              onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
              placeholder="e.g. 120 — leave blank to hide stock"
            />
            <p className="text-[11px] text-muted-foreground">
              Shown in the catalog and printed on the PDF you share with customers.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Restock in Days — optional</Label>
              <Input
                type="number"
                min={0}
                max={3650}
                inputMode="numeric"
                value={form.restock_days}
                onChange={(e) => setForm({ ...form, restock_days: e.target.value })}
                placeholder="e.g. 15"
              />
              <p className="text-[11px] text-muted-foreground">Shows customers when fresh stock is expected.</p>
            </div>
            <div className="space-y-2">
              <Label>Restock Note — optional</Label>
              <Textarea
                rows={3}
                maxLength={500}
                value={form.restock_note}
                onChange={(e) => setForm({ ...form, restock_note: e.target.value })}
                placeholder="e.g. A similar design will be available."
              />
              <p className="text-[11px] text-muted-foreground">Printed below the restock timing in the shared PDF.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, out_of_stock: !f.out_of_stock }))}
            aria-pressed={form.out_of_stock}
            className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-colors ${
              form.out_of_stock ? "border-[var(--brand-red)] bg-[var(--brand-red)]/10" : "border-border"
            }`}
          >
            <span>
              <span className="block text-sm font-bold">Mark as OUT OF STOCK</span>
              <span className="block text-[11px] text-muted-foreground">
                Shows an “Out of Stock” badge in the catalog and on the shared PDF.
              </span>
            </span>
            <span
              className={`ml-3 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                form.out_of_stock ? "bg-[var(--brand-red)]" : "bg-muted"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  form.out_of_stock ? "translate-x-5" : ""
                }`}
              />
            </span>
          </button>

          <div className="space-y-2">
            <Label>Available Colors</Label>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set([...COLOR_PRESETS.map((c) => c.name), ...form.colors])).map((name) => {
                const active = form.colors.includes(name);
                const swatch = resolveColorHex(name, form.color_hex[name]);
                return (
                  <button key={name} type="button" onClick={() => toggleColor(name)} className={`flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-sm ${active ? "border-[var(--brand-red)] bg-[var(--brand-red)] text-white" : "border-border hover:border-foreground"}`}>
                    <span className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ backgroundColor: swatch }} />
                    {name}
                  </button>
                );
              })}
            </div>

            {form.colors.length > 0 && (
              <div className="space-y-2 rounded-xl border-2 border-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pick the exact shade for each selected color
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {form.colors.map((name) => {
                    const hex = resolveColorHex(name, form.color_hex[name]);
                    return (
                      <div key={name} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                        <input
                          type="color"
                          aria-label={`Hex color for ${name}`}
                          value={hex}
                          onChange={(e) => setColorHex(name, e.target.value)}
                          className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                        />
                        <span className="flex-1 truncate text-sm font-semibold">{name}</span>
                        <span className="font-mono text-[11px] uppercase text-muted-foreground">{hex}</span>
                        <button type="button" onClick={() => toggleColor(name)} aria-label={`Remove ${name}`} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Custom color hex"
                value={customColorHex}
                onChange={(e) => setCustomColorHex(e.target.value)}
                className="h-10 w-12 shrink-0 cursor-pointer rounded-md border-2 border-border bg-transparent p-0.5"
              />
              <Input placeholder="Add custom color…" value={customColor} onChange={(e) => setCustomColor(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomColor(); } }} />
              <Button type="button" variant="outline" onClick={addCustomColor}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Available Sizes</Label>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set([...SIZES, ...form.sizes])).map((s) => {
                const active = form.sizes.includes(s);
                return (
                  <button key={s} type="button" onClick={() => toggleSize(s)} className={`rounded-full border-2 px-3 py-1.5 text-sm font-bold ${active ? "border-[var(--brand-red)] bg-[var(--brand-red)] text-white" : "border-border hover:border-foreground"}`}>
                    {s}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input placeholder="Add custom size (e.g. 4XL)" value={customSize} onChange={(e) => setCustomSize(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomSize(); } }} />
              <Button type="button" variant="outline" onClick={addCustomSize}><Plus className="h-4 w-4" /></Button>
            </div>

            {form.sizes.length > 0 && (
              <div className="space-y-2 rounded-xl border-2 border-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Size-wise standard &amp; net rate (leave blank to use base / net price)
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {form.sizes.map((s) => (
                    <div key={s} className="space-y-1.5 rounded-lg border border-border px-2 py-2">
                      <span className="text-sm font-black">{s}</span>
                      <div className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-[11px] font-semibold uppercase text-muted-foreground">Std ₹</span>
                        <Input
                          type="number"
                          min={0}
                          inputMode="decimal"
                          aria-label={`Standard price for size ${s}`}
                          value={form.size_price[s] || ""}
                          onChange={(e) => setSizePrice(s, parseFloat(e.target.value) || 0)}
                          placeholder={String(form.price || 0)}
                          className="h-9"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-[11px] font-semibold uppercase text-[var(--brand-red)]">Net ₹</span>
                        <Input
                          type="number"
                          min={0}
                          inputMode="decimal"
                          aria-label={`Net price for size ${s}`}
                          value={form.size_net_price[s] || ""}
                          onChange={(e) => setSizeNetPrice(s, parseFloat(e.target.value) || 0)}
                          placeholder={String(form.net_price || form.size_price[s] || form.price || 0)}
                          className="h-9"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Product Images</Label>
            <div className="flex flex-wrap gap-3">
              {existingImages.map((img) => (
                <div key={img.id} className="relative h-24 w-24 overflow-hidden rounded-lg border-2 border-border">
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => removeExistingImage(img)} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {pendingImages.map((f, i) => (
                <div key={f.id} className="relative h-24 w-24 overflow-hidden rounded-lg border-2 border-dashed border-[var(--brand-red)]">
                  <img src={f.previewUrl} alt="Selected product preview" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => removePending(f.id)} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-xs text-muted-foreground hover:border-foreground hover:text-foreground">
                <ImagePlus className="h-5 w-5" />
                Add
                <input type="file" accept="image/*,.heic,.heif,.avif" multiple className="sr-only" onChange={onPickFiles} />
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {form.id && (
              <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
            )}
            <Button type="submit" variant="brand" size="lg" disabled={saving} className="font-bold">
              <Upload className="h-4 w-4" />
              {saving ? "Saving…" : form.id ? "Update Product" : "Create Product"}
            </Button>
          </div>
        </form>
      </Card>

      {/* List */}
      <Card className="overflow-hidden border-2">
        <div className="bg-foreground px-5 py-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white">All Products ({items.length})</h2>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No products yet. Add your first design above.</div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => {
              const img = [...p.product_images].sort((a, b) => a.sort_order - b.sort_order)[0]?.url;
              return (
                <div key={p.id} className="overflow-hidden rounded-xl border-2 border-border">
                  <div className="aspect-[4/3] bg-muted">
                    {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-black">#{p.design_number}</div>
                      <div className="text-base font-black text-[var(--brand-red)]">{inr(Number(p.price))}</div>
                    </div>
                    {p.out_of_stock && (
                      <div className="inline-block rounded-full bg-[var(--brand-red)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                        Out of Stock
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      {p.colors.length} colors · {p.sizes.length} sizes · {p.product_images.length} images
                      {typeof p.stock_qty === "number" ? ` · ${p.stock_qty} pcs stock` : ""}
                      {typeof p.restock_days === "number" ? ` · restock in ${p.restock_days} days` : ""}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => editProduct(p)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteProduct(p)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </main>
  );
}