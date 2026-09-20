/**
 * The paper that goes in the parcel.
 *
 * Extracted from the old orders screen so the new one keeps it — it is the
 * document the rider and the packer actually work from, and losing it in a
 * rewrite would be a real regression.
 *
 * Built on the v2 order shape, so it now carries the SKU and variant of each
 * line. A packer picking "Whey Gold" off a shelf holding three flavours needs
 * to know which one.
 */

import type { AdminOrderDetail } from "./types";

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const money = (value: string | number | null | undefined) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

const dateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("en-PK") : "—";

/** Order reference as printed. Zero-padded so slips sort and scan consistently. */
export const orderReference = (id: number) => `PKN-${String(id).padStart(6, "0")}`;

/**
 * A scannable-looking barcode drawn from the reference.
 *
 * Not a real symbology — it encodes each character's bits as bar widths, which
 * reads as a barcode to a human sorting parcels but will not scan with a
 * reader. Kept as-is from the original slip; replacing it with Code 128 is
 * worth doing when the shop actually buys a scanner.
 */
const barcodeSvg = (value: string) => {
  const height = 68;
  const gap = 1;
  let x = 12;

  const bars = Array.from(value)
    .flatMap((char, charIndex) => {
      const binary = char.charCodeAt(0).toString(2).padStart(8, "0");
      return binary.split("").flatMap((bit, bitIndex) => {
        const width = bit === "1" ? 3 : 1.5;
        const rect = `<rect x="${x}" y="8" width="${width}" height="${height}" fill="#111827" />`;
        x += width + gap;
        if (bitIndex === 7 && charIndex < value.length - 1) x += 2;
        return rect;
      });
    })
    .join("");

  const totalWidth = x + 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="102"
      viewBox="0 0 ${totalWidth} 102" role="img" aria-label="Order reference barcode">
      ${bars}
      <text x="${totalWidth / 2}" y="94" text-anchor="middle"
        font-family="ui-monospace, monospace" font-size="13" fill="#111827">${escapeHtml(value)}</text>
    </svg>`;
};

const SLIP_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         margin: 0; padding: 24px; color: #111827; }
  h1 { font-size: 22px; margin: 0; }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
       color: #6b7280; margin: 0 0 8px; }
  p { margin: 4px 0; font-size: 13px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start;
            gap: 24px; border-bottom: 2px solid #111827; padding-bottom: 16px; }
  .muted { color: #6b7280; font-size: 12px; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 20px 0; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
  .address-line { white-space: pre-line; }
  .pill-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .pill { border: 1px solid #d1d5db; border-radius: 999px; padding: 2px 10px; font-size: 11px; }
  .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
                   color: #6b7280; margin: 20px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
  th { background: #f9fafb; font-size: 11px; text-transform: uppercase;
       letter-spacing: .04em; color: #6b7280; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .sku { font-family: ui-monospace, monospace; font-size: 11px; color: #374151; }
  .collect { margin-top: 20px; border: 2px solid #111827; border-radius: 8px;
             padding: 14px; display: flex; justify-content: space-between; align-items: center; }
  .collect .amount { font-size: 26px; font-weight: 700; }
  .signature { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
  .signature div { border-top: 1px solid #9ca3af; padding-top: 6px;
                   font-size: 11px; color: #6b7280; }
  @media print { body { padding: 0; } .no-print { display: none; } }
`;

/**
 * Open a print window for one order.
 *
 * Returns false when the browser blocked the pop-up, so the caller can say so
 * rather than leaving the user staring at a button that did nothing.
 */
export function printDispatchSlip(order: AdminOrderDetail): boolean {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return false;

  const reference = orderReference(order.id);
  const isCod = order.payment_method === "COD";
  // What the rider collects. A prepaid parcel must print zero, or someone will
  // ask the customer for money they have already paid.
  const collectAmount = isCod && !order.is_settled ? money(order.total_amount) : money(0);

  const rows = order.items
    .map(
      (item) => `
      <tr>
        <td>
          ${escapeHtml(item.product_name)}
          ${item.variant_description ? `<div class="muted">${escapeHtml(item.variant_description)}</div>` : ""}
        </td>
        <td class="sku">${escapeHtml(item.sku || "—")}</td>
        <td class="num">${escapeHtml(item.quantity)}</td>
        <td class="num">${escapeHtml(money(item.price))}</td>
        <td class="num">${escapeHtml(money(item.line_total))}</td>
      </tr>`,
    )
    .join("");

  printWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(reference)} — dispatch slip</title>
    <style>${SLIP_STYLES}</style>
  </head>
  <body>
    <div class="header">
      <div>
        <h1>PakNutrition</h1>
        <p class="muted">Dispatch slip · printed ${escapeHtml(dateTime(new Date().toISOString()))}</p>
        <p><strong>Order ${escapeHtml(reference)}</strong> · placed ${escapeHtml(dateTime(order.created_at))}</p>
      </div>
      <div>${barcodeSvg(reference)}</div>
    </div>

    <div class="summary">
      <div class="card">
        <h3>Deliver to</h3>
        <p><strong>${escapeHtml(order.customer_name)}</strong></p>
        <p>${escapeHtml(order.customer_phone || "No phone recorded")}</p>
        <p class="address-line">${escapeHtml(order.shipping_address || "No address recorded.")}</p>
      </div>
      <div class="card">
        <h3>Order</h3>
        <p><strong>Fulfilment:</strong> ${escapeHtml(order.fulfilment_label)}</p>
        <p><strong>Payment:</strong> ${escapeHtml(order.payment_label)}</p>
        <p><strong>Items:</strong> ${escapeHtml(order.items_count)}</p>
        ${order.applied_promo_code ? `<p><strong>Promo:</strong> ${escapeHtml(order.applied_promo_code)}</p>` : ""}
        <div class="pill-row">
          <span class="pill">${escapeHtml(order.payment_method)}</span>
          <span class="pill">${escapeHtml(order.sales_channel)}</span>
        </div>
      </div>
      <div class="card">
        <h3>Totals</h3>
        <p><strong>Subtotal:</strong> ${escapeHtml(money(order.subtotal_amount))}</p>
        <p><strong>Discount:</strong> ${escapeHtml(money(order.discount_amount))}</p>
        <p><strong>Shipping:</strong> ${escapeHtml(money(order.shipping_fee))}</p>
        <p><strong>Total:</strong> ${escapeHtml(money(order.total_amount))}</p>
        ${
          Number(order.refunded_amount) > 0
            ? `<p><strong>Refunded:</strong> ${escapeHtml(money(order.refunded_amount))}</p>`
            : ""
        }
      </div>
    </div>

    <div class="section-title">Items to pack</div>
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>SKU</th>
          <th class="num">Qty</th>
          <th class="num">Unit</th>
          <th class="num">Line total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="collect">
      <div>
        <h3>Collect on delivery</h3>
        <p class="muted">
          ${
            isCod && !order.is_settled
              ? "Cash to be collected from the customer."
              : "Already paid — do not collect anything."
          }
        </p>
      </div>
      <div class="amount">${escapeHtml(collectAmount)}</div>
    </div>

    ${
      order.tracking_number
        ? `<p class="muted" style="margin-top:16px">Courier: ${escapeHtml(order.courier_name || "—")} · Tracking: ${escapeHtml(order.tracking_number)}</p>`
        : ""
    }

    <div class="signature">
      <div>Packed by</div>
      <div>Received by (customer signature)</div>
    </div>

    <script>window.onload = function () { window.print(); };${"<" + "/script>"}
  </body>
</html>`);
  printWindow.document.close();
  return true;
}
