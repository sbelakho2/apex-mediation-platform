import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ApexMediation - Enterprise Ad Mediation Platform',
  description: 'Maximize your ad revenue with transparent mediation, fraud protection, and developer-first tools.',
  keywords: ['ad mediation', 'mobile ads', 'Unity ads', 'iOS ads', 'Android ads', 'ad monetization'],
  authors: [{ name: 'Bel Consulting OÜ' }],
  openGraph: {
    title: 'ApexMediation - Enterprise Ad Mediation Platform',
    description: 'Maximize your ad revenue with transparent mediation, fraud protection, and developer-first tools.',
    url: 'https://apexmediation.bel-consulting.ee',
    siteName: 'ApexMediation',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ApexMediation - Enterprise Ad Mediation Platform',
    description: 'Maximize your ad revenue with transparent mediation, fraud protection, and developer-first tools.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#005293" />
      </head>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
