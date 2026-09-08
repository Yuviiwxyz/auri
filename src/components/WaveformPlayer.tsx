import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause } from 'lucide-react';
import { formatAudioDuration } from '../services/audio';

interface WaveformPlayerProps {
  blob?: Blob;
  base64?: string;
  mimeType?: string;
  duration?: number;
  waveform?: number[];
  isMe?: boolean;
}

export const WaveformPlayer: React.FC<WaveformPlayerProps> = ({
  blob,
  base64,
  mimeType = 'audio/webm',
  duration = 0,
  waveform = [],
  isMe = false,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Generate stable 35 waveform bars
  const bars = React.useMemo(() => {
    if (waveform && waveform.length > 0) {
      return waveform;
    }
    // Fallback pseudo-waveform
    return Array.from({ length: 35 }, (_, i) => 0.2 + 0.6 * Math.sin(i * 0.4) ** 2);
  }, [waveform]);

  useEffect(() => {
    let url = '';
    if (blob) {
      url = URL.createObjectURL(blob);
    } else if (base64) {
      url = `data:${mimeType};base64,${base64}`;
    }
    setAudioUrl(url);

    return () => {
      if (blob && url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [blob, base64, mimeType]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = ratio * (audioRef.current.duration || duration);
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const toggleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextSpeed = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const progressRatio = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const activeBarCount = Math.floor(progressRatio * bars.length);

  return (
    <div className={`waveform-player ${isMe ? 'is-me' : 'is-peer'}`}>
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
      />

      <button
        type="button"
        className="play-pause-btn"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
      </button>

      <div className="waveform-body">
        {/* Interactive Waveform Bars */}
        <div
          className="waveform-bars-container"
          onClick={handleSeek}
          title="Click to seek"
          role="slider"
          aria-valuenow={Math.round(progressRatio * 100)}
          tabIndex={0}
        >
          {bars.map((heightNorm, idx) => {
            const isPlayed = idx <= activeBarCount;
            const barHeightPx = Math.max(4, Math.round(heightNorm * 28));
            return (
              <div
                key={idx}
                className={`waveform-bar ${isPlayed ? 'played' : 'unplayed'}`}
                style={{ height: `${barHeightPx}px` }}
              />
            );
          })}
        </div>

        {/* Time and Speed Indicator */}
        <div className="waveform-footer">
          <span className="waveform-time">
            {formatAudioDuration(isPlaying ? currentTime : duration)}
          </span>

          <button
            type="button"
            className="speed-toggle-btn"
            onClick={toggleSpeed}
            title="Change playback speed"
          >
            {playbackSpeed}x
          </button>
        </div>
      </div>
    </div>
  );
};
