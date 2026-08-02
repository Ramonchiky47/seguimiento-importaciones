import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { InactivityLogout } from "@/components/InactivityLogout";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Seguimiento de Importaciones",
  description: "Seguimiento de importaciones y demoras",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <InactivityLogout />
        <div
          style={{ fontFamily: "Calibri, sans-serif" }}
          className="w-full py-0.5 text-center text-[6px] text-slate-400 dark:text-slate-600"
        >
          Creado por Ing Ramon Villanueva
        </div>
        {children}
      </body>
    </html>
  );
}
