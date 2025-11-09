# ElevenLabs Voice Output Integration

## Overview

NaviAI now includes **voice output** functionality using ElevenLabs text-to-speech API. When enabled, all AI assistant responses are automatically spoken aloud, creating a fully conversational experience.

---

## Features

- **Automatic Voice Output** - All AI messages are spoken automatically
- **High-Quality Voices** - Uses ElevenLabs' natural-sounding AI voices
- **Fast Response Time** - Uses `eleven_turbo_v2_5` model for low latency
- **Optional Feature** - App works normally without voice output if not configured
- **Customizable Voices** - Choose from hundreds of voices in the ElevenLabs library

---

## Setup Instructions

### 1. Create an ElevenLabs Account

1. Go to [ElevenLabs](https://elevenlabs.io/)
2. Sign up for an account
3. **Free tier includes:**
   - 10,000 characters/month
   - Access to all voices
   - Commercial use allowed

### 2. Get Your API Key

1. Log in to your ElevenLabs account
2. Go to [Profile Settings → API Keys](https://elevenlabs.io/app/settings/api-keys)
3. Click "Create API Key" or copy your existing key
4. Keep this key secure

### 3. (Optional) Choose a Voice

The default voice is **Sarah** (voice ID: `EXAVITQu4vr4xnSDxMaL`), but you can choose any voice:

1. Browse the [Voice Library](https://elevenlabs.io/voice-library)
2. Click on a voice to preview it
3. Copy the **Voice ID** (found in the voice details)
4. Popular choices:
   - **Sarah** - Warm, friendly female voice (default)
   - **Rachel** - Professional female voice
   - **Adam** - Deep, authoritative male voice
   - **Antoni** - Calm, soothing male voice

### 4. Configure Environment Variables

Add to your `.env.local` file:

```bash
# Required: Your ElevenLabs API key
VITE_ELEVENLABS_API_KEY=your_api_key_here

# Optional: Voice ID (defaults to Sarah if not set)
VITE_VOICE_ID=EXAVITQu4vr4xnSDxMaL
```

### 5. Restart the Development Server

```bash
npm run dev
```

That's it! The app will now speak all AI responses.

---

## How It Works

### Technical Flow

1. **AI generates a text response** → Displayed in chat
2. **ChatMessage component detects AI message** → `isUser === false`
3. **ElevenLabs service is called** → Sends text to API
4. **Audio is generated** → MP3 stream returned
5. **Audio plays automatically** → Browser plays the audio

### Code Structure

- **`client/src/lib/elevenLabsService.ts`** - Core TTS service
  - `convertToSpeech()` - Converts text to audio
  - `speakText()` - Convenience function with autoplay
  - `isTTSEnabled()` - Checks if configured

- **`client/src/components/ChatMessage.tsx`** - Integration point
  - Uses `useEffect` to trigger speech when AI message appears
  - Only speaks AI messages (not user messages)

### API Configuration

```typescript
{
  model_id: 'eleven_turbo_v2_5',  // Fast, low-latency model
  voice_settings: {
    stability: 0.5,              // Consistent voice
    similarity_boost: 0.75,       // Voice similarity
    style: 0.0,                   // Natural style
    use_speaker_boost: true       // Enhanced clarity
  }
}
```

---

## Usage

### Automatic Mode (Default)

Voice output is completely automatic:
1. Type or speak a message
2. AI responds with text
3. **Text is automatically spoken aloud**

No additional user interaction required!

### Browser Autoplay Restrictions

Modern browsers restrict autoplay, but this shouldn't be an issue because:
- User has already interacted with the page (typing/clicking)
- Audio playback is triggered by user action
- If blocked, audio will play on next click

---

## Customization

### Change Voice Settings

Edit `client/src/lib/elevenLabsService.ts`:

```typescript
const defaultOptions: TTSOptions = {
  model_id: 'eleven_turbo_v2_5',
  voice_settings: {
    stability: 0.5,        // 0.0-1.0: Lower = more variable
    similarity_boost: 0.75, // 0.0-1.0: Higher = more similar to original
    style: 0.0,            // 0.0-1.0: Adjust speaking style
    use_speaker_boost: true // Enhance clarity
  }
};
```

### Use Different Model

Available models:
- `eleven_turbo_v2_5` - **Fastest**, great quality (recommended)
- `eleven_multilingual_v2` - Multi-language support
- `eleven_monolingual_v1` - Original model, high quality

### Disable Voice Output

Simply remove or comment out the API key in `.env.local`:

```bash
# VITE_ELEVENLABS_API_KEY=your_api_key_here
```

The app will detect the missing key and skip voice output automatically.

---

## Pricing & Limits

### Free Tier
- **10,000 characters/month**
- All voices included
- Commercial use allowed
- Typical usage: ~200-300 messages/month

### Paid Plans
- **Starter**: $5/month - 30,000 characters
- **Creator**: $22/month - 100,000 characters
- **Pro**: $99/month - 500,000 characters

**Estimate**: Average AI response is ~50 characters, so:
- Free tier ≈ 200 responses
- Starter ≈ 600 responses
- Creator ≈ 2,000 responses

---

## Troubleshooting

### Voice Not Playing

1. **Check API key is set:**
   ```bash
   echo $VITE_ELEVENLABS_API_KEY
   ```

2. **Check browser console:**
   - Look for `[ElevenLabs]` logs
   - Common errors:
     - "API key not configured" → Add API key to `.env.local`
     - "401 Unauthorized" → Invalid API key
     - "429 Too Many Requests" → Quota exceeded

3. **Verify service is enabled:**
   - Open browser console
   - Look for: `[ElevenLabs] Converting text to speech...`

4. **Browser permissions:**
   - Ensure audio is not muted
   - Check browser audio permissions
   - Try clicking the page to enable autoplay

### Audio Cuts Off

- **Long messages**: ElevenLabs processes entire message
- **Network issues**: Check internet connection
- **API quota**: Verify you haven't exceeded monthly limit

### Wrong Voice

1. Check `VITE_VOICE_ID` in `.env.local`
2. Verify voice ID is correct (copy from ElevenLabs dashboard)
3. Restart dev server after changing `.env.local`

---

## Examples

### Basic Setup

```bash
# .env.local
VITE_ELEVENLABS_API_KEY=sk_abc123...
```

Result: Uses default Sarah voice

### Custom Voice

```bash
# .env.local
VITE_ELEVENLABS_API_KEY=sk_abc123...
VITE_VOICE_ID=21m00Tcm4TlvDq8ikWAM  # Rachel's voice
```

Result: Uses Rachel's professional female voice

---

## Best Practices

1. **Test with free tier first** - 10,000 characters is plenty for testing
2. **Monitor usage** - Check ElevenLabs dashboard for character count
3. **Choose appropriate voice** - Match voice personality to app tone
4. **Handle errors gracefully** - App continues working if voice fails
5. **Respect user preferences** - Consider adding mute toggle in future

---

## Future Enhancements

Potential improvements:
- [ ] Add mute/unmute button in UI
- [ ] Voice speed control
- [ ] Voice selection dropdown
- [ ] Cache frequently used phrases
- [ ] Multi-language support
- [ ] Voice cloning (for custom brand voice)

---

## API Reference

### `convertToSpeech(text, options?)`

Converts text to audio.

**Parameters:**
- `text` (string): Text to convert
- `options` (object, optional): Voice settings override

**Returns:** Promise<HTMLAudioElement>

**Example:**
```typescript
const audio = await convertToSpeech("Hello, world!");
await audio.play();
```

### `speakText(text, options?)`

Convenience function that converts and plays audio.

**Parameters:**
- `text` (string): Text to speak
- `options` (object, optional): Voice settings override

**Returns:** Promise<void>

**Example:**
```typescript
await speakText("Route calculated successfully!");
```

### `isTTSEnabled()`

Check if TTS is configured.

**Returns:** boolean

**Example:**
```typescript
if (isTTSEnabled()) {
  console.log("Voice output is enabled");
}
```

---

## Support

For issues related to:
- **ElevenLabs API**: [ElevenLabs Support](https://elevenlabs.io/support)
- **Integration issues**: Check browser console logs
- **Voice quality**: Try different voice IDs or adjust settings

---

## Credits

- **Voice Technology**: [ElevenLabs](https://elevenlabs.io/)
- **Integration**: NaviAI Team
- **Date**: January 2025
