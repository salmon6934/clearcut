import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NativeProvider } from "@/components/NativeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clearcut | Expense Sharing",
  description: "Real-time online-first group expense sharing with offline resilience",
  icons: {
    icon: [
      { url: '/icon.png?v=2', sizes: 'any' },
      { url: '/icon.png?v=2', type: 'image/png' },
    ],
    apple: [
      { url: '/icon.png?v=2', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/icon.png?v=2',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" href="/icon.png?v=2" type="image/png" sizes="any" />
        <link rel="apple-touch-icon" href="/icon.png?v=2" />
      </head>
      <body className="min-h-full flex flex-col bg-transparent text-[#432E22] selection:bg-[#D4B89B] selection:text-[#432E22] relative overflow-x-hidden">
        {/* Fixed background layer using public/background.png */}
        <div
          aria-hidden="true"
          className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat pointer-events-none"
          style={{ backgroundImage: "url('/background.png')" }}
        />
        <NativeProvider>
          {children}
        </NativeProvider>
      </body>
    </html>
  );
}
