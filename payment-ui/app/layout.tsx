import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Payment Flow Lab",
    template: "%s | Payment Flow Lab",
  },
  description: "Side-by-side payment integration test harness",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
