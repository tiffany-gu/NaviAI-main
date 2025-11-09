# Voice Input Testing Guide

## Quick Test (Manual)

### Prerequisites
- Chrome or Edge browser (required for Web Speech API)
- Microphone access allowed
- App running: `npm run dev` on http://localhost:3000

### Step-by-Step Test

1. **Open the App**
   ```bash
   open http://localhost:3000
   ```

2. **Open Browser Console** (F12 or Cmd+Opt+I)
   - You'll see detailed logs for debugging

3. **Click the Microphone Button**
   - You should see logs:
   ```
   [useMicrophone] toggleListening called - isListening: false isRecording: false
   [useMicrophone] Starting listening...
   [useMicrophone] Browser compatibility check passed
   ```

4. **Allow Microphone Permission** (if prompted)
   - You have 15 seconds to click "Allow"
   - Should see:
   ```
   [Microphone] Permission granted
   [Wake Word Detection] Started listening for wake word
   ```

5. **Check Visual Feedback**
   - Header should show: "Listening for 'Hey Journey'..." with blue ear icon

6. **Say "Hey Journey"**
   - Speak clearly and wait for detection
   - Console should show:
   ```
   [Wake Word Detection] Heard: hey journey
   [Wake Word Detection] Wake word detected!
   ```

7. **Speak Your Command**
   - Example: "Plan a route from San Francisco to Los Angeles"
   - Header should show: "Recording..." with red mic icon
   - Silence detection will auto-stop after 3.5 seconds

8. **Verify Message Sent**
   - Your command should appear in the chat
   - AI should respond with route planning

### Expected Console Output (Success)

```
[useMicrophone] toggleListening called - isListening: false isRecording: false
[useMicrophone] Starting listening...
[useMicrophone] startListening called - enableWakeWord: true isAutoStart: false
[useMicrophone] Browser compatibility check passed
[Microphone] Permission granted
[useMicrophone] Microphone permission granted
[useMicrophone] Starting wake word detection mode...
[Wake Word Detection] Started listening for wake word
[useMicrophone] Wake word detection started - listening for "Hey Journey"

// After saying "Hey Journey":
[Wake Word Detection] Heard: hey journey
[Wake Word Detection] Wake word detected!
[useMicrophone] Wake word detected! Starting recording...
[Recording] Started recording with silence detection

// After speaking command:
[Recording] Transcript: plan a route from san francisco to los angeles
[JourneyAssistant] Voice transcript received: plan a route from san francisco to los angeles
```

---

## Automated Tests

### Run Unit Tests

```bash
npm test
```

**What it tests**:
- Browser compatibility checks
- Microphone permission handling
- Wake word detection logic
- Audio level calculation
- Error handling
- State management

### Run Tests in Watch Mode

```bash
npm test -- --watch
```

**Benefits**:
- Auto-runs tests when files change
- Great for development
- Fast feedback loop

### Run Tests with UI

```bash
npm run test:ui
```

**Features**:
- Visual test runner
- See test results in browser
- Interactive debugging
- Coverage visualization

### Run Tests with Coverage

```bash
npm run test:coverage
```

**Output**:
- Coverage report in terminal
- HTML report in `coverage/` directory
- See what code is tested vs untested

---

## Test Scenarios

### Scenario 1: First Time Use
**Steps**:
1. Fresh browser (no permissions granted)
2. Click microphone button
3. Browser shows permission dialog
4. Click "Allow"

**Expected**:
- ✅ Permission granted within 15 seconds
- ✅ Wake word detection starts
- ✅ "Listening for 'Hey Journey'..." appears

**Common Issues**:
- ⚠️ If timeout: User took >15 seconds
- ⚠️ If denied: User clicked "Block"

### Scenario 2: Wake Word Detection
**Steps**:
1. Permission already granted
2. Click microphone button
3. Say "Hey Journey" clearly
4. Speak command
5. Wait for auto-stop

**Expected**:
- ✅ Detects "Hey Journey" within 2-3 seconds
- ✅ Switches to recording mode
- ✅ Auto-stops after 3.5s silence
- ✅ Transcript appears in chat

**Common Issues**:
- ⚠️ Background noise interferes
- ⚠️ Unclear pronunciation
- ⚠️ Microphone volume too low

### Scenario 3: Multiple Commands
**Steps**:
1. Say "Hey Journey" → command
2. Wait for completion
3. Say "Hey Journey" → another command
4. Repeat 3-4 times

**Expected**:
- ✅ No InvalidStateError
- ✅ No audio-capture errors
- ✅ Smooth transitions
- ✅ All commands processed

**Fixed Issues**:
- ✅ Race conditions eliminated
- ✅ Proper state tracking
- ✅ Safe restart logic

### Scenario 4: Error Recovery
**Steps**:
1. Close another app using microphone
2. Click button while mic is busy
3. Get audio-capture error
4. Wait 1 second
5. Close blocking app

**Expected**:
- ✅ Error logged to console
- ✅ Auto-retry after 1 second
- ✅ Recovers when mic available
- ✅ User can try again

### Scenario 5: Direct Recording Mode
**Steps**:
1. Set `enableWakeWord: false` in code
2. Click microphone button
3. Speak immediately (no wake word)
4. Wait for auto-stop

**Expected**:
- ✅ Recording starts immediately
- ✅ No wake word detection
- ✅ Same silence detection
- ✅ Faster interaction

---

## Troubleshooting Tests

### Tests Fail to Run

**Issue**: `npm test` gives errors

**Solutions**:
```bash
# Reinstall dependencies
npm install

# Clear cache
rm -rf node_modules
npm install

# Check Node version (should be 18+)
node --version
```

### Tests Timeout

**Issue**: Tests hang or timeout

**Solutions**:
- Check if another process is using port
- Increase timeout in test file
- Run tests individually:
  ```bash
  npm test -- client/src/lib/__tests__/microphoneService.test.ts
  ```

### Mock Errors

**Issue**: "Cannot find module" errors in tests

**Solutions**:
- Check `vitest.config.ts` path aliases
- Verify `tsconfig.json` paths match
- Ensure test setup file exists: `client/src/test/setup.ts`

---

## Performance Testing

### Memory Leak Test

**Steps**:
1. Open Chrome DevTools → Memory tab
2. Take heap snapshot
3. Use voice feature 10 times
4. Force garbage collection
5. Take another snapshot
6. Compare

**Expected**:
- Memory should return to baseline
- No retained objects from old recordings
- Proper cleanup verified

### CPU Usage Test

**Steps**:
1. Open Chrome DevTools → Performance tab
2. Start recording
3. Enable wake word detection
4. Let it run for 30 seconds
5. Stop recording

**Expected**:
- CPU usage < 5% when listening
- Brief spikes during speech detection
- No sustained high CPU

### Battery Test (Mobile)

**Steps**:
1. Use app on mobile device
2. Enable wake word mode
3. Use for 30 minutes
4. Check battery drain

**Expected**:
- ~5-10% battery per hour (wake word mode)
- ~1-2% battery per hour (direct mode)

---

## Browser Compatibility Tests

### Chrome (Primary)
- ✅ Full support
- ✅ Wake word works
- ✅ Silence detection works
- ✅ All features functional

### Edge (Chromium)
- ✅ Full support
- ✅ Same as Chrome
- ✅ All features functional

### Safari
- ⚠️ Partial support
- ⚠️ Requires webkit prefix
- ⚠️ May have audio issues
- ⚠️ Test thoroughly

### Firefox
- ❌ Not supported
- ❌ No Web Speech API
- ❌ Should show error message

---

## Regression Tests

After making changes, verify:

### Core Functionality
- [ ] Wake word detection works
- [ ] Direct recording works
- [ ] Silence detection works
- [ ] Permissions requested properly
- [ ] Error messages clear

### UI Feedback
- [ ] "Listening..." indicator shows
- [ ] "Recording..." indicator shows
- [ ] Microphone button changes color
- [ ] Console logs helpful

### Error Handling
- [ ] No InvalidStateError
- [ ] No audio-capture conflicts
- [ ] Graceful permission denials
- [ ] Timeout handled properly

### Performance
- [ ] No memory leaks
- [ ] CPU usage acceptable
- [ ] Battery impact reasonable
- [ ] Quick response time

---

## Test Reports

### Generate HTML Report

```bash
npm run test:coverage
open coverage/index.html
```

### Generate JSON Report

```bash
npm test -- --reporter=json > test-results.json
```

### CI/CD Integration

Add to `.github/workflows/test.yml`:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

---

## Quick Reference

### Common Commands

```bash
# Development server
npm run dev

# Run all tests
npm test

# Watch tests
npm test -- --watch

# Test UI
npm run test:ui

# Coverage
npm run test:coverage

# Type check
npm run check

# Build
npm run build
```

### Log Prefixes

- `[useMicrophone]` - Hook state/lifecycle
- `[Wake Word Detection]` - Wake word events
- `[Recording]` - Recording state
- `[Microphone]` - Device access
- `[JourneyAssistant]` - App-level events

### Key States

- `isListening` - Listening for wake word
- `isRecording` - Actively recording speech
- `error` - Error message if any
- `transcription` - Last transcript

---

## Support

Having issues? Check:

1. **Console logs** - What's the last log message?
2. **Browser** - Using Chrome or Edge?
3. **Permissions** - Microphone allowed?
4. **Other apps** - Close apps using mic
5. **Documentation** - See VOICE_IMPROVEMENTS.md

Still stuck? Look for patterns in console errors and refer to VOICE_DEBUG_REPORT.md for detailed debugging steps.
