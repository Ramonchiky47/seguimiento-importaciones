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
        {/* Logo de SYSMON arriba a la derecha de todas las páginas, con la firma a su lado. */}
        <div className="flex w-full items-center justify-end gap-2 bg-white px-4 py-1 dark:bg-slate-950">
          <span className="text-[11px] italic text-slate-500 dark:text-slate-400">By Ing Ramon Villanueva</span>
          <img src="/sysmon.svg" alt="SYSMON" width={81} height={24} className="h-6 w-auto" />
        </div>
        {children}
      </body>
    </html>
  );
}
