export interface AudioRecordingResult {
  blob: Blob;
  duration: number; // in seconds
  waveform: number[]; // 35 normalized amplitude points (0.05 to 1.0)
  mimeType: string;
}

export type AmplitudeCallback = (amplitude: number) => void;

class AudioRecorderService {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private startTime: number = 0;
  private collectedAmplitudes: number[] = [];
  private onAmplitudeCallback: AmplitudeCallback | null = null;

  public async startRecording(onAmplitude?: AmplitudeCallback): Promise<void> {
    this.onAmplitudeCallback = onAmplitude || null;
    this.audioChunks = [];
    this.collectedAmplitudes = [];

    // Request microphone access
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Determine supported audio mime type
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      } else {
        mimeType = '';
      }
    }

    this.mediaRecorder = mimeType 
      ? new MediaRecorder(this.mediaStream, { mimeType, audioBitsPerSecond: 32000 })
      : new MediaRecorder(this.mediaStream);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    // Setup Web Audio API Analyser for real-time visualization & waveform extraction
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioCtxClass();

    // Explicitly resume AudioContext for mobile Android/iOS autoplay policy
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('AudioContext resume warning:', e);
      }
    }

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.4;
    source.connect(this.analyser);

    // Mobile Blink/WebKit requires audio graph connected to destination sink to pull buffers
    const silentGain = this.audioContext.createGain();
    silentGain.gain.value = 0;
    this.analyser.connect(silentGain);
    silentGain.connect(this.audioContext.destination);

    this.startTime = Date.now();
    this.mediaRecorder.start(100); // 100ms chunk interval

    this.monitorAmplitudes();
  }

  private monitorAmplitudes() {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    let lastEmitTime = 0;
    let waveTick = 0;

    const checkLevel = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);

      // Focus on human speech frequency bins (bins 0 to 16, ~80Hz to ~3200Hz)
      const speechBinCount = Math.min(16, dataArray.length);
      let sum = 0;
      let maxVal = 0;
      for (let i = 0; i < speechBinCount; i++) {
        const val = dataArray[i];
        sum += val;
        if (val > maxVal) maxVal = val;
      }
      const avg = sum / speechBinCount;
      const speechPower = (avg * 0.6 + maxVal * 0.4);

      waveTick += 0.2;
      let normalized: number;

      if (speechPower > 6) {
        // Active voice detected: scale dynamically into 0.25 to 1.0 range
        normalized = Math.min(1.0, 0.18 + (speechPower / 80) * 0.82);
      } else {
        // Ambient room / brief silence: subtle living wave ripple so visualizer never appears frozen
        const ambientRipple = 0.10 + Math.sin(waveTick) * 0.04;
        normalized = Math.max(0.06, ambientRipple);
      }

      this.collectedAmplitudes.push(normalized);

      const now = performance.now();
      // Throttle UI update callback to ~25fps (every 40ms) to prevent mobile React state congestion
      if (now - lastEmitTime >= 40) {
        lastEmitTime = now;
        if (this.onAmplitudeCallback) {
          this.onAmplitudeCallback(normalized);
        }
      }

      this.animFrameId = requestAnimationFrame(checkLevel);
    };

    checkLevel();
  }

  public async stopRecording(): Promise<AudioRecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('No active recording'));
        return;
      }

      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }

      const durationSec = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });

        // Normalize collected amplitudes into exactly 35 representative bars
        const waveform = this.normalizeWaveform(this.collectedAmplitudes, 35);

        this.cleanup();
        resolve({
          blob,
          duration: durationSec,
          waveform,
          mimeType,
        });
      };

      this.mediaRecorder.stop();
    });
  }

  public cancelRecording(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
    this.audioChunks = [];
    this.collectedAmplitudes = [];
    this.onAmplitudeCallback = null;
  }

  // Downsample or interpolate raw amplitude samples into fixed number of visual waveform bars
  private normalizeWaveform(samples: number[], targetBars: number): number[] {
    if (samples.length === 0) {
      return Array(targetBars).fill(0.2);
    }

    const result: number[] = [];
    const step = samples.length / targetBars;

    for (let i = 0; i < targetBars; i++) {
      const startIndex = Math.floor(i * step);
      const endIndex = Math.min(samples.length, Math.floor((i + 1) * step));
      let sum = 0;
      let count = 0;

      for (let j = startIndex; j < endIndex; j++) {
        sum += samples[j];
        count++;
      }

      const avg = count > 0 ? sum / count : samples[startIndex] || 0.2;
      // Clamp between 0.1 and 1.0 for aesthetic display
      result.push(Number(Math.max(0.12, Math.min(1.0, avg)).toFixed(2)));
    }

    return result;
  }
}

export const audioRecorder = new AudioRecorderService();

// Format seconds into "0:42" or "1:05"
export function formatAudioDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
