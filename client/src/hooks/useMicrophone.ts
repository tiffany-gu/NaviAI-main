import { useState, useRef, useCallback, useEffect } from 'react';
import {
  MicrophoneState,
  startWakeWordDetection,
  startRecordingWithSilenceDetection,
  stopRecording,
  requestMicrophonePermission,
  checkBrowserCompatibility
} from '@/lib/microphoneService';

export interface UseMicrophoneOptions {
  enableWakeWord?: boolean; // Enable "Hey Journey" wake word detection
  onTranscript?: (text: string) => void; // Callback when transcript is received
  autoStart?: boolean; // Auto-start listening on mount (if browser allows)
}

export function useMicrophone(options: UseMicrophoneOptions = {}) {
  const { enableWakeWord = false, onTranscript, autoStart = false } = options;

  const [isListening, setIsListening] = useState(false); // Listening for wake word
  const [isRecording, setIsRecording] = useState(false); // Actively recording user speech
  const [transcription, setTranscription] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wakeWordRecognitionRef = useRef<any>(null);
  const recordingStateRef = useRef<MicrophoneState | null>(null);
  const isListeningRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  /**
   * Handle when recording is complete and we have a transcript
   */
  const handleTranscript = useCallback((text: string) => {
    console.log('[useMicrophone] Transcript received:', text);
    setTranscription(text);
    setIsRecording(false);
    
    if (onTranscript) {
      onTranscript(text);
    }

    // If wake word is enabled, restart listening after recording
    if (enableWakeWord && isListeningRef.current) {
      setTimeout(() => {
        if (isListeningRef.current && !wakeWordRecognitionRef.current) {
          console.log('[useMicrophone] Restarting wake word detection...');
          wakeWordRecognitionRef.current = startWakeWordDetection(
            handleWakeWordDetected,
            () => isListeningRef.current
          );
        }
      }, 1000);
    }
  }, [onTranscript, enableWakeWord]);

  /**
   * Handle stopping the current recording
   */
  const handleStopRecording = useCallback(() => {
    console.log('[useMicrophone] Stopping recording...');
    if (recordingStateRef.current) {
      stopRecording(recordingStateRef.current);
      recordingStateRef.current = null;
    }
    setIsRecording(false);
  }, []);

  /**
   * Handle when wake word is detected
   */
  const handleWakeWordDetected = useCallback(async () => {
    console.log('[useMicrophone] Wake word detected! Starting recording...');
    setIsRecording(true);
    
    const state = await startRecordingWithSilenceDetection(
      handleTranscript,
      handleStopRecording
    );
    
    if (state) {
      recordingStateRef.current = state;
    } else {
      setError('Failed to start recording');
      setIsRecording(false);
    }
  }, [handleTranscript, handleStopRecording]);

  /**
   * Start listening (wake word detection or direct recording)
   */
  const startListening = useCallback(async (isAutoStart = false) => {
    console.log('[useMicrophone] startListening called - enableWakeWord:', enableWakeWord, 'isAutoStart:', isAutoStart);

    if (!checkBrowserCompatibility()) {
      const errorMsg = 'Your browser does not support speech recognition. Please use Chrome or Edge.';
      console.error('[useMicrophone] Browser compatibility check failed');
      setError(errorMsg);
      if (!isAutoStart) {
        alert(errorMsg);
      }
      return false;
    }
    console.log('[useMicrophone] Browser compatibility check passed');

    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      const errorMsg = 'Could not access microphone. Please check permissions.';
      console.error('[useMicrophone] Microphone permission denied');
      setError(errorMsg);
      if (!isAutoStart) {
        alert(errorMsg);
      }
      return false;
    }
    console.log('[useMicrophone] Microphone permission granted');

    setError(null);

    if (enableWakeWord) {
      // Start wake word detection
      console.log('[useMicrophone] Starting wake word detection mode...');

      // CRITICAL FIX: Update ref BEFORE starting wake word detection
      isListeningRef.current = true;
      setIsListening(true);

      wakeWordRecognitionRef.current = startWakeWordDetection(
        handleWakeWordDetected,
        () => isListeningRef.current
      );
      console.log('[useMicrophone] Wake word detection started - listening for "Hey Journey"');
    } else {
      // Start recording directly
      console.log('[useMicrophone] Starting direct recording mode...');
      setIsRecording(true);
      const state = await startRecordingWithSilenceDetection(
        handleTranscript,
        handleStopRecording
      );

      if (state) {
        recordingStateRef.current = state;
        console.log('[useMicrophone] Direct recording started');
      } else {
        console.error('[useMicrophone] Failed to start recording');
        setError('Failed to start recording');
        setIsRecording(false);
        return false;
      }
    }

    return true;
  }, [enableWakeWord, handleWakeWordDetected, handleTranscript, handleStopRecording]);

  /**
   * Stop listening (wake word detection or recording)
   */
  const stopListening = useCallback(() => {
    console.log('[useMicrophone] Stopping listening...');

    // CRITICAL FIX: Update ref BEFORE stopping to prevent race conditions
    isListeningRef.current = false;

    // Stop wake word detection
    if (wakeWordRecognitionRef.current) {
      try {
        wakeWordRecognitionRef.current.stop();
      } catch (e) {
        console.error('[useMicrophone] Error stopping wake word detection:', e);
      }
      wakeWordRecognitionRef.current = null;
    }

    // Stop active recording
    handleStopRecording();

    setIsListening(false);
    setIsRecording(false);
    setError(null);
  }, [handleStopRecording]);

  /**
   * Toggle listening on/off
   */
  const toggleListening = useCallback(async () => {
    console.log('[useMicrophone] toggleListening called - isListening:', isListening, 'isRecording:', isRecording);
    if (isListening || isRecording) {
      console.log('[useMicrophone] Stopping listening...');
      stopListening();
    } else {
      console.log('[useMicrophone] Starting listening...');
      await startListening(false);
    }
  }, [isListening, isRecording, stopListening, startListening]);

  /**
   * Manually stop recording (useful for manual stop button)
   */
  const manualStopRecording = useCallback(() => {
    if (isRecording) {
      handleStopRecording();
    }
  }, [isRecording, handleStopRecording]);

  /**
   * Clear the current transcription
   */
  const clearTranscription = useCallback(() => {
    setTranscription(null);
  }, []);

  // Auto-start on mount if requested (may fail due to browser requiring user gesture)
  useEffect(() => {
    if (autoStart) {
      console.log('[useMicrophone] Auto-starting...');
      const tryAutoStart = async () => {
        const result = await startListening(true);
        console.log('[useMicrophone] Auto-start result:', result);
      };
      tryAutoStart();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[useMicrophone] Cleaning up on unmount...');
      if (wakeWordRecognitionRef.current) {
        try {
          wakeWordRecognitionRef.current.stop();
        } catch (e) {
          console.error('[useMicrophone] Error stopping wake word on unmount:', e);
        }
      }
      if (recordingStateRef.current) {
        stopRecording(recordingStateRef.current);
      }
    };
  }, []);

  return {
    isListening,      // Is wake word detection active
    isRecording,      // Is actively recording user speech
    transcription,    // Last transcription received
    error,            // Last error message
    startListening,   // Start listening (wake word or direct recording)
    stopListening,    // Stop all listening
    toggleListening,  // Toggle listening on/off
    manualStopRecording, // Manually stop recording
    clearTranscription,  // Clear transcription
  };
}

