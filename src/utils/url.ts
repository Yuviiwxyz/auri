/**
 * URL and Public Domain Utilities
 * Guarantees that sharing links generated from Android APK or Web
 * always use the valid, reachable public domain.
 */

// Default fallback permanent domain
export const DEFAULT_PERMANENT_DOMAIN = 'https://auri-chat.onrender.com';

/**
 * Returns the public domain to be used for invite links and QR codes.
 * If running on a live web deployment (not localhost or capacitor), uses the current origin.
 * If running in Capacitor (Android APK) or local development, returns the permanent domain or user-configured custom domain.
 */
export function getAppPublicOrigin(): string {
  if (typeof window !== 'undefined') {
    const savedDomain = localStorage.getItem('auri_custom_domain');
    if (savedDomain && savedDomain.trim()) {
      return savedDomain.trim().replace(/\/+$/, '');
    }

    const origin = window.location.origin;
    // Check if origin is a valid external web domain (not localhost, 127.0.0.1, or capacitor://)
    if (
      origin &&
      !origin.includes('localhost') &&
      !origin.includes('127.0.0.1') &&
      !origin.startsWith('capacitor:') &&
      !origin.startsWith('file:')
    ) {
      return origin;
    }
  }

  return DEFAULT_PERMANENT_DOMAIN;
}

/**
 * Generates a clean invite URL that opens directly into a chat with this device/user.
 */
export function getShareUrl(peerId: string): string {
  const base = getAppPublicOrigin();
  const cleanId = peerId.trim().replace(/^@/, '');
  return `${base}/?user=${encodeURIComponent(cleanId)}`;
}

/**
 * Invokes native Android / Mobile share dialog if available, otherwise copies to clipboard.
 */
export async function shareInviteLink(peerId: string, displayName?: string): Promise<{ shared: boolean; copied: boolean }> {
  const url = getShareUrl(peerId);
  const name = displayName || peerId;
  const title = `Chat with ${name} on Auri`;
  const text = `Connect with me on Auri, private local-first chat for Android & Windows! Tap to open:`;

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title,
        text,
        url,
      });
      return { shared: true, copied: false };
    } catch (err: any) {
      // If user cancelled the share sheet, return false
      if (err.name === 'AbortError') {
        return { shared: false, copied: false };
      }
      // Otherwise fall back to clipboard
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(url);
    return { shared: false, copied: true };
  }

  return { shared: false, copied: false };
}
