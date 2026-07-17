import type { Metadata } from "next";
import type { ReactNode } from "react";

import { env } from "../config/env";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: env.appName,
    template: `%s | ${env.appName}`,
  },
  description: "Side-by-side payment integration test harness",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
