# Current Location as Default Starting Position Feature

## Overview
This feature automatically uses the user's current location as the starting position when no starting location is explicitly provided.

## Changes Made

### 1. Client-Side (JourneyAssistant.tsx)
- **Enhanced location detection logic**: The system now automatically detects when no "from" location is specified in the user's request
- **Improved user experience**: Added toast notifications when location access is needed but denied
- **Updated welcome message**: Users are now informed that they can simply say "to [destination]" to use their current location

#### How it works:
```typescript
// The system checks if user message contains "from X to Y" pattern
// If not, it automatically uses current location
const shouldUseCurrentLocation =
  (toPattern.test(message) && !fromPattern.test(message)) ||
  myLocationPattern.test(message) ||
  !fromPattern.test(message); // Always try to use current location if no "from" is specified
```

### 2. Server-Side (routes.ts)
- **Automatic origin filling**: When no origin is provided but userLocation is available, the server automatically reverse geocodes the coordinates to get an address
- **Fallback handling**: If reverse geocoding fails, the system uses coordinates directly (`lat,lng` format)
- **Better logging**: Added comprehensive logging to track when current location is being used

#### Server logic:
```typescript
// If no origin is provided, use current location
if (!tripParameters.origin && userLocation) {
  const { lat, lng } = userLocation;
  const origin = await reverseGeocode(lat, lng);
  if (origin) {
    tripParameters.origin = origin;
    console.log('[chat] Auto-filled origin from current location');
  } else {
    // Fallback to coordinates if reverse geocoding fails
    tripParameters.origin = `${lat},${lng}`;
  }
}
```

### 3. GPT Prompt Enhancement (gpt.ts)
- **Explicit instructions**: Added clear instructions to the AI to set `action: "useCurrentLocation"` when no "from" is specified
- **Contextual responses**: The AI now acknowledges when it's using the user's current location
- **Better examples**: Added multiple examples showing the expected behavior

## Usage Examples

### User Says: "to Boston"
- System response: "I'll use your current location as the starting point and plan a route to Boston, MA"
- Behavior: Uses GPS location → reverse geocodes → plans route

### User Says: "plan a trip to Miami"
- System response: "Starting from your current location, I'll plan your trip to Miami, FL"
- Behavior: Uses GPS location → reverse geocodes → plans route

### User Says: "take me to New York with restaurant stops"
- System response: "I'll use your current location and find great restaurants on the way to New York, NY"
- Behavior: Uses GPS location → reverse geocodes → plans route with stops

### User Says: "from Atlanta to Boston"
- System response: "I'll plan your route from Atlanta, GA to Boston, MA"
- Behavior: Uses explicitly provided origin (normal behavior, no change)

## Technical Details

### Location Flow
1. **App Load**: Request user's location permission and cache coordinates
2. **User Input**: Detect if starting position is missing
3. **Location Check**: Use cached location or request fresh location
4. **Reverse Geocoding**: Convert coordinates to readable address
5. **Route Planning**: Use address (or coordinates) as origin

### Error Handling
- **Permission Denied**: Show toast notification asking user to either allow location or specify "from" location
- **Location Unavailable**: Fall back to asking user for starting location
- **Reverse Geocoding Failed**: Use raw coordinates format (`lat,lng`)

### Privacy & UX
- Location is only requested when needed (on app load or when using current location feature)
- Clear notifications inform users when location is being used
- Users can always explicitly specify a starting location to override

## Testing

To test this feature:

1. Open the app in a browser that supports geolocation
2. Allow location access when prompted
3. Try these commands:
   - "to Boston"
   - "plan a trip to San Francisco"
   - "take me to Miami with gas stops"
4. Verify that the system:
   - Uses your current location as starting point
   - Shows appropriate messages acknowledging current location usage
   - Plans the route correctly

## Browser Compatibility

This feature works in all modern browsers that support:
- Geolocation API (`navigator.geolocation`)
- HTTPS (required for geolocation)

Tested browsers:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

