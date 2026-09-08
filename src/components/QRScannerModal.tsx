import React, { useState, useEffect, useRef } from 'react';
import { QrCode, X, Upload, Camera, AlertCircle } from 'lucide-react';
import jsQR from 'jsqr';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (scannedPeerId: string) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'image'>('camera');
  const [scanError, setScanError] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && activeTab === 'camera') {
      startCameraScanning();
    } else {
      stopCameraScanning();
    }
    return () => {
      stopCameraScanning();
    };
  }, [isOpen, activeTab]);

  const startCameraScanning = async () => {
    stopCameraScanning();
    setScanError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play();
        animFrameRef.current = requestAnimationFrame(scanTick);
      }
    } catch (err: any) {
      console.error('Camera QR scan error:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.play();
          animFrameRef.current = requestAnimationFrame(scanTick);
        }
      } catch (fallbackErr: any) {
        setScanError('Camera permission not granted or camera unavailable. Try "Scan Photo" instead.');
      }
    }
  };

  const stopCameraScanning = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const scanTick = () => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanTick);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        handleDecodedCode(code.data);
        return;
      }
    }

    animFrameRef.current = requestAnimationFrame(scanTick);
  };

  const handleDecodedCode = (dataString: string) => {
    let peerId = dataString.trim();

    // Check if it's an account URL like https://...?user=tulu_didi or ?connect=alex99
    if (peerId.includes('?user=')) {
      const match = peerId.match(/[?&]user=([^&#]+)/);
      if (match) peerId = decodeURIComponent(match[1]);
    } else if (peerId.includes('?connect=')) {
      const match = peerId.match(/[?&]connect=([^&#]+)/);
      if (match) peerId = decodeURIComponent(match[1]);
    } else {
      // Check if it was encoded as JSON
      try {
        const parsed = JSON.parse(dataString);
        if (parsed.peerId) {
          peerId = parsed.peerId;
        }
      } catch {
        // Plain text peer code
      }
    }

    peerId = peerId.trim().replace(/^@/, '');

    if (peerId) {
      stopCameraScanning();
      onScanSuccess(peerId);
      onClose();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanError('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code && code.data) {
          handleDecodedCode(code.data);
        } else {
          setScanError('No QR code detected in this image. Please ensure the QR code is clearly visible.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="qr-scanner-card" onClick={(e) => e.stopPropagation()}>
        <div className="qr-scanner-header">
          <div className="scanner-title-group">
            <QrCode size={20} className="aero-icon-glow" />
            <span>Scan Device QR Code</span>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="pairing-tabs">
          <button
            type="button"
            className={`pairing-tab-btn ${activeTab === 'camera' ? 'active' : ''}`}
            onClick={() => setActiveTab('camera')}
          >
            <Camera size={14} style={{ display: 'inline', marginRight: 6 }} />
            Live Camera
          </button>
          <button
            type="button"
            className={`pairing-tab-btn ${activeTab === 'image' ? 'active' : ''}`}
            onClick={() => setActiveTab('image')}
          >
            <Upload size={14} style={{ display: 'inline', marginRight: 6 }} />
            Scan from Photo
          </button>
        </div>

        {/* Content Viewport */}
        <div className="qr-scanner-viewport">
          {activeTab === 'camera' ? (
            <div className="scanner-camera-box">
              {scanError ? (
                <div className="scanner-error-box">
                  <AlertCircle size={32} style={{ color: '#f59e0b', marginBottom: 8 }} />
                  <p>{scanError}</p>
                </div>
              ) : (
                <>
                  <video ref={videoRef} className="scanner-video-feed" />
                  {/* Animated Frutiger Aero Reticle Target */}
                  <div className="scanner-reticle-overlay">
                    <div className="reticle-frame">
                      <div className="reticle-corner top-left" />
                      <div className="reticle-corner top-right" />
                      <div className="reticle-corner bottom-left" />
                      <div className="reticle-corner bottom-right" />
                      <div className="reticle-laser-line" />
                    </div>
                  </div>
                  <p className="scanner-hint-text">Point camera at peer device QR code</p>
                </>
              )}
            </div>
          ) : (
            <div className="scanner-upload-box">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <div
                className="upload-dropzone"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={36} className="upload-icon" />
                <p className="upload-title">Choose Photo or Screenshot</p>
                <span className="upload-subtitle">Tap to browse files containing a QR code</span>
              </div>
              {scanError && (
                <div className="scanner-error-box inline">
                  <AlertCircle size={16} />
                  <span>{scanError}</span>
                </div>
              )}
            </div>
          )}

          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
      </div>
    </div>
  );
};
