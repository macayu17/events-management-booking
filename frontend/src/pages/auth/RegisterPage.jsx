import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    const result = await registerUser(formData.name, formData.email, formData.password);
    if (result.success) navigate('/admin');
    setLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="ticket-card grid w-full max-w-5xl overflow-hidden lg:grid-cols-[1.05fr_0.95fr]">
        {/* Form */}
        <section className="p-6 sm:p-10">
          <div className="mb-8 flex items-center justify-between">
            <Link to="/" className="font-display text-2xl uppercase tracking-wide lg:hidden">Occasio</Link>
            <Link to="/" className="mono-label ml-auto hover:text-accent">Back to events</Link>
          </div>

          <div className="mx-auto max-w-md">
            <p className="mono-accent">Organizer setup</p>
            <h2 className="mt-1.5 font-display text-4xl uppercase">Create account</h2>
            <p className="mt-2 text-sm text-ink-55">Set up an organizer profile and start managing events.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label htmlFor="name" className="mono-label mb-1.5 block">Full name</label>
                <input id="name" name="name" type="text" autoComplete="name" required className="field" placeholder="Ayush Kumar" value={formData.name} onChange={handleChange} />
              </div>
              <div>
                <label htmlFor="email" className="mono-label mb-1.5 block">Email address</label>
                <input id="email" name="email" type="email" autoComplete="email" inputMode="email" spellCheck={false} required className="field" placeholder="you@example.com" value={formData.email} onChange={handleChange} />
              </div>
              <div>
                <label htmlFor="password" className="mono-label mb-1.5 block">Password</label>
                <input id="password" name="password" type="password" autoComplete="new-password" required minLength={6} className="field" placeholder="Minimum 6 characters" value={formData.password} onChange={handleChange} />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="mono-label mb-1.5 block">Confirm password</label>
                <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={6} className="field" placeholder="Re-enter password" value={formData.confirmPassword} onChange={handleChange} />
              </div>
              <button type="submit" disabled={loading} className="btn-accent w-full disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-ink-55">
              Already registered? <Link to="/login" className="font-bold text-accent hover:opacity-80">Sign in</Link>
            </p>
          </div>
        </section>

        {/* Promo panel */}
        <section className="hidden flex-col justify-between border-l-2 border-dashed p-10 lg:flex" style={{ borderColor: 'var(--dash)', background: 'var(--card2)' }}>
          <Link to="/" className="font-display text-2xl uppercase tracking-wide">Occasio</Link>
          <div>
            <p className="mono-accent">★ Built for live events</p>
            <h1 className="mt-4 font-display text-5xl uppercase leading-[0.95]">Create once. Sell, scan, and track without clutter.</h1>
            <p className="mt-5 max-w-sm text-ink-70">Your dashboard handles registrations, public event pages, scanner access, and financial tracking.</p>
          </div>
          <div className="rounded-md border-2 border-dashed p-5 text-sm text-ink-55" style={{ borderColor: 'var(--dash)' }}>
            Keep the account details accurate. They control organizer access across the admin tools.
          </div>
        </section>
      </div>
    </main>
  );
}
