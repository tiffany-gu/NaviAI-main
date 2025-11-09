/**
 * Test suite for microphone service
 * Run with: npm test (if vitest is configured)
 * Or manually test each function
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkBrowserCompatibility,
  requestMicrophonePermission,
  getAudioLevel,
  startWakeWordDetection,
  startRecordingWithSilenceDetection,
  stopRecording,
  MicrophoneState
} from '../microphoneService';

describe('Microphone Service', () => {
  describe('checkBrowserCompatibility', () => {
    it('should return true when SpeechRecognition is available', () => {
      // Mock SpeechRecognition
      (global as any).window = {
        webkitSpeechRecognition: class {},
      };

      const result = checkBrowserCompatibility();
      expect(result).toBe(true);
    });

    it('should return false when SpeechRecognition is not available', () => {
      (global as any).window = {};

      const result = checkBrowserCompatibility();
      expect(result).toBe(false);
    });
  });

  describe('requestMicrophonePermission', () => {
    beforeEach(() => {
      // Mock navigator.mediaDevices
      global.navigator = {
        mediaDevices: {
          getUserMedia: vi.fn(),
          enumerateDevices: vi.fn(),
        },
      } as any;
    });

    it('should return true when permission is granted', async () => {
      const mockStream = {
        getTracks: () => [{stop: vi.fn()}],
      };

      (navigator.mediaDevices.enumerateDevices as any).mockResolvedValue([
        { kind: 'audioinput', deviceId: '1' },
      ]);
      (navigator.mediaDevices.getUserMedia as any).mockResolvedValue(mockStream);

      const result = await requestMicrophonePermission();
      expect(result).toBe(true);
    });

    it('should return false when permission is denied', async () => {
      (navigator.mediaDevices.enumerateDevices as any).mockResolvedValue([
        { kind: 'audioinput', deviceId: '1' },
      ]);
      (navigator.mediaDevices.getUserMedia as any).mockRejectedValue(
        new Error('NotAllowedError')
      );

      const result = await requestMicrophonePermission();
      expect(result).toBe(false);
    });

    it('should return false when no audio devices are found', async () => {
      (navigator.mediaDevices.enumerateDevices as any).mockResolvedValue([]);

      const result = await requestMicrophonePermission();
      expect(result).toBe(false);
    });

    it('should timeout after 15 seconds', async () => {
      (navigator.mediaDevices.enumerateDevices as any).mockResolvedValue([
        { kind: 'audioinput', deviceId: '1' },
      ]);
      (navigator.mediaDevices.getUserMedia as any).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 20000))
      );

      const result = await requestMicrophonePermission();
      expect(result).toBe(false);
    }, 20000);
  });

  describe('Wake Word Detection', () => {
    it('should handle missing SpeechRecognition gracefully', () => {
      // No SpeechRecognition available
      (global as any).window = {};

      const onDetected = vi.fn();
      const isListening = () => true;

      const recognition = startWakeWordDetection(onDetected, isListening);

      expect(recognition).toBeNull();
    });

    it('should verify wake word detection logic', () => {
      // Create a proper mock class
      class MockSpeechRecognition {
        continuous = false;
        interimResults = false;
        lang = '';
        onresult: any = null;
        onerror: any = null;
        onend: any = null;
        start = vi.fn();
        stop = vi.fn();
      }

      (global as any).window = {
        SpeechRecognition: MockSpeechRecognition,
      };

      const onDetected = vi.fn();
      const isListening = () => true;

      const recognition = startWakeWordDetection(onDetected, isListening);

      expect(recognition).toBeDefined();
      if (recognition) {
        expect(recognition.continuous).toBe(true);
        expect(recognition.interimResults).toBe(true);
        expect(recognition.start).toHaveBeenCalled();
      }
    });
  });

  describe('Audio Level Detection', () => {
    it('should calculate audio level in decibels', () => {
      const mockAnalyser = {
        frequencyBinCount: 1024,
        getByteFrequencyData: vi.fn((dataArray) => {
          // Fill with test data
          for (let i = 0; i < dataArray.length; i++) {
            dataArray[i] = 128; // Mid-range volume
          }
        }),
      } as any;

      const level = getAudioLevel(mockAnalyser);
      expect(typeof level).toBe('number');
      expect(level).toBeLessThan(0); // dB should be negative for values < 255
    });

    it('should return very low dB for silence', () => {
      const mockAnalyser = {
        frequencyBinCount: 1024,
        getByteFrequencyData: vi.fn((dataArray) => {
          // Fill with silence
          for (let i = 0; i < dataArray.length; i++) {
            dataArray[i] = 0;
          }
        }),
      } as any;

      const level = getAudioLevel(mockAnalyser);
      expect(level).toBe(-Infinity); // log10(0) = -Infinity
    });
  });
});
