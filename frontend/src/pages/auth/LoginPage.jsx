import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Lock, Mail, Ticket } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      navigate('/admin');
    }

    setLoading(false);
  };

  return (
    <main className="auth-shell flex min-h-screen items-center justify-center px-4 py-10 text-[#f7efe3]">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2.25rem] border border-white/10 bg-black/20 shadow-[0_28px_110px_rgba(0,0,0,0.42)] backdrop-blur-2xl lg:grid-cols-[0.95fr_1.05fr]">
        <section className="hidden border-r border-white/10 bg-[#0d0b0b]/80 p-10 lg:flex lg:flex-col lg:justify-between">
          <Link to="/" className="flex items-center gap-3 text-lg font-black">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E23744] text-white shadow-lg shadow-[#E23744]/25">
              <Ticket size={18} fill="currentColor" className="-rotate-12" />
            </span>
            Occasio
          </Link>

          <div>
            <p className="admin-eyebrow mb-4">Admin access</p>
            <h1 className="text-5xl font-black leading-tight tracking-tight">Run every event from one clean dashboard.</h1>
            <p className="mt-5 max-w-sm text-base leading-7 text-[#aaa096]">
              Sign in to manage registrations, scanners, payments, event controls, and team access.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center text-xs text-[#aaa096]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">Events</div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">Tickets</div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">Check-in</div>
          </div>
        </section>

        <section className="p-5 sm:p-8 lg:p-10">
          <div className="mb-8 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 text-lg font-black lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E23744] text-white">
                <Ticket size={17} fill="currentColor" className="-rotate-12" />
              </span>
              Occasio
            </Link>
            <Link to="/" className="ml-auto rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#aaa096] transition-colors hover:border-[#E23744]/50 hover:text-white">
              Back to events
            </Link>
          </div>

          <div className="auth-panel mx-auto max-w-md">
            <p className="admin-eyebrow mb-3">Welcome back</p>
            <h2 className="text-3xl font-black tracking-tight text-white">Sign in</h2>
            <p className="mt-2 text-sm leading-6 text-[#aaa096]">Use your organizer account to continue.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-bold text-[#e9ddd0]">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#756d66]" size={18} />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    inputMode="email"
                    spellCheck={false}
                    required
                    className="auth-input pl-11"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-bold text-[#e9ddd0]">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#756d66]" size={18} />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="auth-input pl-11"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="admin-primary-action flex w-full items-center justify-center disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-[#aaa096]">
              New to Occasio?{' '}
              <Link to="/register" className="font-bold text-[#ff5864] hover:text-white">
                Create an account
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
