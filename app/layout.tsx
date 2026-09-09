import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IBAM Monitor",
  description: "Monitor X posts for relevant encrypted-archive signals."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}