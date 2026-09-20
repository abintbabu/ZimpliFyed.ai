import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

export const alt = "Zimplifyed — the Export & Import OS for Indian businesses";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Sitewide share card for marketing pages; brand colours match --color-brand / --color-brand-dark.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%)",
          color: "white",
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>{SITE_NAME}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
            The Export &amp; Import OS
          </div>
          <div style={{ fontSize: 32, opacity: 0.85, lineHeight: 1.3, maxWidth: 900 }}>
            Quotes, sourcing, landed cost, shipment documents and compliance in one secure platform.
          </div>
        </div>
        <div style={{ fontSize: 26, opacity: 0.75 }}>zimplifyed.ai</div>
      </div>
    ),
    size,
  );
}
