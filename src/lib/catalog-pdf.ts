import { jsPDF } from "jspdf";
import { fetchImageAsDataUrl } from "@/lib/pdf";
import { hexToRgb, resolveColorHex, type ColorHexMap } from "@/lib/colors";
import { priceGroups, type SizePriceMap } from "@/lib/pricing";

export type CatalogProduct = {
  design_number: string;
  price: number;
  colors?: string[];
  sizes?: string[];
  imageUrl?: string;
  colorHex?: ColorHexMap;
  sizePrice?: SizePriceMap;
  outOfStock?: boolean;
  stockQty?: number | null;
  restockDays?: number | null;
  restockNote?: string;
};

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race<T | undefined>([
    p.catch(() => undefined),
    new Promise<undefined>((r) => setTimeout(() => r(undefined), ms)),
  ]);

export type CatalogLayout = "one" | "three";

export async function generateCatalogPdf(
  products: CatalogProduct[],
  layout: CatalogLayout = "three",
  netBadgeLabel?: string,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;

  // Preload images with per-image timeout — never blocks
  let imgs: (string | undefined)[] = [];
  try {
    imgs = await Promise.all(
      products.map((p) =>
        p.imageUrl ? withTimeout(fetchImageAsDataUrl(p.imageUrl), 3500) : Promise.resolve(undefined),
      ),
    );
  } catch {
    imgs = products.map(() => undefined);
  }

  const drawHeader = (pageNum: number, totalPages: number) => {
    doc.setFillColor(17, 17, 17);
    doc.rect(0, 0, W, 78, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("THESTYLISH", M, 36);
    doc.setTextColor(193, 39, 45);
    doc.text("FLY", M + doc.getTextWidth("THESTYLISH"), 36);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("WHOLESALE COLLECTION", M, 52);
    doc.setFontSize(7.5);
    doc.text("A Brand of AMBIKA GARMENT, Mumbai", M, 65);
    if (netBadgeLabel) {
      const label = netBadgeLabel.toUpperCase();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const padX = 8;
      const bw = doc.getTextWidth(label) + padX * 2;
      const bh = 18;
      const bx = W / 2 - bw / 2;
      const by = 30;
      doc.setFillColor(193, 39, 45);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.8);
      doc.roundedRect(bx, by, bw, bh, 4, 4, "FD");
      doc.setTextColor(255, 255, 255);
      doc.text(label, W / 2, by + 12.5, { align: "center" });
    }
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text("CATALOG", W - M, 36, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(new Date().toLocaleDateString("en-IN"), W - M, 52, { align: "right" });
    doc.text(`Page ${pageNum} / ${totalPages}`, W - M, 65, { align: "right" });
    doc.setTextColor(17, 17, 17);
  };

  const drawFooter = () => {
    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(
      "THESTYLISHFLY · Ambika Garment, Mumbai · Contact us on WhatsApp to place a wholesale order.",
      W / 2,
      H - 18,
      { align: "center" },
    );
    doc.setTextColor(17, 17, 17);
  };

  // Single-column list layout: large image on left, details on right
  const topY = 96;
  const bottomY = H - 40;
  const gap = 18;
  const usableH = bottomY - topY;
  const single = layout === "one";
  const rowH = single ? usableH : 200; // full card height per product
  const imgW = single ? 260 : 160;
  const imgH = single ? Math.min(rowH - 20, 300) : rowH - 20;
  const s = single ? 1.35 : 1; // font scale

  // Compute total pages up-front for header page numbers
  const perPage = single ? 1 : Math.max(1, Math.floor((usableH + gap) / (rowH + gap)));
  const totalPages = Math.max(1, Math.ceil(products.length / perPage));

  let pageNum = 1;
  let y = topY;
  drawHeader(pageNum, totalPages);
  drawFooter();

  for (let i = 0; i < products.length; i++) {
    // Page break if row won't fit
    if (y + rowH > bottomY) {
      doc.addPage();
      pageNum += 1;
      drawHeader(pageNum, totalPages);
      drawFooter();
      y = topY;
    }

    const p = products[i];
    const imgData = imgs[i];
    const cardX = M;
    const cardY = y;
    const cardW = W - M * 2;

    // Card outline
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.8);
    doc.rect(cardX, cardY, cardW, rowH);

    // Image on the left
    const imgX = cardX + 10;
    const imgY = cardY + 10;
    try {
      if (imgData) {
        const fmt = imgData.includes("image/png") ? "PNG" : "JPEG";
        doc.addImage(imgData, fmt, imgX, imgY, imgW, imgH);
        doc.setDrawColor(210, 210, 210);
        doc.rect(imgX, imgY, imgW, imgH);
      } else {
        doc.setFillColor(245, 245, 245);
        doc.rect(imgX, imgY, imgW, imgH, "F");
        doc.setTextColor(160, 160, 160);
        doc.setFontSize(10);
        doc.text("No image", imgX + imgW / 2, imgY + imgH / 2, { align: "center" });
        doc.setTextColor(17, 17, 17);
      }
    } catch {
      doc.setFillColor(245, 245, 245);
      doc.rect(imgX, imgY, imgW, imgH, "F");
    }

    // Out of stock stamp across the photo
    if (p.outOfStock) {
      const stampH = single ? 30 : 22;
      const stampY = imgY + imgH / 2 - stampH / 2;
      doc.setFillColor(193, 39, 45);
      doc.rect(imgX, stampY, imgW, stampH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(single ? 15 : 11);
      doc.setTextColor(255, 255, 255);
      doc.text("OUT OF STOCK", imgX + imgW / 2, stampY + stampH / 2 + (single ? 5 : 4), { align: "center" });
      doc.setTextColor(17, 17, 17);
    }

    // Details on the right
    const tx = imgX + imgW + gap;
    const textMaxW = cardX + cardW - tx - 14;
    let ty = cardY + (single ? 44 : 30);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20 * s);
    doc.setTextColor(17, 17, 17);
    doc.text(`Design #${p.design_number}`, tx, ty);

    if (p.outOfStock) {
      const dw = doc.getTextWidth(`Design #${p.design_number}`);
      const label = "OUT OF STOCK";
      doc.setFontSize(8.5 * s);
      const bw = doc.getTextWidth(label) + 12;
      const bh = 15 * s;
      doc.setFillColor(193, 39, 45);
      doc.roundedRect(tx + dw + 10, ty - bh + 3.5 * s, bw, bh, 3, 3, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(label, tx + dw + 10 + bw / 2, ty - bh / 2 + 6 * s, { align: "center" });
      doc.setTextColor(17, 17, 17);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20 * s);
    }


    ty += 26 * s;
    doc.setTextColor(193, 39, 45);
    doc.setFontSize(18 * s);
    const groups = priceGroups(p.sizes ?? [], p.sizePrice, Number(p.price) || 0);
    const mixed = groups.length > 1;
    const priceLabel = mixed
      ? `Rs. ${groups[0].rate.toLocaleString("en-IN")} - ${groups[groups.length - 1].rate.toLocaleString("en-IN")}`
      : `Rs. ${(groups[0]?.rate ?? (Number(p.price) || 0)).toLocaleString("en-IN")}`;
    doc.text(priceLabel, tx, ty);
    const priceW = doc.getTextWidth(priceLabel);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8 * s);
    doc.setTextColor(120, 120, 120);
    doc.text("per piece (wholesale)", tx + priceW + 8, ty);
    doc.setTextColor(17, 17, 17);

    if (typeof p.stockQty === "number" && Number.isFinite(p.stockQty)) {
      ty += 16 * s;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5 * s);
      if (p.stockQty <= 0) {
        doc.setTextColor(193, 39, 45);
        doc.text("STOCK: NOT AVAILABLE", tx, ty);
      } else {
        doc.setTextColor(30, 120, 60);
        doc.text(`STOCK AVAILABLE: ${p.stockQty.toLocaleString("en-IN")} pcs`, tx, ty);
      }
      doc.setTextColor(17, 17, 17);
      doc.setFont("helvetica", "normal");
    }

    if (typeof p.restockDays === "number" && Number.isFinite(p.restockDays)) {
      ty += 15 * s;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5 * s);
      doc.setTextColor(193, 39, 45);
      doc.text(`RESTOCK IN: ${p.restockDays} ${p.restockDays === 1 ? "DAY" : "DAYS"}`, tx, ty);
      doc.setTextColor(17, 17, 17);
    }

    if (p.restockNote?.trim()) {
      ty += 13 * s;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5 * s);
      doc.setTextColor(90, 90, 90);
      const restockLines = doc.splitTextToSize(p.restockNote.trim(), textMaxW) as string[];
      for (const line of restockLines.slice(0, single ? 3 : 2)) {
        doc.text(line, tx, ty);
        ty += 10 * s;
      }
      doc.setTextColor(17, 17, 17);
    }

    ty += 24 * s;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9 * s);
    doc.setTextColor(120, 120, 120);
    doc.text(mixed ? "SIZE-WISE RATES" : "AVAILABLE SIZES", tx, ty);
    ty += 12 * s;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10 * s);
    doc.setTextColor(17, 17, 17);
    const sizesLine = mixed
      ? groups.map((g) => `${g.sizes.join("/")} @ Rs.${g.rate.toLocaleString("en-IN")}`).join("   ·   ")
      : p.sizes && p.sizes.length
        ? p.sizes.join("  ·  ")
        : "-";
    const sizeLines = doc.splitTextToSize(sizesLine, textMaxW) as string[];
    for (const line of sizeLines.slice(0, single ? 6 : 2)) {
      doc.text(line, tx, ty);
      ty += 12 * s;
    }

    const colorNames = p.colors && p.colors.length ? p.colors : [];

    if (single) {
      // ---- Dedicated bottom section: big rounded swatch boxes, wrapping grid ----
      const secX = cardX + 14;
      const secW = cardW - 28;
      let secY = Math.max(ty + 18, imgY + imgH + 26);

      doc.setDrawColor(235, 235, 235);
      doc.setLineWidth(0.5);
      doc.line(secX, secY - 16, secX + secW, secY - 16);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(120, 120, 120);
      doc.text("AVAILABLE COLORS", secX, secY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`${colorNames.length} shade${colorNames.length === 1 ? "" : "s"}`, secX + secW, secY, {
        align: "right",
      });
      secY += 16;

      if (colorNames.length === 0) {
        doc.setFontSize(10);
        doc.setTextColor(17, 17, 17);
        doc.text("-", secX, secY + 10);
      } else {
        const availH = cardY + rowH - 14 - secY;
        // Auto-shrink the box grid so many colors still fit inside the card.
        let boxW = 74;
        let boxH = 34;
        let labelH = 13;
        let colGap = 10;
        let rowGap = 10;
        const fits = () => {
          const cols = Math.max(1, Math.floor((secW + colGap) / (boxW + colGap)));
          const rows = Math.ceil(colorNames.length / cols);
          return rows * (boxH + labelH + rowGap) - rowGap <= availH;
        };
        while (!fits() && boxW > 34) {
          boxW -= 6;
          boxH = Math.max(18, boxH - 2);
          labelH = Math.max(9, labelH - 0.6);
          colGap = Math.max(5, colGap - 0.5);
          rowGap = Math.max(5, rowGap - 0.5);
        }
        const cols = Math.max(1, Math.floor((secW + colGap) / (boxW + colGap)));
        const fontSize = Math.max(5.5, Math.min(8.5, boxW / 9));

        colorNames.forEach((name, idx) => {
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const bx = secX + col * (boxW + colGap);
          const by = secY + row * (boxH + labelH + rowGap);
          if (by + boxH + labelH > cardY + rowH - 8) return;

          const hex = resolveColorHex(name, p.colorHex?.[name]);
          const [r, g, b] = hexToRgb(hex);
          doc.setFillColor(r, g, b);
          doc.setDrawColor(170, 170, 170);
          doc.setLineWidth(0.6);
          doc.roundedRect(bx, by, boxW, boxH, 5, 5, "FD");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(fontSize);
          doc.setTextColor(40, 40, 40);
          const label = doc.splitTextToSize(String(name), boxW)[0] as string;
          doc.text(label, bx + boxW / 2, by + boxH + labelH - 4, { align: "center" });
        });
      }
      ty = cardY + rowH;
    } else {
      ty += 6 * s;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9 * s);
      doc.setTextColor(120, 120, 120);
      doc.text("AVAILABLE COLORS", tx, ty);
      ty += 12 * s;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10 * s);
      doc.setTextColor(17, 17, 17);
      if (colorNames.length === 0) {
        doc.text("-", tx, ty);
        ty += 12 * s;
      } else {
        const dot = 4.6 * s;
        const lineH = 13 * s;
        const maxRows = 3;
        let cx = tx;
        let rows = 1;
        for (const name of colorNames) {
          const hex = resolveColorHex(name, p.colorHex?.[name]);
          const label = String(name);
          const chipW = dot * 2 + 4 * s + doc.getTextWidth(label) + 10 * s;
          if (cx > tx && cx + chipW > tx + textMaxW) {
            if (rows >= maxRows) break;
            rows += 1;
            cx = tx;
            ty += lineH;
          }
          const [r, g, b] = hexToRgb(hex);
          doc.setFillColor(r, g, b);
          doc.setDrawColor(150, 150, 150);
          doc.setLineWidth(0.5);
          doc.circle(cx + dot, ty - dot * 0.75, dot, "FD");
          doc.setTextColor(17, 17, 17);
          doc.text(label, cx + dot * 2 + 4 * s, ty);
          cx += chipW;
        }
        ty += lineH;
      }
    }

    y += rowH + gap;

    // 1-per-page: force a page break after each product
    if (single && i < products.length - 1) {
      doc.addPage();
      pageNum += 1;
      drawHeader(pageNum, totalPages);
      drawFooter();
      y = topY;
      continue;
    }

    // Separator line between rows (not after the last one on page)
    if (i < products.length - 1 && y + rowH <= bottomY) {
      doc.setDrawColor(235, 235, 235);
      doc.setLineWidth(0.5);
      doc.line(M + 20, y - gap / 2, W - M - 20, y - gap / 2);
    }
  }

  // If empty catalog, at least draw header
  if (products.length === 0) {
    drawHeader(1, 1);
    drawFooter();
    doc.setFontSize(12);
    doc.text("No products available yet.", W / 2, H / 2, { align: "center" });
  }

  return doc;
}