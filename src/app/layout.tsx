import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "落とし穴将棋",
  description: "A playable hidden-trap shogi variant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
