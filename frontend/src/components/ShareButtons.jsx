import { Share2, Link, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    buildPlatformShareUrl,
    buildSharePayload,
    copyShareUrl,
    openShareWindow,
    shareWithDevice
} from '../utils/share';

export default function ShareButtons({ event, title, url, description }) {
    const sharePayload = buildSharePayload({ event, title, url, description });

    const handleCopyLink = async () => {
        try {
            await copyShareUrl(sharePayload.url);
            toast.success('Link copied to clipboard');
        } catch (err) {
            toast.error('Failed to copy link');
        }
    };

    const handleWebShare = async () => {
        if (navigator.share) {
            try {
                await shareWithDevice(sharePayload);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Share failed:', err);
                }
            }
        }
    };

    const shareToWhatsApp = () => {
        openShareWindow(buildPlatformShareUrl('whatsapp', sharePayload));
    };

    const shareToTwitter = () => {
        openShareWindow(buildPlatformShareUrl('twitter', sharePayload));
    };

    const shareToFacebook = () => {
        openShareWindow(buildPlatformShareUrl('facebook', sharePayload));
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* Web Share API (mobile-friendly) */}
            {navigator.share && (
                <button
                    type="button"
                    onClick={handleWebShare}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-[#d9d0c6] transition-colors hover:bg-[#f2e7d8] hover:text-[#17110d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744]"
                    title="Share"
                    aria-label="Share"
                >
                    <Share2 size={18} />
                    <span className="text-sm font-medium">Share</span>
                </button>
            )}

            {/* WhatsApp */}
            <button
                type="button"
                onClick={shareToWhatsApp}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[#d9d0c6] transition-colors hover:bg-[#f2e7d8] hover:text-[#17110d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744]"
                title="Share on WhatsApp"
                aria-label="Share on WhatsApp"
            >
                <MessageCircle size={20} />
            </button>

            {/* Twitter/X */}
            <button
                type="button"
                onClick={shareToTwitter}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[#d9d0c6] transition-colors hover:bg-[#f2e7d8] hover:text-[#17110d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744]"
                title="Share on X (Twitter)"
                aria-label="Share on X"
            >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
            </button>

            {/* Facebook */}
            <button
                type="button"
                onClick={shareToFacebook}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[#d9d0c6] transition-colors hover:bg-[#f2e7d8] hover:text-[#17110d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744]"
                title="Share on Facebook"
                aria-label="Share on Facebook"
            >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
            </button>

            {/* Copy Link */}
            <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[#d9d0c6] transition-colors hover:bg-[#f2e7d8] hover:text-[#17110d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744]"
                title="Copy Link"
                aria-label="Copy link"
            >
                <Link size={20} />
            </button>
        </div>
    );
}
