import type { Metadata, Viewport } from "next";
import { eventDate, eventHosts } from '@/lib/event-config';
import "./globals.css";

export const metadata: Metadata = {
  title: `${eventHosts} - אישורי הגעה`,
  description: `${eventHosts} מתחתנים ב-${eventDate}. נשמח שתאשרו הגעה לחגיגה שלנו.`,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: `${eventHosts} מתחתנים`,
    description: `${eventDate} - מאשרים הגעה ומתחילים להתרגש`,
    images: ["/demo-hero.svg"],
    locale: "he_IL",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#13271f", colorScheme: "light", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><head><link rel="preload" href="/fonts/frank-ruhl-libre.woff" as="font" type="font/woff" crossOrigin="anonymous" /><link rel="preload" href="/fonts/heebo-regular.woff" as="font" type="font/woff" crossOrigin="anonymous" /></head><body>{children}</body></html>;
}
