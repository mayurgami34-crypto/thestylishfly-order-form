import { jsPDF } from "jspdf";
import type { CartItem } from "@/lib/cart";
import { fetchImageAsDataUrl } from "@/lib/pdf";
import { hexToRgb, resolveColorHex } from "@/lib/colors";
import { lineTotals, rateRange, sizeRate } from "@/lib/pricing";

export type MultiOrderData = {
  customerName: string;
  customerPhone: string;
  items: CartItem[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  netTotal: number;
  totalPieces: number;
  orderId?: string;
  date?: Date;
};

export async function generateMultiOrderPdf(data: MultiOrderData) {
  // Preload images in parallel with a per-image timeout so a slow / broken
  // image URL can never block the PDF (and therefore the WhatsApp handoff).
  const withTimeout = <T,>(p: Promise<T>, ms: number) =>
    Promise.race<T | undefined>([
      p.catch(() => undefined),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
    ]);
  const imgs = await Promise.all(
    data.items.map((it) =>
      it.imageUrl ? withTimeout(fetchImageAsDataUrl(it.imageUrl), 4000) : Promise.resolve(undefined),
    ),
  );

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const date = data.date ?? new Date();

  const drawHeader = () => {
    doc.setFillColor(17, 17, 17);
    doc.rect(0, 0, W, 84, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("THESTYLISH", M, 38);
    doc.setTextColor(193, 39, 45);
    doc.text("FLY", M + doc.getTextWidth("THESTYLISH"), 38);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("THE CLASSIC STYLE OF GIRL'S COLLECTION", M, 54);
    doc.setFontSize(7);
    doc.text("A Brand of AMBIKA GARMENT, Mumbai", M, 66);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("ORDER FORM", W - M, 38, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(date.toLocaleString("en-IN"), W - M, 54, { align: "right" });
    if (data.orderId)
      doc.text(`#${data.orderId.slice(0, 8).toUpperCase()}`, W - M, 66, { align: "right" });
  };

  drawHeader();

  // Bill-to block
  let y = 104;
  doc.setTextColor(17, 17, 17);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("BILL TO", M, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.customerName || "-", M, y + 14);
  doc.text(`WhatsApp: ${data.customerPhone || "-"}`, M, y + 26);

  doc.setFont("helvetica", "bold");
  doc.text("ITEMS", W - M, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(String(data.items.length), W - M, y + 14, { align: "right" });

  y += 46;

  // Table header
  const colX = {
    idx: M,
    img: M + 24,
    design: M + 108,
    details: M + 180,
    qty: W - M - 140,
    rate: W - M - 80,
    total: W - M,
  };

  const drawTableHeader = () => {
    doc.setFillColor(17, 17, 17);
    doc.rect(M, y, W - M * 2, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("#", colX.idx + 4, y + 15);
    doc.text("Photo", colX.img + 4, y + 15);
    doc.text("Design", colX.design, y + 15);
    doc.text("Colors / Sizes", colX.details, y + 15);
    doc.text("Qty", colX.qty, y + 15, { align: "right" });
    doc.text("Rate", colX.rate, y + 15, { align: "right" });
    doc.text("Amount", colX.total, y + 15, { align: "right" });
    doc.setTextColor(17, 17, 17);
    y += 22;
  };

  drawTableHeader();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  for (let i = 0; i < data.items.length; i++) {
    const it = data.items[i];
    const imgData = imgs[i];
    const { pieces, amount: lineTotal } = lineTotals(it.colorBreakdown, it.sizePrice, Number(it.price) || 0);
    const rates = rateRange(it.colorBreakdown, it.sizePrice, Number(it.price) || 0);

    // Build detail blocks (one per color) with a visual swatch
    const swatchGap = 13;
    const maxWidth = colX.qty - colX.details - 8 - swatchGap;
    const detailBlocks = it.colorBreakdown.map((cb) => {
      const sizeStr = Object.entries(cb.sizes)
        .filter(([, q]) => q > 0)
        .map(([s, q]) => `${s}:${q} @ Rs.${sizeRate(s, it.sizePrice, Number(it.price) || 0).toLocaleString("en-IN")}`)
        .join("  ");
      const text = `${cb.color} (${cb.pieces}) — ${sizeStr || "-"}`;
      return {
        hex: resolveColorHex(cb.color, (cb as { hex?: string }).hex),
        lines: doc.splitTextToSize(text, maxWidth) as string[],
      };
    });
    const wrappedLines = detailBlocks.flatMap((b) => b.lines);

    const imgH = 68;
    const textH = 14 + wrappedLines.length * 12;
    const rowH = Math.max(imgH + 8, textH + 8, 40);

    // page break
    if (y + rowH > H - 140) {
      doc.addPage();
      y = M;
      drawHeader();
      y = 104;
      drawTableHeader();
    }

    // Row background alt
    if (i % 2 === 0) {
      doc.setFillColor(248, 248, 248);
      doc.rect(M, y, W - M * 2, rowH, "F");
    }

    // Index
    doc.setFont("helvetica", "bold");
    doc.text(String(i + 1).padStart(2, "0"), colX.idx + 4, y + 16);

    // Image
    if (imgData) {
      try {
        const fmt = imgData.includes("image/png") ? "PNG" : "JPEG";
        doc.addImage(imgData, fmt, colX.img + 2, y + 4, 76, imgH);
        doc.setDrawColor(200, 200, 200);
        doc.rect(colX.img + 2, y + 4, 76, imgH);
      } catch {}
    } else {
      doc.setDrawColor(220, 220, 220);
      doc.rect(colX.img + 2, y + 4, 76, imgH);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("No image", colX.img + 40, y + 40, { align: "center" });
      doc.setTextColor(17, 17, 17);
      doc.setFontSize(9);
    }

    // Design
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`#${it.designNumber}`, colX.design, y + 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    // Description / fabric under design number
    if (it.description && it.description.trim()) {
      doc.setFontSize(7.5);
      doc.setTextColor(120, 120, 120);
      const descLines = doc.splitTextToSize(
        it.description.trim(),
        colX.details - colX.design - 6,
      ) as string[];
      let dy = y + 30;
      for (const line of descLines.slice(0, 4)) {
        doc.text(line, colX.design, dy);
        dy += 9;
      }
      doc.setTextColor(17, 17, 17);
      doc.setFontSize(9);
    }

    // Details with color swatches
    let ty = y + 14;
    for (const block of detailBlocks) {
      const [r, g, b] = hexToRgb(block.hex);
      doc.setFillColor(r, g, b);
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.5);
      doc.circle(colX.details + 4, ty - 3, 4, "FD");
      doc.setTextColor(17, 17, 17);
      block.lines.forEach((line, li) => {
        doc.text(line, colX.details + swatchGap, ty + li * 12);
      });
      ty += block.lines.length * 12;
    }

    // Qty / Rate / Total
    doc.setFont("helvetica", "bold");
    doc.text(String(pieces), colX.qty, y + 18, { align: "right" });
    doc.setFont("helvetica", "normal");
    if (rates.mixed) {
      doc.setFontSize(7.5);
      doc.text(`Rs. ${rates.min.toLocaleString("en-IN")} -`, colX.rate, y + 14, { align: "right" });
      doc.text(`Rs. ${rates.max.toLocaleString("en-IN")}`, colX.rate, y + 23, { align: "right" });
      doc.setFontSize(9);
    } else {
      doc.text(`Rs. ${rates.min.toLocaleString("en-IN")}`, colX.rate, y + 18, { align: "right" });
    }
    doc.setFont("helvetica", "bold");
    doc.text(`Rs. ${lineTotal.toLocaleString("en-IN")}`, colX.total, y + 18, { align: "right" });
    doc.setFont("helvetica", "normal");

    y += rowH;
    doc.setDrawColor(230, 230, 230);
    doc.line(M, y, W - M, y);
  }

  // Summary
  y += 20;
  if (y > H - 140) {
    doc.addPage();
    y = M;
  }
  const labelX = W - M - 220;
  const valX = W - M - 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Total Items", labelX, y);
  doc.text(String(data.items.length), valX, y, { align: "right" });
  y += 18;
  doc.text("Total Pieces", labelX, y);
  doc.text(String(data.totalPieces), valX, y, { align: "right" });
  y += 18;
  doc.text("Gross Total", labelX, y);
  doc.text(`Rs. ${data.subtotal.toLocaleString("en-IN")}`, valX, y, { align: "right" });
  y += 18;
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
    H - 28,
    { align: "center" },
  );
  doc.text("THESTYLISHFLY · A Brand of AMBIKA GARMENT, Mumbai", W / 2, H - 16, {
    align: "center",
  });

  return doc;
}