const truncate = (value, maxLength = 100) => {
  const text = String(value || '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

export const buildSharePayload = ({ event, url, title, description } = {}) => {
  const shareUrl = url || (event ? `${window.location.origin}/events/${event.id}` : window.location.href);
  const shareTitle = title || event?.title || 'Check out this event';
  const shareDescription = description || event?.description || '';
  const shareText = shareDescription
    ? `Check out ${shareTitle} - ${truncate(shareDescription)}`
    : shareTitle;

  return {
    url: shareUrl,
    title: shareTitle,
    text: shareText
  };
};

export const openShareWindow = (url) => {
  const shareWindow = window.open(url, '_blank', 'width=600,height=420,noopener,noreferrer');
  if (shareWindow) shareWindow.opener = null;
};

export const copyShareUrl = (url) => navigator.clipboard.writeText(url);

export const buildPlatformShareUrl = (platform, payload) => {
  const encodedUrl = encodeURIComponent(payload.url);
  const encodedTitle = encodeURIComponent(payload.title);
  const encodedText = encodeURIComponent(payload.text);

  const urls = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${payload.text} ${payload.url}`)}`,
    email: `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(`${payload.text}\n\n${payload.url}`)}`
  };

  return urls[platform] || '';
};

export const shareWithDevice = (payload) => navigator.share({
  title: payload.title,
  text: payload.text,
  url: payload.url
});
