import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoteQRIS — Sistem Voting QRIS Statis",
  description:
    "Platform voting digital berbasis QRIS Statis dengan verifikasi nominal unik & audit ledger transparan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
