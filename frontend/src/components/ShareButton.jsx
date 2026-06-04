import { Share2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import {
  buildPlatformShareUrl,
  buildSharePayload,
  copyShareUrl,
  openShareWindow,
  shareWithDevice
} from '../utils/share';

export default function ShareButton({ event, url, title, description }) {
  const [showMenu, setShowMenu] = useState(false);
  const menuId = useId();
  const sharePayload = buildSharePayload({ event, url, title, description });

  useEffect(() => {
    if (!showMenu) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowMenu(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showMenu]);

  const handleShare = async (platform) => {
    setShowMenu(false);

    if (platform === 'native' && navigator.share) {
      try {
        await shareWithDevice(sharePayload);
        toast.success('Shared successfully');
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Share error:', error);
        }
      }
      return;
    }

    if (platform === 'copy') {
      try {
        await copyShareUrl(sharePayload.url);
        toast.success('Link copied to clipboard');
      } catch (error) {
        console.error('Clipboard error:', error);
        toast.error('Failed to copy link');
      }
      return;
    }

    const openUrl = buildPlatformShareUrl(platform, sharePayload);
    if (openUrl) {
      openShareWindow(openUrl);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-[#d9d0c6] transition-colors hover:bg-[#f2e7d8] hover:text-[#17110d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23744]"
        aria-label="Share event"
        aria-expanded={showMenu}
        aria-haspopup="menu"
        aria-controls={showMenu ? menuId : undefined}
      >
        <Share2 size={18} />
        <span>Share</span>
      </button>

      {showMenu && (
        <>
          <button
            type="button"
            aria-label="Close share menu"
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div
            id={menuId}
            role="menu"
            aria-label="Share options"
            className="absolute right-0 z-20 mt-2 w-52 rounded-2xl border border-white/10 bg-[#12100e] py-2 shadow-[0_18px_70px_rgba(0,0,0,0.35)]"
          >
            {navigator.share && (
              <button
                type="button"
                role="menuitem"
                onClick={() => handleShare('native')}
                className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#d9d0c6] transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                Share via device
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => handleShare('facebook')}
              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#d9d0c6] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              Facebook
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => handleShare('twitter')}
              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#d9d0c6] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              X
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => handleShare('linkedin')}
              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#d9d0c6] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              LinkedIn
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => handleShare('whatsapp')}
              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#d9d0c6] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              WhatsApp
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => handleShare('email')}
              className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#d9d0c6] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              Email
            </button>
            <hr className="my-2 border-white/10" />
            <button
              type="button"
              role="menuitem"
              onClick={() => handleShare('copy')}
              className="w-full px-4 py-2.5 text-left text-sm font-black text-[#ff9aa2] transition-colors hover:bg-[#E23744]/10 hover:text-white"
            >
              Copy link
            </button>
          </div>
        </>
      )}
    </div>
  );
}
