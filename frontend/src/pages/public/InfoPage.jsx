import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';

const PAGE_CONTENT = {
  '/privacy': {
    eyebrow: 'Privacy',
    title: 'Privacy policy',
    body: [
      'Occasio collects account, event, registration, and payment status details needed to run event bookings and attendee operations.',
      'Payment card or wallet details are handled by the selected payment gateway. Occasio stores gateway references and ticket records, not raw card data.',
      'Organizers can export attendee data for their own events. Keep exports private and delete them when they are no longer needed.'
    ]
  },
  '/terms': {
    eyebrow: 'Terms',
    title: 'Terms of service',
    body: [
      'Organizers are responsible for event accuracy, attendee communication, refunds, and venue rules.',
      'Attendees must provide accurate registration details and keep ticket QR codes private.',
      'Occasio may restrict access to accounts or events that abuse registration, broadcast, scanner, or payment workflows.'
    ]
  },
  '/contact': {
    eyebrow: 'Contact',
    title: 'Contact Occasio',
    body: [
      'For event support, contact the event organizer first using the details on the event page or ticket email.',
      'For platform support, email support@occasio.com with the event name, order ID, and the issue you need help with.'
    ],
    email: 'support@occasio.com'
  }
};

export default function InfoPage() {
  const { pathname } = useLocation();
  const page = PAGE_CONTENT[pathname] || PAGE_CONTENT['/contact'];

  return (
    <section className="relative z-10 mx-auto max-w-3xl py-12">
      <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#aaa096] transition-colors hover:text-white">
        <ArrowLeft size={16} />
        Back to events
      </Link>

      <div className="admin-card p-6 sm:p-8">
        <p className="admin-eyebrow mb-3">{page.eyebrow}</p>
        <h1 className="text-3xl font-black tracking-tight text-[#f7efe3] sm:text-4xl">{page.title}</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-[#c7beb5]">
          {page.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        {page.email && (
          <a
            href={`mailto:${page.email}`}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#E23744] px-5 py-3 text-sm font-black text-white transition-colors hover:bg-[#f04552]"
          >
            <Mail size={16} />
            Email support
          </a>
        )}
      </div>
    </section>
  );
}
