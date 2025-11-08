// Enhanced microphone service for wake word detection and audio monitoring
export interface MicrophoneState {
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  microphone: MediaStreamAudioSourceNode | null;
  javascriptNode: ScriptProcessorNode | null;
  currentStream: MediaStream | null;
  recognition: any; // SpeechRecognition type
}

const SILENCE_DURATION = 3500; // 3.5 seconds of silence before auto-stopping
const SILENCE_THRESHOLD = -20; // -20 dB threshold for silence detection
const WAKE_WORD = 'hey journey'; // Wake word to activate recording

/**
 * Calculate audio level in decibels
 */
export function getAudioLevel(analyser: AnalyserNode): number {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  const sum = dataArray.reduce((a, b) => a + b, 0);
  const average = sum / bufferLength;
  const dB = 20 * Math.log10(average / 255);

  return dB;
}

/**
 * Start continuous wake word detection
 */
export function startWakeWordDetection(
  onWakeWordDetected: () => void,
  isListeningRef: () => boolean
): any {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.error('Speech recognition not supported in this browser');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true; // Keep listening
  recognition.interimResults = true; // Get interim results for faster detection
  recognition.lang = 'en-US';

  recognition.onresult = (event: any) => {
    const transcript = Array.from(event.results)
      .map((result: any) => result[0].transcript)
      .join('')
      .toLowerCase()
      .trim();

    console.log('[Wake Word Detection] Heard:', transcript);

    if (isListeningRef() && transcript.includes(WAKE_WORD)) {
      console.log('[Wake Word Detection] Wake word detected!');
      recognition.stop();
      setTimeout(() => onWakeWordDetected(), 500);
    }
  };

  recognition.onerror = (event: any) => {
    console.error('[Wake Word Detection] Error:', event.error);
    if (event.error === 'no-speech') {
      // Restart after no speech detected
      setTimeout(() => {
        if (isListeningRef()) {
          try {
            recognition.start();
          } catch (e) {
            console.error('[Wake Word Detection] Failed to restart:', e);
          }
        }
      }, 100);
    }
  };

  recognition.onend = () => {
    console.log('[Wake Word Detection] Ended, restarting...');
    if (isListeningRef()) {
      try {
        recognition.start();
      } catch (e) {
        console.error('[Wake Word Detection] Failed to restart on end:', e);
      }
    }
  };

  try {
    recognition.start();
    console.log('[Wake Word Detection] Started listening for wake word');
  } catch (e) {
    console.error('[Wake Word Detection] Failed to start:', e);
  }

  return recognition;
}

/**
 * Start recording with silence detection and automatic stop
 */
export async function startRecordingWithSilenceDetection(
  onTranscript: (text: string) => void,
  onStopRecording: () => void
): Promise<MicrophoneState | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    let silenceTimer: NodeJS.Timeout | null = null;
    let hasSpoken = false;

    // Set up audio context for silence detection
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    const javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

    analyser.smoothingTimeConstant = 0.8;
    analyser.fftSize = 2048;

    microphone.connect(analyser);
    analyser.connect(javascriptNode);
    javascriptNode.connect(audioContext.destination);

    // Monitor audio levels for silence detection
    javascriptNode.onaudioprocess = () => {
      const volume = getAudioLevel(analyser);

      if (volume > SILENCE_THRESHOLD) {
        hasSpoken = true;
        // Clear silence timer if speaking
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      } else if (hasSpoken) {
        // Start silence timer only after user has spoken
        if (!silenceTimer) {
          console.log('[Recording] Silence detected, starting timer...');
          silenceTimer = setTimeout(() => {
            console.log('[Recording] Auto-stopping after silence');
            recognition.stop();
            onStopRecording();
          }, SILENCE_DURATION);
        }
      }
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      console.log('[Recording] Transcript:', transcript);
      onTranscript(transcript);
    };

    recognition.onerror = (error: any) => {
      console.error('[Recording] Speech recognition error:', error);
      if (silenceTimer) clearTimeout(silenceTimer);
      onStopRecording();
    };

    recognition.onend = () => {
      console.log('[Recording] Recognition ended');
      if (silenceTimer) clearTimeout(silenceTimer);
    };

    recognition.start();
    console.log('[Recording] Started recording with silence detection');

    return {
      audioContext,
      analyser,
      microphone,
      javascriptNode,
      currentStream: stream,
      recognition
    };
  } catch (error) {
    console.error('[Recording] Error starting recording:', error);
    return null;
  }
}

/**
 * Stop recording and cleanup resources
 */
export function stopRecording(state: MicrophoneState): void {
  console.log('[Recording] Stopping and cleaning up...');

  if (state.recognition) {
    try {
      state.recognition.stop();
    } catch (e) {
      console.error('[Recording] Error stopping recognition:', e);
    }
  }

  if (state.javascriptNode) {
    state.javascriptNode.disconnect();
    state.javascriptNode = null;
  }
  if (state.analyser) {
    state.analyser.disconnect();
    state.analyser = null;
  }
  if (state.microphone) {
    state.microphone.disconnect();
    state.microphone = null;
  }
  if (state.audioContext) {
    state.audioContext.close();
    state.audioContext = null;
  }
  if (state.currentStream) {
    state.currentStream.getTracks().forEach(track => track.stop());
    state.currentStream = null;
  }
}

/**
 * Request microphone permission with timeout and validation
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('[Microphone] MediaDevices API not supported');
      return false;
    }

    // Check if microphone devices are available
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices = devices.filter(device => device.kind === 'audioinput');

    if (audioDevices.length === 0) {
      console.error('[Microphone] No audio input devices found');
      return false;
    }

    // Request permission with timeout
    const getUserMediaPromise = navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const timeoutPromise = new Promise<MediaStream>((_, reject) => {
      setTimeout(() => reject(new Error('getUserMedia timeout after 5 seconds')), 5000);
    });

    const permissionStream = await Promise.race([getUserMediaPromise, timeoutPromise]);

    // Stop the stream immediately (we just needed permission)
    permissionStream.getTracks().forEach(track => track.stop());
    console.log('[Microphone] Permission granted');
    return true;
  } catch (error: any) {
    if (error.name === 'NotAllowedError') {
      console.error('[Microphone] Permission denied by user');
    } else {
      console.error('[Microphone] Error accessing microphone:', error);
    }
    return false;
  }
}

/**
 * Check browser compatibility for speech recognition
 */
export function checkBrowserCompatibility(): boolean {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.error('[Microphone] Speech recognition not supported in this browser');
    return false;
  }
  return true;
}

