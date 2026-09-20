import type { Metadata, Viewport } from "next";
import { Inter, Oswald } from "next/font/google";

import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { CartProvider } from "@/lib/cart";
import { SITE } from "@/lib/site";

import "./globals.css";

/*
 * Self-hosted through next/font: the files are served from our own origin, so
 * there is no request to fonts.gstatic.com on first paint. That removes a
 * third-party connection from the critical path — which matters a lot more on
 * a 3G connection in Pakistan than it does on a laptop in an office.
 */
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — Authentic Supplements in Pakistan`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "en_PK",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

/*
 * Applies the stored theme before the browser paints.
 *
 * Without this the page renders light, then React hydrates and switches to
 * dark — a white flash on every navigation for anyone using dark mode. It has
 * to be inline and synchronous in <head> to beat first paint; there is no way
 * to do this from a component. It touches only documentElement.classList, and
 * a thrown error (Safari private mode blocks localStorage) falls through to
 * the default rather than breaking the page.
 */
const THEME_SCRIPT = `
try {
  var stored = localStorage.getItem('pn-theme');
  var dark = stored ? stored === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-PK" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${oswald.variable} ${inter.variable}`}>
        {/* First stop for a keyboard or screen-reader user, before the nav. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:font-semibold focus:text-black"
        >
          Skip to content
        </a>
        <CartProvider>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main id="main" className="flex-1">
              {children}
            </main>
            <Footer />
          </div>
        </CartProvider>
      </body>
    </html>
  );
}
