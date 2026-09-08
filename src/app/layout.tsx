import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SEEAKK Control Software',
  description: 'Internal SaaS Control Platform for authorized SEEAKK administrators',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
