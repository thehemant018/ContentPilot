import type { Metadata } from "next";
import { DM_Sans, Geist_Mono, Sora } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ContentPilot — Sitecore XM Cloud Migration",
  description:
    "Connect to Sitecore XM Cloud and migrate source content with a guided workflow.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${sora.variable} ${geistMono.variable} h-full antialiased scheme-light`}
      style={{ colorScheme: "light" }}
    >
      <body className="flex min-h-full flex-col bg-[#f4f7f8] font-sans text-slate-900">
        {children}
      </body>
    </html>
  );
}
