import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

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
    if (result.success) navigate('/admin');
    setLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="ticket-card grid w-full max-w-5xl overflow-hidden lg:grid-cols-[0.95fr_1.05fr]">
        {/* Promo panel */}
        <section className="hidden flex-col justify-between border-r-2 border-dashed p-10 lg:flex" style={{ borderColor: 'var(--dash)', background: 'var(--card2)' }}>
          <Link to="/" className="font-display text-2xl uppercase tracking-wide">Occasio</Link>
          <div>
            <p className="mono-accent">★ Admin access</p>
            <h1 className="mt-4 font-display text-5xl uppercase leading-[0.95]">Run every event from one clean dashboard.</h1>
            <p className="mt-5 max-w-sm text-ink-70">Sign in to manage registrations, scanners, payments, event controls, and team access.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {['Events', 'Tickets', 'Check-in'].map((t) => (
              <div key={t} className="rounded-md border-2 border-dashed py-3 font-mono text-[11px] uppercase tracking-wide text-ink-55" style={{ borderColor: 'var(--dash)' }}>{t}</div>
            ))}
          </div>
        </section>

        {/* Form */}
        <section className="p-6 sm:p-10">
          <div className="mb-8 flex items-center justify-between">
            <Link to="/" className="font-display text-2xl uppercase tracking-wide lg:hidden">Occasio</Link>
            <Link to="/" className="mono-label ml-auto hover:text-accent">Back to events</Link>
          </div>

          <div className="mx-auto max-w-md">
            <p className="mono-accent">Welcome back</p>
            <h2 className="mt-1.5 font-display text-4xl uppercase">Sign in</h2>
            <p className="mt-2 text-sm text-ink-55">Use your organizer account to continue.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label htmlFor="email" className="mono-label mb-1.5 block">Email address</label>
                <input id="email" name="email" type="email" autoComplete="username" inputMode="email" spellCheck={false} required
                  className="field" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label htmlFor="password" className="mono-label mb-1.5 block">Password</label>
                <input id="password" name="password" type="password" autoComplete="current-password" required
                  className="field" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button type="submit" disabled={loading} className="btn-accent w-full disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-ink-55">
              New to Occasio? <Link to="/register" className="font-bold text-accent hover:opacity-80">Create an account</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
