import React, { useState, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Download } from 'lucide-react';

interface ImageLightboxProps {
  imageUrl: string;
  caption?: string;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  imageUrl,
  caption,
  onClose,
}) => {
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `chat-image-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      {/* Lightbox Toolbar */}
      <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lightbox-tool-btn" onClick={handleZoomOut} title="Zoom out">
          <ZoomOut size={20} />
        </button>
        <span className="lightbox-zoom-level">{Math.round(scale * 100)}%</span>
        <button type="button" className="lightbox-tool-btn" onClick={handleZoomIn} title="Zoom in">
          <ZoomIn size={20} />
        </button>
        <button type="button" className="lightbox-tool-btn" onClick={handleRotate} title="Rotate">
          <RotateCw size={20} />
        </button>
        <button type="button" className="lightbox-tool-btn" onClick={handleDownload} title="Download image">
          <Download size={20} />
        </button>
        <button type="button" className="lightbox-tool-btn close-btn" onClick={onClose} title="Close">
          <X size={22} />
        </button>
      </div>

      {/* Image Container */}
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <img
          src={imageUrl}
          alt={caption || 'Full size chat image'}
          className="lightbox-image"
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transition: 'transform 0.18s ease-out',
          }}
        />
        {caption && <div className="lightbox-caption">{caption}</div>}
      </div>
    </div>
  );
};
