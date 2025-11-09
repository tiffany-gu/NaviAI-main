# NaviAI

An AI-powered conversational journey planning assistant that helps you plan road trips with intelligent stop recommendations. Combine natural language processing, voice input, and interactive mapping to create a seamless travel planning experience.

## Features

### Core Capabilities

- **Conversational Trip Planning** - Plan trips using natural language like "to Boston with coffee shops along the way"
- **Voice Input** - Speak your requests with automatic silence detection and optional wake word ("Hey Journey")
- **Voice Output** - AI responses spoken aloud using ElevenLabs text-to-speech (optional)
- **Intelligent Stop Recommendations** - Get AI-curated stops for gas, food, coffee, scenic viewpoints, and more
- **Interactive Maps** - Real-time Google Maps visualization with turn-by-turn directions
- **Time-Aware Planning** - Plan routes with arrival deadlines and optimal stop durations
- **Current Location Detection** - Automatically use your current location as the starting point
- **Custom Stop Types** - Request specific cuisines or place types (sushi, bubble tea, etc.)

### Advanced Features

- **Grounded AI Responses** - All stop recommendations verified with real Google Maps data
- **Quality Verification** - Only suggests highly-rated places with verified attributes
- **Smart Detour Calculation** - Balances convenience with staying on route
- **Multi-waypoint Routing** - Handles complex routes with multiple stops
- **Real-time Audio Monitoring** - Automatic silence detection for hands-free operation
- **Conversational Context** - Maintains context throughout your planning session

## Tech Stack

### Frontend
- **React 18.3** with TypeScript
- **Vite 5.4** - Lightning-fast build tool
- **Tailwind CSS 3.4** - Utility-first styling with Material Design 3 theme
- **Radix UI** - Accessible component primitives
- **TanStack Query 5.6** - Data synchronization
- **Framer Motion** - Smooth animations
- **Google Maps JavaScript API** - Interactive mapping
- **Web Speech API** - Zero-cost voice recognition

### Backend
- **Node.js** with Express 4.21
- **TypeScript 5.6** - Type-safe development
- **OpenAI SDK 6.8** - Natural language processing
- **Azure OpenAI** - Enterprise AI support
- **Google Maps APIs** - Directions, Places, Geocoding
- **Drizzle ORM 0.39** - Type-safe database access
- **PostgreSQL** - Data persistence (optional)
- **WebSockets** - Real-time communication

## Prerequisites

- **Node.js** 18 or higher
- **npm** or **yarn**
- **Google Maps API Key** (with Maps JavaScript API, Directions API, Places API, Geocoding API enabled)
- **OpenAI API Key** or **Azure OpenAI** credentials
- **Modern browser** with Web Speech API support (Chrome, Edge, Safari)
- **Cross-platform support** - Works on Windows, macOS, and Linux

## Quick Start

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd NaviAI-main
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Google Maps API Keys (required)
GOOGLE_MAPS_API_KEY=your-google-maps-api-key-here
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key-here

# AI Integration - Option 1: Standard OpenAI
OPENAI_API_KEY=your-openai-api-key-here

# AI Integration - Option 2: Azure OpenAI
AZURE_OPENAI_API_KEY=your-azure-api-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_OPENAI_DEPLOYMENT=your-deployment-name

# ElevenLabs Text-to-Speech (optional - for voice output)
VITE_ELEVENLABS_API_KEY=your-elevenlabs-api-key-here
VITE_VOICE_ID=EXAVITQu4vr4xnSDxMaL  # Optional: voice ID (defaults to Sarah)

# Database (optional - defaults to in-memory storage)
DATABASE_URL=postgresql://user:password@host:port/database

# Server Configuration (optional)
PORT=3000
NODE_ENV=development
```

**Note:** See `.env.example` for a template and `AZURE_OPENAI_SETUP.md` for detailed Azure setup instructions.

### 4. Set Up Google Maps API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Maps JavaScript API
   - Directions API
   - Places API
   - Geocoding API
4. Create credentials (API Key)
5. Copy the API key to both `GOOGLE_MAPS_API_KEY` and `VITE_GOOGLE_MAPS_API_KEY`

### 5. Set Up OpenAI

**Option A: Standard OpenAI**
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an API key
3. Add it to `.env.local` as `OPENAI_API_KEY`

**Option B: Azure OpenAI**
1. Set up an Azure OpenAI resource
2. Create a deployment (e.g., GPT-4 or GPT-3.5)
3. Configure environment variables as shown above
4. See `AZURE_OPENAI_SETUP.md` for detailed instructions

### 6. Set Up ElevenLabs Text-to-Speech (Optional)

**Enable voice output for AI responses:**

1. Go to [ElevenLabs](https://elevenlabs.io/)
2. Sign up for an account (free tier available)
3. Get your API key from the [profile page](https://elevenlabs.io/app/settings/api-keys)
4. (Optional) Choose a voice from the [Voice Library](https://elevenlabs.io/voice-library)
5. Add to `.env.local`:
   ```bash
   VITE_ELEVENLABS_API_KEY=your-elevenlabs-api-key-here
   VITE_VOICE_ID=EXAVITQu4vr4xnSDxMaL  # Optional: defaults to Sarah
   ```

**Note:** If ElevenLabs is not configured, the app will work normally without voice output.

### 7. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Usage Guide

### Basic Trip Planning

1. **Text Input:**
   ```
   "from New York to Boston"
   "to Miami with coffee shops"
   "to Seattle, add gas station and sushi place"
   ```

2. **Voice Input:**
   - Click the microphone button
   - Speak your request
   - System automatically stops after 3.5 seconds of silence

3. **Wake Word (Optional):**
   - Enable in `client/src/pages/JourneyAssistant.tsx`
   - Say "Hey Journey" to activate
   - Speak your request
   - Hands-free operation

### Advanced Features

**Time Constraints:**
```
"to Boston, arrive in 2 hours"
"to Miami by 5:00 PM"
"leave at 2:00 PM to Orlando"
```

**Custom Stop Types:**
```
"add a sushi restaurant along the way"
"find a bubble tea place nearby"
"add Chinese food and coffee shop"
```

**Proximity Preferences:**
```
"gas station close by" (within 5 minutes)
"coffee shop along the way" (on main route)
"nearby restaurant" (minimal detour)
```

**Current Location:**
```
"to Boston" (automatically uses current location)
```

### Map Controls

- **Pan/Zoom** - Standard Google Maps controls
- **Navigation View** - Toggle for turn-by-turn mode
- **Route Visualization** - Blue line showing your path
- **Stop Markers** - Numbered pins for each waypoint
- **Auto-fit Bounds** - Automatically frames entire route

## Project Structure

```
NaviAI-main/
├── client/                      # Frontend React application
│   ├── src/
│   │   ├── components/          # React components
│   │   │   ├── ui/              # shadcn/ui component library
│   │   │   ├── AppHeader.tsx    # Header with voice indicators
│   │   │   ├── ChatMessage.tsx  # Chat message display
│   │   │   ├── MapView.tsx      # Google Maps integration
│   │   │   ├── MessageInput.tsx # Text/voice input
│   │   │   └── StopCard.tsx     # Stop recommendation cards
│   │   ├── pages/
│   │   │   └── JourneyAssistant.tsx  # Main application
│   │   ├── hooks/
│   │   │   └── useMicrophone.ts      # Voice input hook
│   │   ├── lib/
│   │   │   └── microphoneService.ts  # Voice processing
│   │   └── types/
│   │       └── google-maps.d.ts      # TypeScript definitions
│   └── public/                  # Static assets
│
├── server/                      # Backend Express.js API
│   ├── index.ts                 # Server entry point
│   ├── routes.ts                # API endpoints
│   ├── gpt.ts                   # OpenAI/Azure AI integration
│   ├── maps.ts                  # Google Maps API integration
│   ├── concierge.ts             # Route concierge service
│   ├── timeUtils.ts             # Time calculations
│   └── storage.ts               # Data storage
│
├── shared/                      # Shared types and schemas
│   └── schema.ts                # Drizzle ORM schema
│
├── .env.local                   # Environment variables (create this)
├── .env.example                 # Environment template
├── package.json                 # Dependencies
├── vite.config.ts               # Vite configuration
├── tailwind.config.ts           # Tailwind styling
└── tsconfig.json                # TypeScript config
```

## API Endpoints

### POST /api/chat
Parse user message and generate conversational response.

**Request:**
```json
{
  "message": "to Boston with coffee shops"
}
```

**Response:**
```json
{
  "message": "I'll help you plan a trip to Boston with coffee stops...",
  "tripRequest": { /* trip parameters */ }
}
```

### POST /api/route
Calculate route between origin and destination.

**Request:**
```json
{
  "origin": "New York, NY",
  "destination": "Boston, MA"
}
```

**Response:**
```json
{
  "route": { /* Google Maps route data */ },
  "distance": "215 miles",
  "duration": "3 hours 45 minutes"
}
```

### POST /api/find-stops
Find recommended stops along the route.

**Request:**
```json
{
  "route": { /* route data */ },
  "stopTypes": ["coffee", "gas"],
  "timeConstraints": { "arrivalTimeHours": 2 }
}
```

**Response:**
```json
{
  "stops": [
    {
      "name": "Starbucks Reserve",
      "rating": 4.6,
      "justification": "Highly-rated coffee shop...",
      "detourMinutes": 3
    }
  ]
}
```

### POST /api/update-route
Recalculate route with waypoints.

**Request:**
```json
{
  "origin": "New York, NY",
  "destination": "Boston, MA",
  "waypoints": [{ "lat": 41.7658, "lng": -72.6734 }]
}
```

## Available Scripts

All scripts are cross-platform compatible (Windows, macOS, Linux):

```bash
# Development
npm run dev          # Start development server with hot reload (kills port 3000 first)
npm run dev:safe     # Start without killing port 3000

# Production
npm run build        # Build for production
npm start            # Start production server

# Testing
npm test             # Run tests
npm run test:ui      # Run tests with UI
npm run test:coverage # Run tests with coverage

# Database
npm run db:push      # Push schema changes to database

# Type Checking
npm run check        # Run TypeScript type checking
```

**Note:** The project uses `cross-env` and `kill-port` packages to ensure all npm scripts work seamlessly across different operating systems.

## Voice Features Configuration

### Enable Wake Word Detection

Edit `client/src/pages/JourneyAssistant.tsx`:

```typescript
const { ... } = useMicrophone({
  enableWakeWord: true,  // Change to true
  onTranscript: (text) => {
    handleSendMessage(text);
  },
});
```

### Adjust Voice Settings

Edit `client/src/lib/microphoneService.ts`:

```typescript
const SILENCE_DURATION = 3500;  // Auto-stop delay (ms)
const SILENCE_THRESHOLD = -20;   // Silence detection (dB)
const WAKE_WORD = 'hey journey';  // Activation phrase
```

### Visual Indicators

- **Blue Ear Icon** - Listening for wake word
- **Red Microphone** - Active recording
- **Pulsing Animation** - Indicates active state

## Browser Compatibility

### Voice Input Support
- Chrome 25+
- Edge 79+
- Safari 14.1+
- Firefox: Not supported (no Web Speech API)

### Map Features Support
- All modern browsers with JavaScript enabled

## Troubleshooting

### Maps Not Loading
1. Check `VITE_GOOGLE_MAPS_API_KEY` is set correctly
2. Verify APIs are enabled in Google Cloud Console
3. Check browser console for API errors
4. Ensure billing is enabled on Google Cloud

### Voice Input Not Working
1. Grant microphone permissions in browser
2. Use Chrome, Edge, or Safari (not Firefox)
3. Check browser console for errors
4. Test microphone in browser settings

### AI Responses Not Generating
1. Verify OpenAI or Azure OpenAI credentials
2. Check API key has sufficient credits
3. Review server logs for error messages
4. Ensure correct deployment name for Azure

### Route Not Displaying
1. Check both API keys are set (client and server)
2. Verify origin and destination are valid addresses
3. Review network tab for API failures
4. Check Google Maps API quotas

### Database Connection Issues
1. Verify `DATABASE_URL` format is correct
2. App will fall back to in-memory storage if DB unavailable
3. Check database credentials and network access

### Voice Output Not Working
1. Verify `VITE_ELEVENLABS_API_KEY` is set in `.env.local`
2. Check browser console for `[ElevenLabs]` error messages
3. Ensure you haven't exceeded your ElevenLabs quota
4. Check browser audio is not muted
5. See `ELEVENLABS_VOICE_SETUP.md` for detailed troubleshooting

## Documentation

- `VOICE_FEATURES.md` - Detailed voice feature documentation
- `VOICE_INTEGRATION_SUMMARY.md` - Technical voice integration details
- `ELEVENLABS_VOICE_SETUP.md` - ElevenLabs text-to-speech setup guide
- `AZURE_OPENAI_SETUP.md` - Azure OpenAI setup guide
- `FEATURE_CURRENT_LOCATION.md` - Current location feature guide
- `IMPLEMENTATION_SUMMARY.md` - Development summary
- `TESTING_GUIDE.md` - Testing instructions
- `TEST_RESULTS.md` - Test results and coverage

## Development Notes

### Adding New Stop Types

Edit `server/concierge.ts` to add new stop categories:

```typescript
const stopCategories = {
  yourCategory: {
    keywords: ['keyword1', 'keyword2'],
    placeTypes: ['place_type'],
    minRating: 4.0
  }
};
```

### Customizing UI Theme

Edit `tailwind.config.ts` for theme customization:

```typescript
theme: {
  extend: {
    colors: {
      primary: { /* your colors */ }
    }
  }
}
```

### Adding New UI Components

The project uses [shadcn/ui](https://ui.shadcn.com/). Add components with:

```bash
npx shadcn-ui@latest add [component-name]
```

## Performance Considerations

- **Voice Input:** < 100ms latency (browser-native)
- **Route Calculation:** ~500ms for typical routes
- **Stop Recommendations:** 1-3 seconds depending on quantity
- **Map Rendering:** 60fps smooth animations
- **API Rate Limits:** Monitor Google Maps and OpenAI quotas

## Security Notes

- Never commit `.env.local` to version control
- Rotate API keys regularly
- Restrict Google Maps API key with HTTP referrer restrictions
- Use environment variables for all secrets
- Enable billing alerts on Google Cloud and OpenAI

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues and questions:
- Check existing documentation files
- Review troubleshooting section
- Check browser console for errors
- Verify all environment variables are set

## Credits

- Voice features adapted from [ai_atl](https://github.com/lalitj5/ai_atl)
- Built with React, TypeScript, and modern web technologies
- Powered by OpenAI/Azure OpenAI and Google Maps APIs

## Roadmap

### Planned Features
- Multi-language support
- Voice feedback (audio confirmation)
- Alternative routes display
- Traffic information integration
- Offline map caching
- Route sharing functionality
- Trip history and favorites
- Custom stop categories
- Mobile app version

---

Built with by Arjun, Lalit, Tiffany, and Raj
