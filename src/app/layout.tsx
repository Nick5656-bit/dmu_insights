import type { Metadata } from "next";
import { Geist_Mono, Inter, Manrope } from "next/font/google";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import "./globals.css";

function excludePersonalSurveyLinks(event: BeforeSendEvent) {
  // A survey URL contains a single-use token and must never be included in traffic analytics.
  return event.url.includes("/survey/") ? null : event;
}

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DMU Feedback Portal · Prototype",
  description: "Prototype til DMU medlemsfeedback",
  icons: {
    icon: "/dmu-logo.png",
    shortcut: "/dmu-logo.png",
    apple: "/dmu-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da">
      <body
        className={`${inter.className} ${inter.variable} ${manrope.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Analytics beforeSend={excludePersonalSurveyLinks} />
      </body>
    </html>
  );
}
