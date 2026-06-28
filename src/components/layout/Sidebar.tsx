'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/projects', label: 'Projects', icon: '[Folder]' },
  { href: '/corrections', label: 'Corrections', icon: '[Tool]' },
  { href: '/cogo', label: 'COGO', icon: '[Compass]' },
  { href: '/documents', label: 'Documents', icon: '📄' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside style={{
      width: '240px',
      minHeight: '100vh',
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
      zIndex: 40,
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 16px',
        borderBottom: '1px solid var(--border)',
      }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.5px' }}>
            <span style={{ color: 'var(--accent)' }}>M</span>ETARDU
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', letterSpacing: '0.5px' }}>
            SURVEY ENGINE
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '6px',
                textDecoration: 'none',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                background: isActive ? 'var(--accent-muted)' : 'transparent',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 400,
                marginBottom: '2px',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '16px' }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid var(--border)',
        fontSize: '11px',
        color: 'var(--text-muted)',
      }}>
        <div>Kenya Cadastral Grade</div>
        <div style={{ color: 'var(--success)', marginTop: '4px' }}>
          2nd Order Ready (1:20,000)
        </div>
      </div>
    </aside>
  );
}
