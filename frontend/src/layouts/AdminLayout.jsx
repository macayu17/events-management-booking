import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Calendar,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  Plus,
  Ticket,
  BarChart3,
  QrCode,
  Users,
  ExternalLink
} from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../utils/api';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hasOwnEvents, setHasOwnEvents] = useState(null); // null = loading

  // Check if user is an admin (super admin always sees everything)
  const isAdmin = user?.role === 'ADMIN';

  // Check if user has their own events
  useEffect(() => {
    const checkOwnEvents = async () => {
      if (isAdmin) {
        setHasOwnEvents(true);
        return;
      }
      try {
        const res = await api.get('/admin/events');
        // If user has any events they own, show organizer items
        setHasOwnEvents(res.data.length > 0);
      } catch (error) {
        // If error, assume no events (safe default for team-only users)
        setHasOwnEvents(false);
      }
    };

    if (user) {
      checkOwnEvents();
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [sidebarOpen]);

  // Show full sidebar for admin OR users with their own events
  const showOrganizerItems = isAdmin || hasOwnEvents;
  const navAccessLoading = !isAdmin && hasOwnEvents === null;

  // Navigation items - filtered based on whether user owns events
  const allNavigation = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard, requiresOwnEvents: true },
    { name: 'Events', href: '/admin/events', icon: Calendar, requiresOwnEvents: true },
    { name: 'Team Events', href: '/admin/team-events', icon: Users, requiresOwnEvents: false },
    { name: 'Financials', href: '/admin/financials', icon: BarChart3, requiresOwnEvents: true },
    { name: 'Scanner', href: '/scanner', icon: QrCode, requiresOwnEvents: true },
  ];

  // Filter navigation based on whether user has own events
  const navigation = allNavigation.filter(item =>
    !item.requiresOwnEvents || showOrganizerItems
  );

  const isActive = (item) => {
    if (item.href === '/admin') return location.pathname === '/admin';
    if (item.href === '/admin/events') return location.pathname.startsWith('/admin/events');
    return location.pathname === item.href;
  };

  // Determine branding
  const isTeamOnlyUser = !showOrganizerItems && hasOwnEvents === false;

  return (
    <div className="admin-shell min-h-screen selection:bg-[#E23744] selection:text-white">
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-xl focus:bg-[#f2e7d8] focus:px-4 focus:py-2 focus:text-sm focus:font-black focus:text-[#17110d]"
      >
        Skip to admin content
      </a>

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar backdrop"
          className="fixed inset-0 z-40 cursor-default bg-black/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 transform p-3 transition-transform duration-300 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="admin-side-panel flex h-full flex-col rounded-[2rem]">
          {/* Logo */}
          <div className="flex h-20 items-center border-b border-white/10 px-5">
            <Link to={showOrganizerItems ? "/admin" : "/admin/team-events"} className="flex items-center gap-3 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#E23744] text-white shadow-lg shadow-red-900/20">
                <Ticket size={16} fill="currentColor" className="transform -rotate-12" />
              </div>
              <span className="text-lg font-black tracking-tight text-[#f7efe3]">
                {isTeamOnlyUser ? 'Occasio Team' : 'Occasio Admin'}
              </span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden ml-auto p-2 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Close sidebar"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-2 overflow-y-auto px-2 py-7">
            {navAccessLoading && (
              <div className="mx-2 mb-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-semibold text-[#aca39a]" role="status">
                Checking organizer access...
              </div>
            )}

            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`admin-nav-link ${active ? 'admin-nav-link-active' : 'admin-nav-link-idle'}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon size={20} />
                  <span>{item.name}</span>
                </Link>
              );
            })}

            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="admin-nav-link admin-nav-link-idle"
              onClick={() => setSidebarOpen(false)}
            >
              <ExternalLink size={20} />
              <span>View Site</span>
            </a>

            {/* Create Event - only for users with their own events or admin */}
            {showOrganizerItems && (
              <div className="mt-5 border-t border-white/10 pt-6">
                <Link
                  to="/admin/events/create"
                  className="group flex items-center gap-3 rounded-[1.35rem] border border-white/10 bg-white/[0.03] px-4 py-4 text-[#e6dace] transition-all hover:border-[#f2e7d8]/25 hover:bg-white/[0.07]"
                  onClick={() => setSidebarOpen(false)}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f2e7d8] text-[#17110d] transition-colors group-hover:bg-[#E23744] group-hover:text-white">
                    <Plus size={16} />
                  </div>
                  <span className="font-bold">Create Event</span>
                </Link>
              </div>
            )}
          </nav>

          {/* User section */}
          <div className="border-t border-white/10 p-3">
            <div className="flex items-center justify-between rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex-1 min-w-0 mr-3">
                <p className="truncate text-sm font-bold text-[#f7efe3]">{user?.name}</p>
                <p className="truncate text-xs text-[#8f867d]">{user?.email}</p>
              </div>
              <button
                onClick={logout}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-h-screen lg:pl-72">
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed left-4 top-4 z-30 rounded-full border border-white/10 bg-[#100e0c]/90 p-3 text-white shadow-2xl backdrop-blur-xl transition-colors hover:bg-white/10 lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu size={22} />
        </button>

        {/* Page content */}
        <main id="admin-main-content" className="p-4 pt-20 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
