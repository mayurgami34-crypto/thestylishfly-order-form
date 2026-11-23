import { jsPDF } from "jspdf";

export type ColorBreakdown = {
  color: string;
  sizes: Record<string, number>;
  pieces: number;
};

export type InvoiceData = {
  customerName: string;
  customerPhone: string;
  designNumber: string;
  rate: number;
  colorBreakdown: ColorBreakdown[];
  allSizes: string[];
  totalPieces: number;
  grossTotal: number;
  discountPct: number;
  discountAmount: number;
  netTotal: number;
  orderId?: string;
  date?: Date;
  imageDataUrl?: string;
  imageUrl?: string;
};

export function generateInvoicePdf(data: InvoiceData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const date = data.date ?? new Date();

  // Header band
  doc.setFillColor(17, 17, 17);
  doc.rect(0, 0, W, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("THESTYLISH", M, 42);
  doc.setTextColor(193, 39, 45);
  doc.text("FLY", M + doc.getTextWidth("THESTYLISH"), 42);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("THE CLASSIC STYLE OF GIRL'S COLLECTION", M, 60);
  doc.setFontSize(8);
  doc.text("A Brand of AMBIKA GARMENT, Mumbai", M, 74);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("ORDER FORM", W - M, 42, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(date.toLocaleString("en-IN"), W - M, 58, { align: "right" });
  if (data.orderId) doc.text(`#${data.orderId.slice(0, 8).toUpperCase()}`, W - M, 72, { align: "right" });

  // Product image + customer
  doc.setTextColor(17, 17, 17);
  let y = 110;
  const imgW = 110;
  const imgH = 140;
  const hasImg = !!data.imageDataUrl;
  if (hasImg) {
    try {
      const fmt = data.imageDataUrl!.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(data.imageDataUrl!, fmt, M, y, imgW, imgH);
      doc.setDrawColor(17, 17, 17);
      doc.setLineWidth(1);
      doc.rect(M, y, imgW, imgH);
    } catch {}
  }
  const infoX = hasImg ? M + imgW + 20 : M;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Design #${data.designNumber}`, infoX, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Rate / Pc: Rs. ${data.rate.toLocaleString("en-IN")}`, infoX, y + 34);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("BILL TO", infoX, y + 60);
  doc.setFont("helvetica", "normal");
  doc.text(data.customerName || "-", infoX, y + 76);
  doc.text(`WhatsApp: ${data.customerPhone || "-"}`, infoX, y + 90);

  y += (hasImg ? imgH : 100) + 20;

  // Color-wise size breakdown table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("COLOR-WISE SIZE BREAKDOWN", M, y);
  y += 10;
  doc.setDrawColor(17, 17, 17);
  doc.setLineWidth(1);
  doc.line(M, y, W - M, y);

  // Table header
  const sizes = data.allSizes;
  const tableW = W - M * 2;
  const colorColW = 110;
  const totalColW = 60;
  const sizeColW = Math.max(36, (tableW - colorColW - totalColW) / Math.max(sizes.length, 1));
  y += 16;
  doc.setFontSize(9);
  doc.text("Color", M + 6, y);
  sizes.forEach((s, i) => {
    doc.text(s, M + colorColW + i * sizeColW + sizeColW / 2, y, { align: "center" });
  });
  doc.text("Total", W - M - 6, y, { align: "right" });
  y += 6;
  doc.setLineWidth(0.5);
  doc.line(M, y, W - M, y);
  doc.setFont("helvetica", "normal");

  for (const cb of data.colorBreakdown) {
    y += 16;
    doc.text(cb.color, M + 6, y);
    sizes.forEach((s, i) => {
      const q = cb.sizes[s] || 0;
      doc.text(q ? String(q) : "-", M + colorColW + i * sizeColW + sizeColW / 2, y, { align: "center" });
    });
    doc.setFont("helvetica", "bold");
    doc.text(String(cb.pieces), W - M - 6, y, { align: "right" });
    doc.setFont("helvetica", "normal");
  }

  y += 8;
  doc.setLineWidth(1);
  doc.line(M, y, W - M, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Total Pieces", M + 6, y);
  doc.text(String(data.totalPieces), W - M - 6, y, { align: "right" });

  // Totals
  y += 36;
  const rowH = 22;
  const labelX = W - M - 200;
  const valX = W - M - 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Gross Total", labelX, y);
  doc.text(`Rs. ${data.grossTotal.toLocaleString("en-IN")}`, valX, y, { align: "right" });
  y += rowH;
  doc.text(`Discount (${data.discountPct}%)`, labelX, y);
  doc.text(`- Rs. ${data.discountAmount.toLocaleString("en-IN")}`, valX, y, { align: "right" });
  y += 12;
  doc.setFillColor(17, 17, 17);
  doc.rect(labelX - 12, y, W - M - (labelX - 12), 36, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("NET PAYABLE", labelX, y + 23);
  doc.setTextColor(255, 200, 100);
  doc.text(`Rs. ${data.netTotal.toLocaleString("en-IN")}`, valX, y + 23, { align: "right" });

  // Footer
  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    "Thank you for your order. Please confirm receipt via WhatsApp.",
    W / 2,
    doc.internal.pageSize.getHeight() - 30,
    { align: "center" },
  );
  doc.text("THESTYLISHFLY · Ambika Garment, Mumbai", W / 2, doc.internal.pageSize.getHeight() - 18, {
    align: "center",
  });

  return doc;
}

export function buildWhatsAppMessage(data: InvoiceData) {
  const colorBlocks = data.colorBreakdown
    .map((cb) => {
      const lines = Object.entries(cb.sizes)
        .filter(([, q]) => q > 0)
        .map(([s, q]) => `   • ${s}: ${q}`)
        .join("\n");
      return `*${cb.color}* (${cb.pieces} pcs)\n${lines}`;
    })
    .join("\n\n");
  return [
    "*THESTYLISHFLY*",
    "_The Classic Style of Girl's Collection_",
    "A Brand of AMBIKA GARMENT, Mumbai",
    "",
    `*Order${data.orderId ? ` #${data.orderId.slice(0, 8).toUpperCase()}` : ""}*`,
    `Customer: ${data.customerName}`,
    "",
    `*━━ DESIGN #${data.designNumber} ━━*`,
    data.imageUrl ? `Photo: ${data.imageUrl}` : "",
    "",
    colorBlocks || "  -",
    "",
    "*━━ PRICING ━━*",
    `Rate / Pc: Rs. ${data.rate}`,
    `Total Pieces: ${data.totalPieces}`,
    `Gross Total: Rs. ${data.grossTotal}`,
    `Discount (${data.discountPct}%): - Rs. ${data.discountAmount}`,
    "",
    `*NET PAYABLE: Rs. ${data.netTotal}*`,
    "",
    "_PDF invoice attached separately._",
  ].filter(Boolean).join("\n");
}

// Fetch an image and convert to a data URL so jsPDF can embed it.
export async function fetchImageAsDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}