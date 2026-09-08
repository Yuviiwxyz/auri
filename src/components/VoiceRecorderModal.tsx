import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Send, Trash2, Play, Pause } from 'lucide-react';
import { audioRecorder, formatAudioDuration, type AudioRecordingResult } from '../services/audio';

interface VoiceRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendAudio: (result: AudioRecordingResult) => void;
}

export const VoiceRecorderModal: React.FC<VoiceRecorderModalProps> = ({
  isOpen,
  onClose,
  onSendAudio,
}) => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedResult, setRecordedResult] = useState<AudioRecordingResult | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [recentAmplitudes, setRecentAmplitudes] = useState<number[]>([]);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const [previewTime, setPreviewTime] = useState<number>(0);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  const timerRef = useRef<any>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-start recording when modal opens
  useEffect(() => {
    if (isOpen) {
      start();
    } else {
      cleanup();
    }
    return () => {
      cleanup();
    };
  }, [isOpen]);

  const start = async () => {
    try {
      setRecordedResult(null);
      setElapsedSec(0);
      setRecentAmplitudes(Array(32).fill(0.12));

      await audioRecorder.startRecording((amplitude) => {
        setRecentAmplitudes((prev) => [...prev.slice(1), amplitude]);
      });

      setIsRecording(true);
      timerRef.current = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access error:', err);
      alert('Microphone permission is required to record voice notes.');
      onClose();
    }
  };

  const handleStopAndReview = async () => {
    if (!isRecording) return;
    clearInterval(timerRef.current);
    setIsRecording(false);

    try {
      const result = await audioRecorder.stopRecording();
      setRecordedResult(result);
      const url = URL.createObjectURL(result.blob);
      setPreviewUrl(url);
    } catch (err) {
      console.error('Failed to stop recording:', err);
      onClose();
    }
  };

  const handleSendImmediately = async () => {
    if (recordedResult) {
      onSendAudio(recordedResult);
      cleanup();
      onClose();
      return;
    }

    if (isRecording) {
      clearInterval(timerRef.current);
      setIsRecording(false);
      try {
        const result = await audioRecorder.stopRecording();
        onSendAudio(result);
      } catch (err) {
        console.error('Failed to send recording:', err);
      }
      cleanup();
      onClose();
    }
  };

  const handleCancel = () => {
    audioRecorder.cancelRecording();
    cleanup();
    onClose();
  };

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    setIsRecording(false);
    setRecordedResult(null);
    setElapsedSec(0);
    setIsPreviewPlaying(false);
  };

  const togglePreviewPlay = () => {
    if (!previewAudioRef.current) return;
    if (isPreviewPlaying) {
      previewAudioRef.current.pause();
    } else {
      previewAudioRef.current.play();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={handleCancel}>
      <div className="voice-recorder-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="recorder-header">
          <div className="recording-status">
            {isRecording ? (
              <>
                <span className="pulsing-recording-dot" />
                <span className="status-label">Recording Voice Note...</span>
              </>
            ) : (
              <span className="status-label">Preview Voice Note</span>
            )}
          </div>
          <span className="recorder-duration-timer">
            {formatAudioDuration(isRecording ? elapsedSec : (recordedResult?.duration || 0))}
          </span>
        </div>

        {/* Live Audio Visualizer Bars */}
        {isRecording ? (
          <div className="live-equalizer">
            {recentAmplitudes.map((amp, index) => {
              const barHeight = Math.max(6, Math.round(amp * 56));
              return (
                <div
                  key={index}
                  className="equalizer-bar"
                  style={{
                    height: `${barHeight}px`,
                    opacity: 0.75 + Math.min(0.25, amp * 0.4),
                  }}
                />
              );
            })}
          </div>
        ) : recordedResult ? (
          <div className="preview-playback-container">
            <audio
              ref={previewAudioRef}
              src={previewUrl}
              onPlay={() => setIsPreviewPlaying(true)}
              onPause={() => setIsPreviewPlaying(false)}
              onTimeUpdate={() => {
                if (previewAudioRef.current) {
                  setPreviewTime(previewAudioRef.current.currentTime);
                }
              }}
              onEnded={() => {
                setIsPreviewPlaying(false);
                setPreviewTime(0);
              }}
            />
            <button
              type="button"
              className="preview-play-btn"
              onClick={togglePreviewPlay}
            >
              {isPreviewPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
            </button>
            <div className="preview-waveform">
              {recordedResult.waveform.map((bar, i) => (
                <div
                  key={i}
                  className="preview-wave-bar"
                  style={{ height: `${Math.max(4, Math.round(bar * 36))}px` }}
                />
              ))}
            </div>
            <span className="preview-time">
              {formatAudioDuration(previewTime || recordedResult.duration)}
            </span>
          </div>
        ) : null}

        {/* Action Buttons */}
        <div className="recorder-actions">
          <button
            type="button"
            className="action-btn cancel-btn"
            onClick={handleCancel}
            title="Discard voice note"
          >
            <Trash2 size={18} />
            <span>Discard</span>
          </button>

          {isRecording ? (
            <button
              type="button"
              className="action-btn review-btn"
              onClick={handleStopAndReview}
              title="Stop and preview"
            >
              <Square size={18} />
              <span>Review</span>
            </button>
          ) : (
            <button
              type="button"
              className="action-btn record-again-btn"
              onClick={start}
              title="Record again"
            >
              <Mic size={18} />
              <span>Re-record</span>
            </button>
          )}

          <button
            type="button"
            className="action-btn send-btn"
            onClick={handleSendImmediately}
            title="Send voice note"
          >
            <Send size={18} />
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  );
};
