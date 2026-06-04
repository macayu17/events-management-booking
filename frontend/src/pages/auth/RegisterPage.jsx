import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Lock, Mail, Ticket, User } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);

    const result = await registerUser(formData.name, formData.email, formData.password);

    if (result.success) {
      navigate('/admin');
    }

    setLoading(false);
  };

  return (
    <main className="auth-shell flex min-h-screen items-center justify-center px-4 py-10 text-[#f7efe3]">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 shadow-[0_28px_110px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:rounded-[2.25rem] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="p-5 sm:p-8 lg:p-10">
          <div className="mb-8 flex min-w-0 flex-wrap items-center justify-between gap-3">
            <Link to="/" className="flex min-w-0 items-center gap-3 text-lg font-black lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E23744] text-white">
                <Ticket size={17} fill="currentColor" className="-rotate-12" />
              </span>
              <span className="truncate">Occasio</span>
            </Link>
            <Link to="/" className="ml-auto shrink-0 rounded-full border border-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#aaa096] transition-colors hover:border-[#E23744]/50 hover:text-white sm:px-4 sm:text-xs sm:tracking-[0.2em]">
              Back to events
            </Link>
          </div>

          <div className="auth-panel mx-auto max-w-md">
            <p className="admin-eyebrow mb-3">Organizer setup</p>
            <h2 className="text-3xl font-black tracking-tight text-white">Create account</h2>
            <p className="mt-2 text-sm leading-6 text-[#aaa096]">Set up an organizer profile and start managing events.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-bold text-[#e9ddd0]">Full name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-[#756d66]" size={18} />
                  <input
                    id="name"
                    type="text"
                    name="name"
                    autoComplete="name"
                    required
                    className="auth-input pl-11"
                    placeholder="Ayush Kumar"
                    value={formData.name}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-bold text-[#e9ddd0]">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#756d66]" size={18} />
                  <input
                    id="email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    spellCheck={false}
                    required
                    className="auth-input pl-11"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-bold text-[#e9ddd0]">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#756d66]" size={18} />
                  <input
                    id="password"
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    className="auth-input pl-11"
                    placeholder="Minimum 6 characters"
                    value={formData.password}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="mb-2 block text-sm font-bold text-[#e9ddd0]">Confirm password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#756d66]" size={18} />
                  <input
                    id="confirmPassword"
                    type="password"
                    name="confirmPassword"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    className="auth-input pl-11"
                    placeholder="Re-enter password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="admin-primary-action flex w-full items-center justify-center disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Creating account...' : 'Create account'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-[#aaa096]">
              Already registered?{' '}
              <Link to="/login" className="font-bold text-[#ff5864] hover:text-white">
                Sign in
              </Link>
            </p>
          </div>
        </section>

        <section className="hidden border-l border-white/10 bg-[#0d0b0b]/80 p-10 lg:flex lg:flex-col lg:justify-between">
          <Link to="/" className="flex items-center gap-3 text-lg font-black">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E23744] text-white shadow-lg shadow-[#E23744]/25">
              <Ticket size={18} fill="currentColor" className="-rotate-12" />
            </span>
            Occasio
          </Link>

          <div>
            <p className="admin-eyebrow mb-4">Built for live events</p>
            <h1 className="text-5xl font-black leading-tight tracking-tight">Create once. Sell, scan, and track without clutter.</h1>
            <p className="mt-5 max-w-sm text-base leading-7 text-[#aaa096]">
              Your dashboard will handle registrations, public event pages, scanner access, and financial tracking.
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-[#aaa096]">
            Keep the account details accurate. They control organizer access across the admin tools.
          </div>
        </section>
      </div>
    </main>
  );
}
