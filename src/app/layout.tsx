import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Votingin — Platform Voting Digital",
  description:
    "Platform voting digital berbasis QRIS yang cepat, praktis, dan transparan.",
  icons: {
    icon: "/images/logo-icon.png",
    apple: "/images/logo-icon.png",
  },
  openGraph: {
    images: ["/images/logo.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-cyan-100 selection:text-cyan-900">
        {children}
      </body>
    </html>
  );
}
