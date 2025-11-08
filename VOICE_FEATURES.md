# Enhanced Voice Input Features

This document describes the enhanced voice input features integrated from the [ai_atl repository](https://github.com/lalitj5/ai_atl).

## Overview

The voice input system has been significantly upgraded with advanced features including:

1. **Automatic Silence Detection** - Stops recording after 3.5 seconds of silence
2. **Audio Level Monitoring** - Real-time volume detection for intelligent recording
3. **Wake Word Detection** - Optional "Hey Journey" activation (disabled by default)
4. **Enhanced Audio Quality** - Echo cancellation, noise suppression, and auto-gain control
5. **Better State Management** - Proper cleanup and resource management
6. **Robust Permission Handling** - Improved microphone access with timeout protection

## Architecture

### Files Added

- **`client/src/lib/microphoneService.ts`** - Core microphone service with wake word detection and audio monitoring
- **`client/src/hooks/useMicrophone.ts`** - Custom React hook for managing voice input state

### Files Modified

- **`client/src/pages/JourneyAssistant.tsx`** - Updated to use the new `useMicrophone` hook

## Features in Detail

### 1. Automatic Silence Detection

The system monitors audio levels in real-time and automatically stops recording after detecting 3.5 seconds of silence. This provides a hands-free experience - just speak your request and the system will automatically stop when you're done.

**Configuration:**
```typescript
const SILENCE_DURATION = 3500; // 3.5 seconds
const SILENCE_THRESHOLD = -20;  // -20 dB
```

### 2. Enhanced Audio Processing

The microphone service uses Web Audio API for superior audio processing:

- **Echo Cancellation** - Removes echo from the audio input
- **Noise Suppression** - Filters out background noise
- **Auto Gain Control** - Normalizes volume levels automatically

### 3. Wake Word Detection (Optional)

You can enable hands-free activation with the "Hey Journey" wake word. When enabled:

1. The app continuously listens for the wake word
2. Upon hearing "Hey Journey", it starts recording your request
3. After processing, it automatically returns to listening for the wake word

**To enable wake word detection:**

In `JourneyAssistant.tsx`, change:
```typescript
const {
  // ...
} = useMicrophone({
  enableWakeWord: true,  // Change to true
  // ...
});
```

**Note:** Wake word detection is disabled by default because continuous listening may impact performance and battery life on mobile devices.

### 4. Visual Feedback

The microphone button provides clear visual feedback:

- **Idle** - Normal outline button
- **Recording** - Red destructive variant with pulsing microphone icon
- **Listening for Wake Word** - Destructive variant (only when wake word is enabled)

## Usage

### Basic Usage (Current Default)

1. Click the microphone button
2. Speak your request
3. The system automatically stops after 3.5 seconds of silence
4. Your speech is transcribed and sent as a message

### With Wake Word (Optional)

1. Enable wake word in the code (see above)
2. The app automatically starts listening on load
3. Say "Hey Journey" to activate recording
4. Speak your request
5. The system automatically stops and returns to listening for the wake word

## API Reference

### `useMicrophone` Hook

```typescript
const {
  isListening,         // Boolean: Is wake word detection active
  isRecording,         // Boolean: Is actively recording user speech
  transcription,       // String | null: Last transcription received
  error,              // String | null: Last error message
  startListening,     // Function: Start listening (wake word or direct recording)
  stopListening,      // Function: Stop all listening
  toggleListening,    // Function: Toggle listening on/off
  manualStopRecording, // Function: Manually stop recording
  clearTranscription, // Function: Clear transcription
} = useMicrophone({
  enableWakeWord: false,      // Enable "Hey Journey" wake word detection
  onTranscript: (text) => {}, // Callback when transcript is received
  autoStart: false,           // Auto-start listening on mount
});
```

### Microphone Service Functions

#### `startWakeWordDetection(onWakeWordDetected, isListeningRef)`
Starts continuous listening for the wake word "Hey Journey".

#### `startRecordingWithSilenceDetection(onTranscript, onStopRecording)`
Starts recording with automatic silence detection and returns a promise with the microphone state.

#### `stopRecording(state)`
Stops recording and cleans up all resources (audio context, streams, etc.).

#### `requestMicrophonePermission()`
Requests microphone permission with timeout protection (5 seconds).

#### `checkBrowserCompatibility()`
Checks if the browser supports Web Speech API.

#### `getAudioLevel(analyser)`
Calculates the current audio level in decibels.

## Browser Compatibility

The voice features work in browsers that support:
- Web Speech API (`SpeechRecognition` or `webkitSpeechRecognition`)
- Web Audio API (`AudioContext`)
- MediaDevices API (`getUserMedia`)

**Supported browsers:**
- Chrome 25+
- Edge 79+
- Safari 14.1+ (with webkit prefix)

**Not supported:**
- Firefox (no Web Speech API support)
- Internet Explorer

## Troubleshooting

### Voice input not working

1. **Check browser compatibility** - Use Chrome or Edge for best results
2. **Allow microphone permissions** - Check browser settings
3. **Check console logs** - Look for error messages prefixed with `[useMicrophone]` or `[Recording]`

### Wake word not detected

1. Speak clearly: "Hey Journey"
2. Check that `enableWakeWord: true` is set
3. Ensure you're in a quiet environment
4. Look for console logs showing what's being heard

### Recording doesn't stop automatically

1. The system waits for 3.5 seconds of silence - make sure you stop speaking
2. Background noise may prevent silence detection - try a quieter environment
3. Manually click the microphone button to stop

### Microphone permission denied

1. Check browser settings and allow microphone access
2. On macOS, check System Preferences > Security & Privacy > Microphone
3. Try refreshing the page after granting permissions

## Performance Considerations

### Battery Impact
- Wake word detection continuously listens and may impact battery life on mobile devices
- Consider keeping `enableWakeWord: false` for mobile users
- Direct recording mode (default) only uses microphone when activated

### Resource Cleanup
The system properly cleans up all resources when:
- Recording stops
- Component unmounts
- User navigates away

This prevents memory leaks and ensures efficient resource usage.

## Future Enhancements

Possible future improvements:
1. **Custom wake words** - Allow users to set their own activation phrase
2. **Multi-language support** - Support for languages beyond English
3. **Push-to-talk mode** - Hold button to record, release to send
4. **Voice feedback** - Audio confirmation when wake word is detected
5. **Noise gate controls** - Adjustable silence threshold for different environments
6. **Transcription history** - Store and display recent voice commands

## Credits

Voice input features adapted from:
- Repository: [ai_atl by lalitj5](https://github.com/lalitj5/ai_atl)
- Original components: `useMicrophone.ts`, `microphoneService.ts`
- Integrated and adapted for NaviAI project

## Testing

To test the voice features:

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Open in a supported browser** (Chrome/Edge recommended)

3. **Grant microphone permissions** when prompted

4. **Test basic voice input:**
   - Click the microphone button
   - Say "From Atlanta to Boston"
   - Wait for silence detection to stop recording
   - Verify the message is transcribed and sent

5. **Test wake word (optional):**
   - Enable wake word in code
   - Say "Hey Journey"
   - Speak your request
   - Verify it processes correctly

## Support

For issues or questions:
1. Check console logs for error messages
2. Review this documentation
3. Check browser compatibility
4. Ensure microphone permissions are granted

