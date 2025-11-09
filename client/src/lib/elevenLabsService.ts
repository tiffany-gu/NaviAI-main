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
 * Play text as speech with automatic handling of browser autoplay restrictions
 * @param text - The text to speak
 * @param options - Optional TTS configuration
 * @returns Promise that resolves when audio starts playing
 */
export async function speakText(
  text: string,
  options: TTSOptions = {}
): Promise<void> {
  try {
    const audio = await convertToSpeech(text, options);

    // Try to play automatically
    try {
      await audio.play();
      console.log('[ElevenLabs] Audio playing automatically');
    } catch (error) {
      // If autoplay is blocked, log a message
      // In a chat interface, the user has already interacted, so this shouldn't happen often
      console.warn('[ElevenLabs] Autoplay blocked. Audio ready but needs user interaction.');

      // Store the audio element for potential manual playback
      // You could emit an event here or return the audio element
      // For now, we'll try to play on next user interaction
      const playOnClick = () => {
        audio.play().catch(console.error);
        document.removeEventListener('click', playOnClick);
      };
      document.addEventListener('click', playOnClick, { once: true });
    }
  } catch (error) {
    // If ElevenLabs is not configured or fails, fail silently
    // The app should continue to work without voice
    console.error('[ElevenLabs] Failed to speak text:', error);
  }
}

/**
 * Check if ElevenLabs TTS is enabled/configured
 * @returns true if API key is configured
 */
export function isTTSEnabled(): boolean {
  return !!API_KEY;
}
