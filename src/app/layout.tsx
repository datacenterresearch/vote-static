import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Votingin — Platform Voting Digital",
  description:
    "Platform voting digital berbasis QRIS yang cepat, praktis, dan transparan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-indigo-100 selection:text-indigo-900">
        {children}
      </body>
    </html>
  );
}
