import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GeoNova — Professional Surveying Calculations',
  description: 'Professional land surveying calculation platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link 
          href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow+Condensed:wght@400;600;700&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body className="antialiased">
        <nav className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-10">
              <a href="/" className="text-2xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
                GEONOVA
              </a>
              <div className="hidden md:flex items-center gap-8">
                <NavLink href="/tools">Quick Tools</NavLink>
                <NavLink href="/tools/distance">Distance</NavLink>
                <NavLink href="/tools/bearing">Bearing</NavLink>
                <NavLink href="/tools/area">Area</NavLink>
                <NavLink href="/tools/traverse">Traverse</NavLink>
                <NavLink href="/tools/leveling">Leveling</NavLink>
                <NavLink href="/tools/coordinates">Coordinates</NavLink>
                <NavLink href="/tools/curves">Curves</NavLink>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <a href="/login" className="px-4 py-2 text-sm border border-[#E8841A] text-[#E8841A] rounded hover:bg-[#E8841A]/10 transition-colors">
                Log In
              </a>
              <a href="/register" className="px-4 py-2 text-sm bg-[#E8841A] text-black font-semibold rounded hover:bg-[#d67715] transition-colors">
                Get Started
              </a>
            </div>
          </div>
        </nav>
        <main className="min-h-screen">
          {children}
        </main>
        <footer className="border-t border-[var(--border-color)] py-6 mt-16">
          <div className="max-w-7xl mx-auto px-4 text-center text-xs text-[var(--text-muted)]">
            GeoNova v1.0 — Professional Surveying Calculations
          </div>
        </footer>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a 
      href={href} 
      className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
    >
      {children}
    </a>
  );
}
