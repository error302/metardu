import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'METARDU — Professional Survey Engine',
  description: 'Cadastral survey computation engine for Kenya land surveying',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
