import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, RefreshCw, Send } from 'lucide-react';
import { processImageFile, type ProcessedImage } from '../services/media';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoCaptured: (processed: ProcessedImage) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onPhotoCaptured,
}) => {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(
    isMobile ? 'environment' : 'user'
  );
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string>('');
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nativeFallbackRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopCamera();
      resetState();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async (mode: 'user' | 'environment') => {
    stopCamera();
    setErrorMsg('');

    // Strategy 1: Smart facingMode with ideal constraints
    try {
      const constraints: MediaStreamConstraints = {
        video: isMobile
          ? { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      attachStreamToVideo(mediaStream);
      return;
    } catch (err: any) {
      console.warn('Strategy 1 camera constraints failed, attempting basic facingMode...', err);
    }

    // Strategy 2: simple facingMode
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode },
        audio: false,
      });
      attachStreamToVideo(mediaStream);
      return;
    } catch (err: any) {
      console.warn('Strategy 2 facingMode failed, trying generic video: true...', err);
    }

    // Strategy 3: Plain video: true (universal fallback for Windows/webcam)
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      attachStreamToVideo(mediaStream);
      return;
    } catch (fallbackErr: any) {
      console.error('All camera strategies failed:', fallbackErr);
      setErrorMsg(
        'In-app camera preview could not be started. You can still snap a photo using your device camera below!'
      );
    }
  };

  const attachStreamToVideo = (mediaStream: MediaStream) => {
    setStream(mediaStream);
    const video = videoRef.current;
    if (video) {
      video.srcObject = mediaStream;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.setAttribute('autoplay', 'true');
      video.muted = true;
      video.onloadedmetadata = () => {
        video.play().catch((playErr) => console.warn('Video play prevented:', playErr));
      };
      video.play().catch((playErr) => console.warn('Video play immediate error:', playErr));
    }
  };

  const handleNativeFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsProcessing(true);
      const processed = await processImageFile(file);
      onPhotoCaptured(processed);
      onClose();
    } catch (err) {
      console.error('Native photo processing error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const resetState = () => {
    setCapturedBlob(null);
    setCapturedDataUrl('');
    setIsFlashing(false);
    setErrorMsg('');
    setIsProcessing(false);
  };

  const handleSnap = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Trigger visual camera flash
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    // Draw video frame to canvas
    if (facingMode === 'user') {
      // Mirror selfie
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedDataUrl(dataUrl);

    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedBlob(blob);
      }
    }, 'image/jpeg', 0.9);

    stopCamera();
  };

  const handleRetake = () => {
    setCapturedBlob(null);
    setCapturedDataUrl('');
    startCamera(facingMode);
  };

  const handleSend = async () => {
    if (!capturedBlob) return;
    try {
      setIsProcessing(true);
      const processed = await processImageFile(capturedBlob);
      onPhotoCaptured(processed);
      onClose();
    } catch (err) {
      console.error('Error processing captured photo:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="camera-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="camera-modal-header">
          <div className="camera-title-group">
            <Camera size={20} className="aero-icon-glow" />
            <span>Camera Viewfinder</span>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Viewfinder / Preview Frame */}
        <div className="camera-viewfinder-viewport">
          {isFlashing && <div className="camera-flash-overlay" />}

          {errorMsg ? (
            <div className="camera-error-notice">
              <Camera size={40} style={{ color: 'var(--aero-sky)', marginBottom: 12 }} />
              <p>{errorMsg}</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button type="button" className="aero-btn secondary" onClick={() => startCamera(facingMode)}>
                  Retry In-App
                </button>
                <button
                  type="button"
                  className="aero-btn primary"
                  onClick={() => nativeFallbackRef.current?.click()}
                >
                  <Camera size={16} />
                  <span>Use Device Camera</span>
                </button>
              </div>
              <input
                ref={nativeFallbackRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handleNativeFileSelected}
              />
            </div>
          ) : capturedDataUrl ? (
            <img src={capturedDataUrl} alt="Captured preview" className="camera-preview-img" />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`camera-video-feed ${facingMode === 'user' ? 'mirrored' : ''}`}
            />
          )}

          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {/* Controls Bar */}
        <div className="camera-controls-bar">
          {capturedDataUrl ? (
            <div className="camera-review-actions">
              <button
                type="button"
                className="aero-btn secondary"
                onClick={handleRetake}
                disabled={isProcessing}
              >
                <RefreshCw size={16} />
                <span>Retake</span>
              </button>

              <button
                type="button"
                className="aero-btn primary pulse"
                onClick={handleSend}
                disabled={isProcessing}
              >
                {isProcessing ? <span>Sending...</span> : (
                  <>
                    <Send size={16} />
                    <span>Send Photo</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="camera-live-actions">
              <button
                type="button"
                className="camera-tool-circle"
                onClick={toggleFacingMode}
                title="Switch Camera (Front/Back)"
              >
                <RefreshCw size={20} />
              </button>

              <button
                type="button"
                className="camera-shutter-ring"
                onClick={handleSnap}
                title="Take Photo"
              >
                <div className="camera-shutter-core" />
              </button>

              <div style={{ width: 44 }} /> {/* Balance spacer */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
