import { Outlet, Link, useLocation } from 'react-router-dom';
import { Menu, X, Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';

export default function PublicLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const isActive = (path) => location.pathname === path;

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-on-accent"
      >
        Skip to content
      </a>

      {/* Nav */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between border-b border-dashed px-5 py-4 sm:px-10"
        style={{ borderColor: 'var(--dash)', background: 'var(--bg)' }}
      >
        <Link to="/" className="flex items-center gap-3.5">
          <span className="font-display text-[22px] uppercase tracking-wide">Occasio</span>
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-6 text-sm font-medium md:flex">
          <Link to="/" className={isActive('/') ? 'text-ink' : 'text-ink-70 hover:text-accent'}>Explore</Link>
          <Link to="/login" className={isActive('/login') ? 'text-ink' : 'text-ink-70 hover:text-accent'}>For organizers</Link>
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          <Link to="/register" className="rounded-md px-4 py-2 text-[13.5px] font-semibold" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
            Sign up
          </Link>
        </div>

        {/* Mobile */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full border"
            style={{ borderColor: 'var(--line60)' }}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div
            className="absolute left-0 right-0 top-full border-b border-dashed px-5 py-4 md:hidden"
            style={{ borderColor: 'var(--dash)', background: 'var(--bg)' }}
          >
            <div className="flex flex-col gap-1">
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="rounded-md px-3 py-3 text-base font-medium text-ink-70 hover:text-accent">Explore events</Link>
              <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="rounded-md px-3 py-3 text-base font-medium text-ink-70 hover:text-accent">For organizers</Link>
              <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="btn-ink mt-2">Create account</Link>
            </div>
          </div>
        )}
      </nav>

      {/* Main */}
      <main id="main-content" className="mx-auto w-full max-w-[1200px] flex-1 px-5 py-4 sm:px-10">
        <Outlet />
      </main>

      {/* Footer */}
      <footer
        className="mt-10 border-t border-dashed px-5 py-5 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-45 sm:px-10"
        style={{ borderColor: 'var(--dash)' }}
      >
        Occasio — Tickets worth keeping
      </footer>
    </div>
  );
}

function ThemeToggle({ isDark, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:border-accent hover:text-accent"
      style={{ borderColor: 'var(--line60)' }}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
