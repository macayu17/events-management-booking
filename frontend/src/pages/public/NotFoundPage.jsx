import { Link } from 'react-router-dom';
import { ArrowLeft, SearchX } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <section className="flex min-h-[62vh] items-center justify-center py-16">
      <div className="w-full max-w-3xl">
        <div className="mb-8 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E23744]/30 bg-[#E23744]/10 text-[#ff6c76]">
          <SearchX size={26} />
        </div>
        <p className="admin-eyebrow mb-4">404</p>
        <h1 className="max-w-2xl text-4xl font-black tracking-tight text-[#f7efe3] md:text-6xl">
          This page is not on the guest list.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[#aaa096]">
          The link may be wrong, expired, or no longer available.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/" className="admin-primary-action inline-flex items-center justify-center gap-2">
            <ArrowLeft size={18} />
            Explore events
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-[#f7efe3] transition-colors hover:bg-white/[0.08]"
          >
            Contact support
          </Link>
        </div>
      </div>
    </section>
  );
}
