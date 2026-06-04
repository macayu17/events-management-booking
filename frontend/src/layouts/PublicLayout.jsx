import { Outlet, Link, useLocation } from 'react-router-dom';
import { Menu, X, Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function PublicLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const location = useLocation();
  const isActive = (path) => location.pathname === path;

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-white selection:bg-[#E23744] selection:text-white relative overflow-x-hidden font-['Outfit']">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-black"
      >
        Skip to content
      </a>

      {/* --- Universal Dynamic Background --- */}
      <div className="fixed inset-0 w-full h-full pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(226,55,68,0.08),transparent_28%,rgba(255,255,255,0.035)_52%,transparent_72%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(226,55,68,0.10),transparent_34rem)] opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      {/* Premium Glass Header */}
      <nav className="glass-nav sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            {/* Logo Area */}
            <div className="flex items-center">
              <Link to="/" className="flex items-center gap-3 group">
                <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-[#E23744] text-white shadow-[0_0_20px_rgba(226,55,68,0.4)] group-hover:scale-105 transition-transform duration-300">
                  <Ticket size={20} fill="currentColor" className="transform -rotate-12" />
                </div>
                <span className="text-2xl font-bold tracking-tight text-white group-hover:text-gray-200 transition-colors">
                  Occasio
                </span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <Link
                to="/"
                aria-current={isActive('/') ? 'page' : undefined}
                className={`text-sm font-medium transition-colors ${isActive('/') ? 'text-white' : 'text-gray-300 hover:text-white'}`}
              >
                Explore
              </Link>
              <Link
                to="/login"
                aria-current={isActive('/login') ? 'page' : undefined}
                className={`text-sm font-medium transition-colors ${isActive('/login') ? 'text-white' : 'text-gray-300 hover:text-white'}`}
              >
                Organizer Login
              </Link>
              <Link
                to="/register"
                className="btn btn-primary shadow-red-500/20"
              >
                Sign Up
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileMenuOpen}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/5 bg-[#09090b]">
            <div className="px-4 pt-4 pb-6 space-y-3">
              <Link
                to="/"
                aria-current={isActive('/') ? 'page' : undefined}
                className={`block rounded-xl px-4 py-3 text-base font-medium ${isActive('/') ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Explore Events
              </Link>
              <Link
                to="/login"
                aria-current={isActive('/login') ? 'page' : undefined}
                className={`block rounded-xl px-4 py-3 text-base font-medium ${isActive('/login') ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Organizer Login
              </Link>
              <Link
                to="/register"
                className="block px-4 py-3 text-base font-medium text-white bg-[#E23744] hover:bg-[#d12c39] rounded-xl text-center mt-4"
                onClick={() => setMobileMenuOpen(false)}
              >
                Create Account
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main id="main-content" className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Modern Minimal Footer */}
      <footer className="relative z-10 border-t border-white/5 bg-[#09090b] mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#27272a] flex items-center justify-center text-gray-400">
                <Ticket size={16} />
              </div>
              <span className="text-lg font-bold text-gray-200">Occasio</span>
            </div>

            <div className="flex gap-8 text-sm text-gray-500">
              <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
              <Link to="/contact" className="hover:text-white transition-colors">Contact</Link>
            </div>

            <div className="text-sm text-gray-600">
              © {currentYear} Occasio Events
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
