import React from 'react';
import { ExternalLink } from 'lucide-react';

interface FormattedTextProps {
  text: string;
  className?: string;
}

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

export const FormattedText: React.FC<FormattedTextProps> = ({ text, className = '' }) => {
  if (!text) return null;

  // Split text by URL pattern
  const parts = text.split(URL_REGEX);

  return (
    <span className={`formatted-text-content ${className}`}>
      {parts.map((part, index) => {
        if (part.match(URL_REGEX)) {
          const href = part.startsWith('http') ? part : `https://${part}`;
          // Shorten long URLs for display
          let displayUrl = part;
          try {
            const urlObj = new URL(href);
            displayUrl = urlObj.hostname + (urlObj.pathname !== '/' && urlObj.pathname.length > 20 ? urlObj.pathname.slice(0, 18) + '...' : urlObj.pathname);
          } catch {
            displayUrl = part.length > 30 ? part.slice(0, 27) + '...' : part;
          }

          return (
            <a
              key={index}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="aero-link-pill"
              onClick={(e) => e.stopPropagation()}
              title={href}
            >
              <span className="aero-link-text">{displayUrl}</span>
              <ExternalLink size={12} className="aero-link-icon" />
            </a>
          );
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </span>
  );
};
