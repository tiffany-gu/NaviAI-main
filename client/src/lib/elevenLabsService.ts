/**
 * ElevenLabs Text-to-Speech Service
 *
 * Converts AI assistant messages to speech using ElevenLabs API
 */

const API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const VOICE_ID = import.meta.env.VITE_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Default voice ID (Sarah)

interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

interface TTSOptions {
  model_id?: string;
  voice_settings?: VoiceSettings;
}

// Audio queue management
let isPlaying = false;
const audioQueue: Array<() => Promise<void>> = [];

/**
 * Convert text to speech using ElevenLabs API
 * @param text - The text to convert to speech
 * @param options - Optional TTS configuration
 * @returns Audio element ready to play
 */
export async function convertToSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<HTMLAudioElement> {
  // Check if API key is configured
  if (!API_KEY) {
    console.warn('[ElevenLabs] API key not configured. Skipping text-to-speech.');
    throw new Error('ElevenLabs API key not configured');
  }

  // Default options
  const defaultOptions: TTSOptions = {
    model_id: 'eleven_turbo_v2_5', // Fast, high-quality model
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    },
  };

  // Merge with user options
  const finalOptions = {
    ...defaultOptions,
    ...options,
    voice_settings: {
      ...defaultOptions.voice_settings,
      ...options.voice_settings,
    },
  };

  console.log('[ElevenLabs] Converting text to speech:', text.substring(0, 50) + '...');

  try {
    // Call ElevenLabs API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: finalOptions.model_id,
          voice_settings: finalOptions.voice_settings,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail?.message || `ElevenLabs API Error: ${response.status}`
      );
    }

    // Convert response to blob
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    // Create audio element
    const audio = new Audio(audioUrl);

    console.log('[ElevenLabs] Audio generated successfully');

    return audio;
  } catch (error) {
    console.error('[ElevenLabs] Error generating speech:', error);
    throw error;
  }
}

/**
 * Process the audio queue sequentially
 */
async function processQueue(): Promise<void> {
  if (isPlaying || audioQueue.length === 0) {
    return;
  }

  isPlaying = true;
  const playNext = audioQueue.shift();

  if (playNext) {
    try {
      await playNext();
    } catch (error) {
      console.error('[ElevenLabs] Error playing queued audio:', error);
    }
  }

  isPlaying = false;

  // Process next item in queue
  if (audioQueue.length > 0) {
    processQueue();
  }
}

/**
 * Play a single audio element and wait for it to finish
 */
async function playAudioAndWait(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve, reject) => {
    // Set up event listeners
    const onEnded = () => {
      console.log('[ElevenLabs] Audio playback completed');
      cleanup();
      resolve();
    };

    const onError = (error: ErrorEvent) => {
      console.error('[ElevenLabs] Audio playback error:', error);
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };

    // Add listeners
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    // Start playback
    audio.play()
      .then(() => {
        console.log('[ElevenLabs] Audio playing');
      })
      .catch((error) => {
        console.warn('[ElevenLabs] Autoplay blocked, will try on next click');
        // If autoplay is blocked, set up click handler
        const playOnClick = () => {
          audio.play().catch(console.error);
          document.removeEventListener('click', playOnClick);
        };
        document.addEventListener('click', playOnClick, { once: true });
        cleanup();
        resolve(); // Resolve anyway to continue queue
      });
  });
}

/**
 * Play text as speech with automatic queuing to prevent overlaps
 * @param text - The text to speak
 * @param options - Optional TTS configuration
 * @returns Promise that resolves when audio is queued
 */
export async function speakText(
  text: string,
  options: TTSOptions = {}
): Promise<void> {
  try {
    // Add to queue
    audioQueue.push(async () => {
      try {
        const audio = await convertToSpeech(text, options);
        await playAudioAndWait(audio);
      } catch (error) {
        console.error('[ElevenLabs] Failed to speak text:', error);
      }
    });

    console.log(`[ElevenLabs] Added to queue (${audioQueue.length} items)`);

    // Start processing queue
    processQueue();
  } catch (error) {
    console.error('[ElevenLabs] Failed to queue speech:', error);
  }
}

/**
 * Check if ElevenLabs TTS is enabled/configured
 * @returns true if API key is configured
 */
export function isTTSEnabled(): boolean {
  return !!API_KEY;
}
