import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Stoneline OS", template: "%s · Stoneline OS" },
  description: "Construction CRM & business management for tile, flooring, cabinet and countertop contractors.",
};
export const viewport: Viewport = { themeColor: "#161a20", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
