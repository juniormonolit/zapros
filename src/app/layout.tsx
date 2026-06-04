import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Zapros",
    template: "%s — Zapros",
  },
  description: "Система запросов поставщикам по задачам Bitrix",
  icons: {
    icon: [{ url: "/icon", type: "image/png", sizes: "32x32" }],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon", type: "image/png" }],
  },
  appleWebApp: {
    title: "Zapros",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-bg-primary text-text-primary antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
