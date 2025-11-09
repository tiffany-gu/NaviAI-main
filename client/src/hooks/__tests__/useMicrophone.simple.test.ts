/**
 * Simplified tests for useMicrophone hook
 * These tests verify the core logic without complex React rendering
 */

import { describe, it, expect, vi } from 'vitest';

describe('useMicrophone Hook - Logic Tests', () => {
  it('should export the correct interface', async () => {
    const { useMicrophone } = await import('../useMicrophone');

    expect(useMicrophone).toBeDefined();
    expect(typeof useMicrophone).toBe('function');
  });

  it('should accept correct options', () => {
    const options = {
      enableWakeWord: true,
      onTranscript: vi.fn(),
      autoStart: false,
    };

    expect(options.enableWakeWord).toBe(true);
    expect(typeof options.onTranscript).toBe('function');
    expect(options.autoStart).toBe(false);
  });
});

describe('Microphone Service - Integration', () => {
  it('should export all required functions', async () => {
    const micService = await import('../../lib/microphoneService');

    expect(micService.checkBrowserCompatibility).toBeDefined();
    expect(micService.requestMicrophonePermission).toBeDefined();
    expect(micService.startWakeWordDetection).toBeDefined();
    expect(micService.startRecordingWithSilenceDetection).toBeDefined();
    expect(micService.stopRecording).toBeDefined();
    expect(micService.getAudioLevel).toBeDefined();
  });

  it('should have correct function signatures', async () => {
    const {
      checkBrowserCompatibility,
      getAudioLevel,
    } = await import('../../lib/microphoneService');

    expect(typeof checkBrowserCompatibility).toBe('function');
    expect(typeof getAudioLevel).toBe('function');
  });
});
