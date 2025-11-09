
⸻


# Journey Compass

An AI-powered conversational journey planner that builds **road-matched routes** and recommends **smart stops** along the way.  
Talk or type your request (“plan a route to Boston with an Italian restaurant, scenic stop, and gas station along the way”), and Journey Compass turns it into a routed plan with time-aware waypoints.

---

## Highlights

- **Natural-language trip planning** – “to Boston with bubble tea and a gas stop”
- **Voice in / voice out** – hands-free planning with auto-silence detection and optional wake phrase (“Hey Journey”)
- **Grounded stop recommendations** – candidates verified with Google Maps data (places, ratings, detour estimates)
- **Road-matched routing** – rendered with **Google Directions + DirectionsRenderer**
- **Time-aware itineraries** – arrival/leave times with suggested stop durations
- **Multi-waypoint routing** – add, remove, and reorder stops
- **Current location** – automatically detects starting point
- **Custom stop types** – sushi, bubble tea, EV charging, scenic viewpoints, etc.

---

## Tech Stack

**Frontend**
- React 18 + TypeScript  
- Vite  
- Tailwind CSS  
- Radix UI  
- Framer Motion  
- Google Maps JavaScript API (Maps, Directions, Places, Geocoding)  
- Web Speech API (voice recognition)  
- OpenAI Whisper API (speech-to-text transcription)  
- ElevenLabs Text-to-Speech API (AI voice output)

**Backend**
- Node.js + Express  
- TypeScript  
- OpenAI or Azure OpenAI (for conversational trip planning)  
- Google Maps APIs  
- Drizzle ORM + PostgreSQL (optional)  
- WebSockets (real-time communication)

---

## Prerequisites

- Node.js **18+**
- npm or yarn
- **Google Maps API key** with Maps JavaScript, Directions, Places, and Geocoding APIs enabled
- **OpenAI API key** or **Azure OpenAI credentials**
- **ElevenLabs API key** for spoken AI responses

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/tiffany-gu/JourneyCompass.git
cd JourneyCompass

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local (see next section)

# 4. Run the development server
npm run dev
# App runs at: http://localhost:3000


⸻

Environment Variables (.env.local)

# Google Maps
GOOGLE_MAPS_API_KEY=your-server-key
VITE_GOOGLE_MAPS_API_KEY=your-browser-key

# OpenAI (Option A)
OPENAI_API_KEY=sk-...

# Azure OpenAI (Option B)
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_OPENAI_DEPLOYMENT=your-deployment-name

# ElevenLabs (optional, for voice output)
VITE_ELEVENLABS_API_KEY=...
VITE_VOICE_ID=EXAVITQu4vr4xnSDxMaL

# Database (optional)
DATABASE_URL=postgresql://user:pass@host:5432/db

# Server
PORT=3000
NODE_ENV=development
```

💡 **Tip:** Restrict browser/server API keys and enable billing in **Google Cloud Console**.

---

## 🧭 Usage

Once the server is running, open your browser at **[http://localhost:3000](http://localhost:3000)**.

### **Examples**
- “to Miami with coffee and a gas stop”
- “arrive at Emory by 5:00 PM, add a grocery stop”
- “from Georgia Tech Klaus to Emory Oxford, suggest Chinese food and boba along the way”

### **Voice Input**
- Click the **mic icon**, speak naturally, and it auto-stops on silence.  
- Optional wake phrase: **“Hey Journey”** (see `useMicrophone` config).

### **Maps**
- Uses **Google DirectionsRenderer** for true road-following routes.  
- Stop markers have icons matching stop type (gas, food, coffee, etc.).

---

## ⚙️ Scripts

```bash
npm run dev          # Start development server
npm run dev:safe     # Start without killing port 3000
npm run build        # Build for production
npm start            # Start production server
npm run check        # Type-check the project
npm test             # Run tests
npm run db:push      # Push Drizzle schema to database
```
---

## Project Structure
```bash
JourneyCompass/
├── client/
│   └── src/
│       ├── components/
│       │   ├── ui/
│       │   ├── AppHeader.tsx
│       │   ├── ChatMessage.tsx
│       │   ├── MapView.tsx          # Google Maps + DirectionsRenderer
│       │   ├── MessageInput.tsx
│       │   └── StopCard.tsx
│       ├── pages/JourneyAssistant.tsx
│       ├── hooks/useMicrophone.ts    # Voice + silence detection
│       └── lib/microphoneService.ts
├── server/
│   ├── index.ts                      # Express entry
│   ├── routes.ts                     # API routes
│   ├── gpt.ts                        # AI integration
│   ├── maps.ts                       # Directions + Places
│   ├── concierge.ts                  # Stop recommendations
│   ├── timeUtils.ts                  # Timing logic
│   └── storage.ts                    # Data persistence
├── shared/schema.ts                  # Drizzle schema
├── .env.example
└── README.md
```

---

## Key Design Details
- **Grounded Results:** AI output verified with Google Places data (ratings, attributes, hours).
- **Road-Matched Routes:** Always generated using Google Directions API.
- **Time Awareness:** Adjusts stop durations to meet “arrive by” or “leave at” constraints.
- **Clear Visualization:** Type-specific icons and numbered waypoints.

---

## API Endpoints
- `POST /api/chat` → Parse natural-language requests
- `POST /api/route` → Compute Google route
- `POST /api/find-stops` → Recommend verified stops
- `POST /api/update-route` → Re-route with added waypoints

---

## Configuration Tips

**Wake Word and Silence Detection** (`useMicrophone.ts`)
```bash
useMicrophone({
  enableWakeWord: true,
  wakeWord: 'hey journey',
  silenceMs: 3500,
  onTranscript: (text) => handleSendMessage(text),
});
```
**Add Custom Stop Categories** (server/concierge.ts)
```bash
const stopCategories = {
  bubbleTea: { keywords: ['boba', 'bubble tea'], placeTypes: ['cafe'], minRating: 4.2 },
  sushi: { keywords: ['sushi'], placeTypes: ['restaurant'], minRating: 4.2 },
};
```

---

## Troubleshooting

**Maps Not Loading**
- Check both `GOOGLE_MAPS_API_KEY` and `VITE_GOOGLE_MAPS_API_KEY`.
- Ensure required APIs are enabled and billing is active.

**Voice Input Not Working**
- **Use Chrome, Edge, or Safari** (Web Speech API supported browsers).
- Grant microphone permission.

**AI Not Responding**
- Verify OpenAI or Azure OpenAI keys and quotas.


## Security
- Never commit `.env.local`.
- Restrict API keys by referrer/IP.
- Rotate keys periodically.
- Set usage alerts for Google Maps and OpenAI.


## Credits
- Built with React, TypeScript, and CSS.
- **Contributors:** Arjun, Lalit, Tiffany, Raj.


**License:**

MIT License
