import fetch from 'node-fetch';
import OpenAI, { AzureOpenAI } from 'openai';

// OpenAI client getter - supports both standard OpenAI and Azure OpenAI
const getOpenAIClient = () => {
  // Check if using Azure OpenAI
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  
  if (azureEndpoint && azureApiKey) {
    // Use Azure OpenAI
    console.log('[OpenAI] Using Azure OpenAI endpoint');
    return new AzureOpenAI({
      apiKey: azureApiKey,
      endpoint: azureEndpoint,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5-chat', // deployment name
    });
  }
  
  // Fall back to standard OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  console.log('[OpenAI] Using standard OpenAI API');
  return new OpenAI({ apiKey });
};
const numberFormatter = new Intl.NumberFormat('en-US');
const formatNumber = (value: number) => numberFormatter.format(value);

interface CustomStopRequest {
  id: string;
  label?: string;
  keywords: string[];
  placeTypes: string[];
  minRating?: number;
}

interface TripParameters {
  origin?: string;
  destination?: string;
  fuelLevel?: number;
  vehicleRange?: number;
  preferences?: {
    scenic?: boolean;
    fast?: boolean;
    avoidTolls?: boolean;
    restaurantPreferences?: {
      cuisine?: string;
      rating?: number;
      priceLevel?: string;
      kidFriendly?: boolean;
      openNow?: boolean;
      vegetarian?: boolean;
      vegan?: boolean;
      keywords?: string[];
    };
    requestedStops?: {
      gas?: boolean;
      restaurant?: boolean;
      scenic?: boolean;
      coffee?: boolean;
      tea?: boolean;
      dessert?: boolean;
      bubbleTea?: boolean;
    };
    customStops?: CustomStopRequest[];
  };
  action?: string;
}

// Types for Gemini-generated itinerary with stops
export enum StopType {
  ORIGIN = 'ORIGIN',
  DESTINATION = 'DESTINATION',
  GAS = 'GAS',
  FOOD = 'FOOD',
  SCENIC = 'SCENIC',
  OTHER = 'OTHER',
}

export interface Stop {
  type: StopType;
  name: string;
  address: string;
  reason: string;
  durationMinutes: number;
  latitude: number;
  longitude: number;
}

export interface RouteSummary {
  name: string;
  duration: string;
  distance: string;
  cost: string;
  summary: string;
}

export interface Itinerary {
  tripTitle: string;
  routeComparison: RouteSummary[];
  enrichedRoute: {
    summary: RouteSummary;
    stops: Stop[];
    overviewPath: { lat: number; lng: number }[];
  };
}

function applyPreferenceHeuristics(
  tripParameters: TripParameters,
  originalMessage: string
): TripParameters {
  if (!originalMessage) {
    return tripParameters;
  }

  const message = originalMessage.toLowerCase();
  const preferences = tripParameters.preferences
    ? { ...tripParameters.preferences }
    : {};
  const requestedStops = preferences.requestedStops
    ? { ...preferences.requestedStops }
    : {};
  const restaurantPreferences = preferences.restaurantPreferences
    ? { ...preferences.restaurantPreferences }
    : {};
  const restaurantKeywords = new Set(
    restaurantPreferences.keywords?.map(keyword => keyword.toLowerCase()) ?? []
  );
  const customStops: CustomStopRequest[] = preferences.customStops
    ? preferences.customStops.map(stop => ({
        ...stop,
        keywords: [...stop.keywords],
        placeTypes: [...stop.placeTypes],
      }))
    : [];

  const addRestaurantKeyword = (keyword: string) => {
    const normalized = keyword.trim().toLowerCase();
    if (normalized && !restaurantKeywords.has(normalized)) {
      restaurantKeywords.add(normalized);
    }
  };

  const ensureCustomStop = (id: string, stop: CustomStopRequest) => {
    const existingIndex = customStops.findIndex(existing => existing.id === id);
    if (existingIndex === -1) {
      customStops.push({
        ...stop,
        label: stop.label,
        keywords: Array.from(new Set(stop.keywords.map(k => k.toLowerCase()))),
        placeTypes: Array.from(new Set(stop.placeTypes)),
        minRating: stop.minRating,
      });
    } else {
      const existing = customStops[existingIndex];
      const mergedKeywords = Array.from(
        new Set([
          ...existing.keywords.map(k => k.toLowerCase()),
          ...stop.keywords.map(k => k.toLowerCase()),
        ])
      );
      const mergedPlaceTypes = Array.from(
        new Set([...existing.placeTypes, ...stop.placeTypes])
      );
      const mergedMinRating =
        existing.minRating || stop.minRating
          ? Math.max(existing.minRating ?? 0, stop.minRating ?? 0)
          : undefined;

      customStops[existingIndex] = {
        ...existing,
        ...stop,
        label: existing.label || stop.label,
        keywords: mergedKeywords,
        placeTypes: mergedPlaceTypes,
        minRating: mergedMinRating,
      };
    }
  };

  const cuisinePatterns: Array<{ regex: RegExp; cuisine: string; keyword?: string }> = [
    { regex: /\bchinese\b/, cuisine: 'chinese', keyword: 'chinese restaurant' },
    { regex: /\bitalian\b/, cuisine: 'italian', keyword: 'italian restaurant' },
    { regex: /\bmexican\b/, cuisine: 'mexican', keyword: 'mexican restaurant' },
    { regex: /\bthai\b/, cuisine: 'thai', keyword: 'thai restaurant' },
    { regex: /\bjapanese\b/, cuisine: 'japanese', keyword: 'japanese restaurant' },
    { regex: /\bsushi\b/, cuisine: 'japanese', keyword: 'sushi' },
    { regex: /\bindian\b/, cuisine: 'indian', keyword: 'indian restaurant' },
    { regex: /\bkorean\b/, cuisine: 'korean', keyword: 'korean restaurant' },
    { regex: /\bmediterranean\b/, cuisine: 'mediterranean', keyword: 'mediterranean restaurant' },
    { regex: /\bvietnamese\b/, cuisine: 'vietnamese', keyword: 'vietnamese restaurant' },
    { regex: /\bseafood\b/, cuisine: 'seafood', keyword: 'seafood restaurant' },
    { regex: /\bbbq\b/, cuisine: 'bbq', keyword: 'bbq restaurant' },
    { regex: /\bsteak\b/, cuisine: 'steakhouse', keyword: 'steakhouse' },
    { regex: /\bpizza\b/, cuisine: 'pizza', keyword: 'pizza' },
    { regex: /\bburger\b/, cuisine: 'burger', keyword: 'burger' },
    { regex: /\bboba\b/, cuisine: 'bubble tea', keyword: 'bubble tea' },
  ];

  const restaurantIntentRegex =
    /\b(restaurant|food|lunch|dinner|eat|meal|breakfast|brunch|dining)\b/;
  const gasIntentRegex =
    /\b(gas station|gas stop|fuel stop|refuel|fill up|need gas|petrol)\b/;
  const scenicIntentRegex =
    /\b(scenic|viewpoint|view point|sightseeing|photo stop|lookout|vista|attraction)\b/;
  const coffeeIntentRegex =
    /\b(coffee|espresso|latte|cappuccino|coffee shop|café|cafe)\b/;
  const dessertIntentRegex =
    /\b(dessert|sweet treat|ice cream|gelato|pastry|bakery|cupcake|donut|doughnut)\b/;
  const teaIntentRegex =
    /\b(tea house|tea shop|tea stop|matcha)\b/;
  const bubbleTeaRegex = /\b(bubble\s*tea|boba|milk tea)\b/;

  if (restaurantIntentRegex.test(message)) {
    requestedStops.restaurant = true;
  }

  cuisinePatterns.forEach(pattern => {
    if (pattern.regex.test(message)) {
      if (!restaurantPreferences.cuisine && pattern.cuisine !== 'bubble tea') {
        restaurantPreferences.cuisine = pattern.cuisine;
      }
      if (pattern.keyword) {
        addRestaurantKeyword(pattern.keyword);
      }
      requestedStops.restaurant = true;
    }
  });

  if (/(vegetarian|plant-based|plant based|veggie)/.test(message)) {
    restaurantPreferences.vegetarian = true;
  }

  if (/(vegan)/.test(message)) {
    restaurantPreferences.vegan = true;
    restaurantPreferences.vegetarian = true;
  }

  if (/(kid[-\s]?friendly|family[-\s]?friendly|kids menu)/.test(message)) {
    restaurantPreferences.kidFriendly = true;
  }

  if (/(open now|currently open|still open)/.test(message)) {
    restaurantPreferences.openNow = true;
  }

  if (/(cheap|budget|affordable|inexpensive)/.test(message)) {
    restaurantPreferences.priceLevel = '$';
  }

  if (/(fine dining|upscale|fancy|expensive|luxury|high-end|high end)/.test(message)) {
    restaurantPreferences.priceLevel = '$$$';
  }

  if (
    /(top-rated|top rated|highly rated|best|4\.5 star|five star|5-star|5 star)/.test(
      message
    )
  ) {
    restaurantPreferences.rating = Math.max(
      restaurantPreferences.rating ?? 0,
      4.5
    );
  } else if (/(good|great|nice|solid food)/.test(message)) {
    restaurantPreferences.rating = Math.max(
      restaurantPreferences.rating ?? 0,
      4.0
    );
  }

  if (gasIntentRegex.test(message)) {
    requestedStops.gas = true;
  }

  if (scenicIntentRegex.test(message)) {
    requestedStops.scenic = true;
    preferences.scenic = true;
  }

  if (/(avoid tolls|no tolls|without tolls)/.test(message)) {
    preferences.avoidTolls = true;
  }

  if (/(fastest route|quickest route|make it fast)/.test(message)) {
    preferences.fast = true;
  }

  if (coffeeIntentRegex.test(message)) {
    requestedStops.coffee = true;
    ensureCustomStop('coffee', {
      id: 'coffee',
      label: 'Coffee Shop',
      keywords: ['coffee', 'espresso', 'latte'],
      placeTypes: ['cafe', 'restaurant'],
      minRating: 4.0,
    });
  }

  if (dessertIntentRegex.test(message)) {
    requestedStops.dessert = true;
    ensureCustomStop('dessert', {
      id: 'dessert',
      label: 'Dessert Stop',
      keywords: ['dessert', 'ice cream', 'gelato', 'bakery', 'pastry'],
      placeTypes: ['bakery', 'cafe', 'restaurant'],
      minRating: 4.0,
    });
  }

  if (teaIntentRegex.test(message)) {
    requestedStops.tea = true;
    ensureCustomStop('tea', {
      id: 'tea',
      label: 'Tea House',
      keywords: ['tea house', 'tea shop', 'matcha'],
      placeTypes: ['cafe', 'restaurant'],
      minRating: 4.0,
    });
  }

  if (bubbleTeaRegex.test(message)) {
    requestedStops.restaurant = true;
    requestedStops.bubbleTea = true;
    addRestaurantKeyword('bubble tea');
    ensureCustomStop('bubbleTea', {
      id: 'bubbleTea',
      label: 'Bubble Tea Shop',
      keywords: ['bubble tea', 'boba', 'milk tea'],
      placeTypes: ['cafe', 'restaurant', 'meal_takeaway'],
      minRating: Math.max(restaurantPreferences.rating ?? 0, 4.0),
    });
  }

  if (Object.keys(restaurantPreferences).length > 0) {
    requestedStops.restaurant = true;
  }

  const restaurantKeywordList = Array.from(restaurantKeywords);
  if (restaurantKeywordList.length > 0) {
    restaurantPreferences.keywords = restaurantKeywordList;
  } else {
    delete restaurantPreferences.keywords;
  }

  if (Object.keys(requestedStops).length > 0) {
    preferences.requestedStops = requestedStops;
  } else {
    delete preferences.requestedStops;
  }

  if (Object.keys(restaurantPreferences).length > 0) {
    preferences.restaurantPreferences = restaurantPreferences;
  } else {
    delete preferences.restaurantPreferences;
  }

  if (customStops.length > 0) {
    preferences.customStops = customStops;
  } else {
    delete preferences.customStops;
  }

  if (Object.keys(preferences).length > 0) {
    tripParameters.preferences = preferences;
  } else {
    delete tripParameters.preferences;
  }

  return tripParameters;
}

export async function parseUserRequest(userMessage: string, conversationHistory: string[]): Promise<TripParameters> {
  console.log('Parsing user message:', userMessage);

  // Clean up the message - remove common phrases that might interfere with parsing
  const cleanedMessage = userMessage.trim();

  // Try AI extraction with OpenAI first
  const context = conversationHistory.length > 0
    ? `Previous conversation:\n${conversationHistory.join('\n')}\n\n`
    : '';

  const prompt = `${context}User message: "${cleanedMessage}"

You are a location extraction AI with access to Google Maps data. Extract the origin and destination from this travel request and resolve them to actual locations.

TASK:
1. Extract the origin and destination location names from the user's message
2. For each location, provide:
   - "name": The original name as mentioned by the user
   - "address": A geocodable address (full address, city, state) that Google Maps can find
   - If it's a well-known place (building, landmark, university), include the city/state

EXTRACTION METHOD:
- Look for "from X to Y" pattern
- Keep complete location names including "the", "a", etc.
- Use your knowledge to resolve ambiguous names to full addresses

EXAMPLES:

Input: "plan a route from the bill graham civic auditorium to georgia tech"
Output: {
  "origin": "Bill Graham Civic Auditorium, San Francisco, CA",
  "destination": "Georgia Institute of Technology, Atlanta, GA"
}

Input: "from the white house to the empire state building"
Output: {
  "origin": "The White House, Washington, DC",
  "destination": "Empire State Building, New York, NY"
}

Input: "from 123 main street boston to central park new york"
Output: {
  "origin": "123 Main Street, Boston, MA",
  "destination": "Central Park, New York, NY"
}

Input: "from stanford university to mit"
Output: {
  "origin": "Stanford University, Stanford, CA",
  "destination": "Massachusetts Institute of Technology, Cambridge, MA"
}

Input: "to miami"
Output: {
  "destination": "Miami, FL",
  "action": "useCurrentLocation"
}

Input: "plan a trip to boston"
Output: {
  "destination": "Boston, MA",
  "action": "useCurrentLocation"
}

IMPORTANT RULE: When no "from" location is specified, automatically set "action": "useCurrentLocation" so the system uses the user's current location as the starting point.

Additional optional parameters to extract:
- Fuel Level: "1/4 tank" → fuelLevel: 0.25, "half tank" → fuelLevel: 0.5, "full tank" → fuelLevel: 1.0
- Vehicle Range: "150 miles of range" → vehicleRange: 150, "Honda Civic" → vehicleRange: 350 (estimate based on vehicle)
- Preferences:
  - "scenic" → preferences: {"scenic": true}
  - "fastest" → preferences: {"fast": true}
  - "avoid tolls" → preferences: {"avoidTolls": true}
  - Route preferences (scenic route) → preferences: {"scenic": true}

- Stop Requests (CRITICAL - Extract what stops the user explicitly wants):
  - "I want a restaurant" / "restaurant along the way" / "need a place to eat" / "food" / "lunch" / "dinner" / "breakfast" / "hungry" / "eat" → preferences: {"requestedStops": {"restaurant": true}}
  - "gas station" / "need gas" / "fuel stop" / "refuel" / "fill up" / "gas" → preferences: {"requestedStops": {"gas": true}}
  - "scenic view" / "scenic stop" / "scenic viewpoint" / "scenic route" / "viewpoints" / "sightseeing" / "attractions" → preferences: {"requestedStops": {"scenic": true}}
  - If user mentions multiple stop types, include all of them: {"requestedStops": {"gas": true, "restaurant": true}}
  - Even vague mentions like "stops along the way" / "places to stop" / "take a break" / "rest stop" should trigger: {"requestedStops": {"restaurant": true}}

- Custom Stop Types (CRITICAL - Extract specific types of places):
  For specific place types, use customStops array with keywords and place types:
  
  - "sushi" / "sushi place" / "sushi restaurant" / "sushi bar" / "japanese food" → customStops: [{"id": "sushi", "label": "Sushi Restaurant", "keywords": ["sushi", "japanese", "sashimi", "roll", "nigiri"], "placeTypes": ["sushi_restaurant", "japanese_restaurant", "restaurant"], "minRating": 4.0}]
  
  - "coffee" / "coffee shop" / "café" / "coffee place" / "espresso" → customStops: [{"id": "coffee", "label": "Coffee Shop", "keywords": ["coffee", "espresso", "latte", "café"], "placeTypes": ["cafe", "coffee_shop"], "minRating": 4.0}]
  
  - "boba" / "bubble tea" / "milk tea" / "boba place" → customStops: [{"id": "boba", "label": "Bubble Tea", "keywords": ["boba", "bubble tea", "milk tea", "tapioca"], "placeTypes": ["cafe", "tea_house", "bubble_tea_shop"], "minRating": 4.0}]
  
  - "pizza" / "pizza place" / "pizzeria" → customStops: [{"id": "pizza", "label": "Pizza Place", "keywords": ["pizza", "pizzeria", "italian"], "placeTypes": ["pizza_restaurant", "italian_restaurant"], "minRating": 4.0}]
  
  - "burger" / "burger place" / "hamburger" → customStops: [{"id": "burger", "label": "Burger Place", "keywords": ["burger", "hamburger", "cheeseburger"], "placeTypes": ["hamburger_restaurant", "american_restaurant", "fast_food_restaurant"], "minRating": 4.0}]
  
  IMPORTANT: If user mentions both generic type (e.g., "restaurant") and specific type (e.g., "sushi"), use the specific type in customStops instead of generic restaurant

- Stop Placement Preferences (Extract location requirements for stops):
  - "nearby" / "close by" / "close to me" / "near here" / "right around" → means stop should be within 5 minutes from current location
  - "along the way" / "on the way" / "on route" / "en route" / "on the path" → means stop should be along the main route, not off route
  - Store these as maxDetourMinutes in customStops: "nearby" = 5 minutes, "along the way" = default

- Timing Constraints (Extract arrival time preferences):
  - "arrive in 2 hours" / "get there in 2 hours" / "reach in about 2 hours" → {"arrivalTimeHours": 2}
  - "arrive by 3pm" / "get there by 5:00" → {"arrivalTime": "3:00 PM"} (extract specific time)
  - "quick trip" / "fast" / "fastest route" → {"preferences": {"fast": true}}

- Restaurant Preferences (Extract specific requirements from user's description):
  - "mediterranean food" / "mediterranean restaurant" / "good mediterranean food" → preferences: {"restaurantPreferences": {"cuisine": "mediterranean"}}
  - "Italian food" → preferences: {"restaurantPreferences": {"cuisine": "italian"}}
  - "Mexican restaurant" → preferences: {"restaurantPreferences": {"cuisine": "mexican"}}
  - "good food" / "best restaurant" → preferences: {"restaurantPreferences": {"rating": 4.0}}
  - "vegetarian" / "vegan" → preferences: {"restaurantPreferences": {"vegetarian": true}} or {"vegan": true}
  - "kid-friendly" / "family-friendly" → preferences: {"restaurantPreferences": {"kidFriendly": true}}
  - "cheap" / "budget" → preferences: {"restaurantPreferences": {"priceLevel": "$"}}
  - "fine dining" → preferences: {"restaurantPreferences": {"priceLevel": "$$$"}}

EXAMPLES OF COMPLETE EXTRACTION:

Input: "plan a route from my current location to emory oxford college, I want a restaurant that has good mediterranean food along the way, and a gas station along the way."
Output: {
  "destination": "Emory Oxford College, Oxford, GA",
  "action": "useCurrentLocation",
  "preferences": {
    "requestedStops": {
      "restaurant": true,
      "gas": true
    },
    "restaurantPreferences": {
      "cuisine": "mediterranean",
      "rating": 4.0
    }
  }
}

Input: "from LA to SF, I need gas and want Italian food"
Output: {
  "origin": "Los Angeles, CA",
  "destination": "San Francisco, CA",
  "preferences": {
    "requestedStops": {
      "gas": true,
      "restaurant": true
    },
    "restaurantPreferences": {
      "cuisine": "italian"
    }
  }
}

Input: "take me to miami with stops for lunch"
Output: {
  "destination": "Miami, FL",
  "action": "useCurrentLocation",
  "preferences": {
    "requestedStops": {
      "restaurant": true
    }
  }
}

Input: "drive from boston to new york, I'm hungry"
Output: {
  "origin": "Boston, MA",
  "destination": "New York, NY",
  "preferences": {
    "requestedStops": {
      "restaurant": true
    }
  }
}

Input: "scenic route from seattle to portland with viewpoints"
Output: {
  "origin": "Seattle, WA",
  "destination": "Portland, OR",
  "preferences": {
    "scenic": true,
    "requestedStops": {
      "scenic": true
    }
  }
}

Input: "Hey Journey, I want to go to miami, add a sushi place and gas station along the way. Can the gas station be close nearby and the sushi place be on the way to Miami so that we can reach there in about 2 hours"
Output: {
  "destination": "Miami, FL",
  "action": "useCurrentLocation",
  "arrivalTimeHours": 2,
  "preferences": {
    "requestedStops": {
      "gas": true
    },
    "customStops": [
      {
        "id": "gas_nearby",
        "label": "Gas Station",
        "keywords": ["gas", "fuel", "petrol", "chevron", "shell", "bp"],
        "placeTypes": ["gas_station"],
        "minRating": 4.0,
        "maxDetourMinutes": 5
      },
      {
        "id": "sushi",
        "label": "Sushi Restaurant",
        "keywords": ["sushi", "japanese", "sashimi", "roll", "nigiri"],
        "placeTypes": ["sushi_restaurant", "japanese_restaurant", "restaurant"],
        "minRating": 4.0
      }
    ]
  }
}

Input: "to boston with coffee shop and burger place along the way"
Output: {
  "destination": "Boston, MA",
  "action": "useCurrentLocation",
  "preferences": {
    "customStops": [
      {
        "id": "coffee",
        "label": "Coffee Shop",
        "keywords": ["coffee", "espresso", "latte", "café"],
        "placeTypes": ["cafe", "coffee_shop"],
        "minRating": 4.0
      },
      {
        "id": "burger",
        "label": "Burger Place",
        "keywords": ["burger", "hamburger", "cheeseburger"],
        "placeTypes": ["hamburger_restaurant", "american_restaurant"],
        "minRating": 4.0
      }
    ]
  }
}

IMPORTANT:
1. Always include city and state for locations to ensure Google Maps can find them
2. Extract vehicle range information if mentioned (e.g., "150 miles of range", "RAV4 has ~400 mile range")
3. Extract fuel level if mentioned (e.g., "half a tank", "1/4 tank")
4. CRITICAL: Extract which types of stops the user explicitly requested (gas, restaurant, scenic)
5. Extract cuisine type from natural language (e.g., "mediterranean food" → "mediterranean")
6. Extract quality indicators ("good", "best") as rating preferences
7. Return ONLY valid JSON.`;

  const client = getOpenAIClient();
  if (client) {
    try {
      const completionParams: any = {
        messages: [
          { role: 'system', content: 'You extract structured trip intents and locations. Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      };
      
      // Only add model for standard OpenAI (Azure uses deployment from constructor)
      if (!process.env.AZURE_OPENAI_ENDPOINT) {
        completionParams.model = 'gpt-5-chat';
      }
      
      const r = await client.chat.completions.create(completionParams);
      const text = r.choices?.[0]?.message?.content || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as TripParameters;
        if (parsed.origin) parsed.origin = parsed.origin.trim();
        if (parsed.destination) parsed.destination = parsed.destination.trim();
        const invalidWords = /^(plan|route|trip|go|travel|want|need|from|to)$/i;
        if (parsed.origin && (parsed.origin.length < 3 || invalidWords.test(parsed.origin))) {
          parsed.origin = undefined;
        }
        if (parsed.destination && (parsed.destination.length < 3 || invalidWords.test(parsed.destination))) {
          parsed.destination = undefined;
        }
        const enriched = applyPreferenceHeuristics(parsed, cleanedMessage);
        if (enriched.origin && enriched.destination) return enriched;
        if (enriched.destination && !enriched.origin) {
          return { ...enriched, action: enriched.action || 'useCurrentLocation' };
        }
      }
    } catch (e) {
      console.warn('[parseUserRequest] OpenAI extraction failed:', e);
    }
  } else {
    console.warn('[parseUserRequest] OPENAI_API_KEY not set; using regex fallback.');
  }
  
  // Fallback: Try simple regex patterns only if AI extraction failed
  console.log('[parseUserRequest] AI extraction failed or returned invalid data, trying regex fallback...');
  
  // Pattern 1: "to Y" (destination only) - improved to capture full destination including "the"
  // Look for "to" followed by the rest of the message
  const toIndex = cleanedMessage.toLowerCase().indexOf(' to ');
  if (toIndex !== -1 && !cleanedMessage.toLowerCase().match(/from\s+[A-Za-z]/i)) {
    // Extract everything after " to " until the end (or punctuation)
    let destination = cleanedMessage.substring(toIndex + 4).trim();
    // Remove trailing punctuation but keep the full destination name
    destination = destination.replace(/[.!?,;:].*$/i, '').trim();
    // Remove common trailing words
    destination = destination.replace(/\s+(please|thanks|thank you|now|today).*$/i, '').trim();
    
    // Validate: must be longer than 2 chars and not just "the", "a", "an"
    if (destination.length > 2 && destination.toLowerCase() !== 'the' && destination.toLowerCase() !== 'a' && destination.toLowerCase() !== 'an') {
      console.log('[parseUserRequest] Regex fallback extracted (to only):', { destination });
      return applyPreferenceHeuristics(
        { destination, action: 'useCurrentLocation' },
        cleanedMessage
      );
    }
  }
  
  // Alternative pattern for "plan a trip to X" or "to X"
  const toOnlyPattern = /(?:plan\s+(?:a\s+)?(?:trip|route)\s+)?to\s+(.+?)(?:\s*$|[.!?,;:])/i;
  const toOnlyMatch = cleanedMessage.match(toOnlyPattern);
  
  if (toOnlyMatch && toOnlyMatch[1] && !cleanedMessage.toLowerCase().includes('from')) {
    let destination = toOnlyMatch[1].trim();
    destination = destination.replace(/[.!?,;:].*$/i, '').trim();
    
    // Don't accept single words like "the", "a", "an" as destinations
    if (destination.length > 2 && !/^(the|a|an)$/i.test(destination)) {
      console.log('[parseUserRequest] Regex fallback extracted (to only pattern):', { destination });
      return applyPreferenceHeuristics(
        { destination, action: 'useCurrentLocation' },
        cleanedMessage
      );
    }
  }

  // Pattern 2: "from X to Y" - find the "from" keyword and extract what comes after
  // This handles cases like "plan a route from Los Angeles to San Francisco"
  const fromIndex = cleanedMessage.toLowerCase().indexOf('from');
  if (fromIndex !== -1) {
    const afterFrom = cleanedMessage.substring(fromIndex + 4).trim(); // +4 for "from"

    // Look for "to" keyword to split origin and destination
    const toIndex = afterFrom.toLowerCase().indexOf(' to ');

    if (toIndex !== -1) {
      let origin = afterFrom.substring(0, toIndex).trim();
      // Get everything after " to " until end of sentence or punctuation
      let destination = afterFrom.substring(toIndex + 4).trim(); // +4 for " to "

      // Remove trailing punctuation and extra text
      destination = destination.replace(/[.!?,;].*$/i, '').trim();

      // Clean up: remove any words that got captured incorrectly
      origin = origin.replace(/^(plan|route|trip|go|travel|want|need)\s+/i, '').trim();
      destination = destination.replace(/\s+(and|with|using|via|through).*$/i, '').trim();

      console.log('[parseUserRequest] Regex extracted (from-to):', { origin, destination });

      // Validate: locations should be at least 2 characters and not just common words
      const invalidWords = /^(plan|route|trip|go|travel|want|need|from|to|a|the)$/i;

      // Check if destination is too short (might be cut off) - common abbreviations
      const cityAbbreviations: Record<string, string> = {
        'sf': 'San Francisco',
        'la': 'Los Angeles',
        'nyc': 'New York City',
        'ny': 'New York',
        'chi': 'Chicago',
        'hou': 'Houston',
        'phx': 'Phoenix',
        'phil': 'Philadelphia',
        'sd': 'San Diego',
        'dal': 'Dallas',
        'san': 'San Francisco', // Default "san" to San Francisco if no other context
      };

      // Expand common abbreviations
      const destLower = destination.toLowerCase().trim();
      if (cityAbbreviations[destLower]) {
        destination = cityAbbreviations[destLower];
        console.log('[parseUserRequest] Expanded destination abbreviation:', destLower, '->', destination);
      }

      if (origin.length >= 2 && destination.length >= 2 &&
          !invalidWords.test(origin) && !invalidWords.test(destination)) {
        // Capitalize first letter of each word for consistency
        origin = origin.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        destination = destination.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

        console.log('[parseUserRequest] Regex fallback extracted (from-to):', { origin, destination });
        return applyPreferenceHeuristics({ origin, destination }, cleanedMessage);
      }
    }
  }
  
  // Pattern 2b: Alternative regex pattern for "from X to Y"
  const fromToRegex = /\bfrom\s+([a-zA-Z][a-zA-Z\s,]{1,}?)\s+to\s+([a-zA-Z][a-zA-Z\s,]+?)(?:\s|$|\.|,|!|\?)/i;
  const fromToMatch = cleanedMessage.match(fromToRegex);
  if (fromToMatch && fromToMatch[1] && fromToMatch[2]) {
    let origin = fromToMatch[1].trim();
    let destination = fromToMatch[2].trim();
    
    // Remove any words that got captured incorrectly
    origin = origin.replace(/^(plan|route|trip|go|travel|want|need)\s+/i, '')
                   .replace(/\s+(to|from|route|trip|plan).*$/i, '')
                   .trim();
    destination = destination.replace(/\s+(from|route|trip|plan).*$/i, '').trim();
    
    const invalidWords = /^(plan|route|trip|go|travel|want|need|from|to|a|the)$/i;
    if (origin.length >= 2 && destination.length >= 2 &&
        !invalidWords.test(origin) && !invalidWords.test(destination)) {
      origin = origin.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      destination = destination.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      console.log('[parseUserRequest] Regex fallback extracted (from-to regex):', { origin, destination });
      return applyPreferenceHeuristics({ origin, destination }, cleanedMessage);
    }
  }

  // Pattern 3: "X to Y" without "from" (simpler pattern)
  const simpleToPattern = /(?:^|\s)([A-Z][a-zA-Z\s,]{2,}?)\s+to\s+([A-Z][a-zA-Z\s,]+?)(?:\s|$|\.|,|!|\?)(?!\s+(?:from|route|trip))/i;
  const simpleToMatch = cleanedMessage.match(simpleToPattern);
  
  if (simpleToMatch && simpleToMatch[1] && simpleToMatch[2]) {
    let origin = simpleToMatch[1].trim();
    let destination = simpleToMatch[2].trim();
    
    // Filter out common non-location words
    const nonLocationWords = /^(plan|route|trip|go|travel|want|need|from|to)$/i;
    if (!nonLocationWords.test(origin) && !nonLocationWords.test(destination)) {
      origin = origin.replace(/\s+(to|from|route|trip).*$/i, '').trim();
      destination = destination.replace(/\s+(to|from|route|trip).*$/i, '').trim();
      
      if (origin.length > 2 && destination.length > 2) {
        console.log('Regex fallback extracted (simple to):', { origin, destination });
      return applyPreferenceHeuristics({ origin, destination }, cleanedMessage);
      }
    }
  }

  console.warn('Could not extract trip parameters from message:', cleanedMessage);
  return applyPreferenceHeuristics({}, cleanedMessage);
}

function buildFallbackStopReason(
  stopType: string,
  stopName: string,
  stopDetails: any,
  routeContext: string
): string {
  const location =
    stopDetails.vicinity ||
    stopDetails.formatted_address ||
    stopDetails.address ||
    '';

  const normalizedType = (stopType || '').toLowerCase();
  const isGasStation = normalizedType === 'gas';
  
  const sentences: string[] = [];
  
  // For gas stations, use more natural language and focus on practical benefits
  if (isGasStation) {
    // Build rating information
    if (typeof stopDetails.rating === 'number') {
      const ratingText = stopDetails.rating === 5.0 
        ? 'perfect 5.0 rating'
        : `${stopDetails.rating.toFixed(1)}-star rating`;
      
      let ratingSentence = `Selected for its ${ratingText}`;
      if (typeof stopDetails.user_ratings_total === 'number' && stopDetails.user_ratings_total > 0) {
        ratingSentence += ` from ${formatNumber(stopDetails.user_ratings_total)} review${stopDetails.user_ratings_total !== 1 ? 's' : ''}`;
      }
      ratingSentence += '.';
      sentences.push(ratingSentence);
    }
    
    // Add verified attributes if available
    if (Array.isArray(stopDetails.verifiedAttributes) && stopDetails.verifiedAttributes.length > 0) {
      const attributesText = stopDetails.verifiedAttributes.join(', ');
      sentences.push(`Offers ${attributesText}.`);
    } else if (stopDetails.is24Hours) {
      sentences.push('Open 24/7 for your convenience.');
    }
    
    // Add location if available
    if (location) {
      sentences.push(`Conveniently located ${location}.`);
    } else {
      sentences.push('Well-positioned along your route for refueling.');
    }
  } else {
    // For other stop types, use the original format
    const locationText = location ? `located at ${location}` : 'along your route';
    const stopTypeLabel = (() => {
      if (normalizedType === 'restaurant' || normalizedType === 'food') {
        return 'dining option';
      }
      if (normalizedType === 'scenic') {
        return 'scenic viewpoint';
      }
      return 'stop';
    })();

    let mainReason = `${stopName} is a well-positioned ${stopTypeLabel}`;
    
    if (typeof stopDetails.rating === 'number') {
      mainReason += ` with a ${stopDetails.rating.toFixed(1)}★ rating`;
      if (
        typeof stopDetails.user_ratings_total === 'number' &&
        stopDetails.user_ratings_total > 0
      ) {
        mainReason += ` from ${formatNumber(stopDetails.user_ratings_total)} reviews`;
      }
    }
    mainReason += '.';
    sentences.push(mainReason);

    if (
      Array.isArray(stopDetails.verifiedAttributes) &&
      stopDetails.verifiedAttributes.length > 0
    ) {
      sentences.push(
        `Verified features: ${stopDetails.verifiedAttributes.join(', ')}.`
      );
    }

    sentences.push(`Conveniently ${locationText}.`);
  }

  return sentences.filter(Boolean).join(' ');
}

export async function generateStopReason(
  stopType: string,
  stopName: string,
  stopDetails: any,
  routeContext: string
): Promise<string> {
  console.log(`[generateStopReason] Generating grounded reason for ${stopType} stop: ${stopName}`);

  // Create a more detailed, contextual prompt that emphasizes grounding
  const location = stopDetails.vicinity || stopDetails.formatted_address || stopDetails.address || 'along your route';
  const rating = stopDetails.rating ? `${stopDetails.rating}/5 stars` : 'highly rated';

  let typeSpecificContext = '';
  let groundingInstructions = '';

  switch(stopType.toLowerCase()) {
    case 'gas':
      typeSpecificContext = `This gas station is positioned to help you refuel during your journey.`;
      groundingInstructions = `Use Google Maps to verify: 24/7 operation hours (check opening_hours data), clean restrooms (look for review mentions), easy highway access (check location relative to major roads), and competitive pricing if available.`;
      break;
    case 'restaurant':
    case 'food':
      typeSpecificContext = `This restaurant offers a dining opportunity along your route.`;
      groundingInstructions = `Use Google Maps to verify: menu options from photos/reviews, parking availability (check for parking mentions in reviews), family-friendly amenities (high chairs, kids menu mentions), dietary options (vegetarian/vegan from menu data), and wait times.`;
      break;
    case 'scenic':
      typeSpecificContext = `This location provides a scenic viewpoint or attraction.`;
      groundingInstructions = `Use Google Maps to verify: photo quality and recency, review mentions of views/photo opportunities, accessibility (parking, walkability), best time to visit, and whether it's worth the detour based on review sentiment.`;
      break;
    default:
      typeSpecificContext = `This location offers a stop along your journey.`;
      groundingInstructions = `Use Google Maps data to verify claims about this location.`;
  }

  // Build location data section - exclude types for gas stations to avoid technical categorization mentions
  const shouldIncludeTypes = stopType.toLowerCase() !== 'gas';
  const locationDataSection = `LOCATION TO ANALYZE:
- Name: ${stopName}
- Type: ${stopType}
- Location: ${location}
- Initial Rating: ${rating}
${shouldIncludeTypes && stopDetails.types ? `- Categories: ${stopDetails.types.slice(0, 3).join(', ')}` : ''}
${stopDetails.opening_hours?.open_now !== undefined ? `- Status: ${stopDetails.opening_hours.open_now ? 'Open' : 'Closed'}` : ''}
${stopDetails.price_level ? `- Price level: ${'$'.repeat(stopDetails.price_level)}` : ''}
${stopDetails.user_ratings_total ? `- Review count: ${stopDetails.user_ratings_total}` : ''}
${stopDetails.verifiedAttributes && stopDetails.verifiedAttributes.length > 0 ? `- VERIFIED ATTRIBUTES (from Google Maps): ${stopDetails.verifiedAttributes.join(', ')}` : ''}
${stopDetails.is24Hours ? `- VERIFIED: Open 24/7 (confirmed from Google Maps)` : ''}
${stopDetails.hasCleanFacilities ? `- VERIFIED: Clean facilities (confirmed from Google Maps reviews)` : ''}`;

  // Add specific instructions for gas stations to avoid mentioning categorization
  const gasStationSpecificInstructions = stopType.toLowerCase() === 'gas' 
    ? `\n\nIMPORTANT FOR GAS STATIONS:
- Focus on practical benefits: rating, 24/7 operation, clean facilities, location convenience
- Do NOT mention what the location is "categorized as" or "listed as"
- Do NOT include technical categorization details like "gas_station, convenience_store, car_repair"
- Write in natural, user-friendly language about why this is a good refueling stop
- Emphasize verified attributes like 24/7 operation and clean facilities if available`
    : '';

  const prompt = `You are an expert travel advisor. Generate a trustworthy, specific justification for why this stop was selected, using ONLY the provided data (ratings, reviews, attributes).

${locationDataSection}

ROUTE CONTEXT: ${routeContext}

GROUNDING TASK:
${groundingInstructions}

YOUR TASK:
1. Query Google Maps data for "${stopName}" to VERIFY and ENRICH the information above
2. Analyze actual reviews, photos, and place details from Google Maps
3. Write a justification based ONLY on facts you can verify through Google Maps grounding
4. Include specific details like: exact rating from Maps, number of reviews, verified amenities, recent review mentions, distance from highway, parking details
5. FORMAT AS BULLET POINTS (2-3 bullets max)
6. Use plain text only - NO markdown formatting, NO asterisks, NO bold text

STYLE: Direct, confident, data-driven. Highlight verified attributes prominently.

Example format (plain text bullet points):
• Selected for its verified 4.7 rating with 1,247 reviews
• Open 24/7 with clean facilities confirmed in recent reviews
• Located 0.3 miles off I-5 with easy re-entry

${typeSpecificContext}${gasStationSpecificInstructions}

CRITICAL: 
- Do NOT use asterisks or any markdown formatting
- Format as bullet points (use • or -)
- Do NOT invent facts beyond what's provided
- Do NOT mention categorization, listing, or technical category details
- Keep it concise (2-3 bullet points)
- Write in natural, conversational language`;

  const fallbackReason = buildFallbackStopReason(
    stopType,
    stopName,
    stopDetails,
    routeContext
  );

  try {
    const client = getOpenAIClient();
    if (!client) return fallbackReason;
    
    const completionParams: any = {
      messages: [
        { role: 'system', content: 'Write 2-3 concise, factual bullet points using only provided data. Use plain text with bullet symbols (•). NO markdown, NO asterisks, NO bold formatting.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 200,
    };
    
    // Only add model for standard OpenAI (Azure uses deployment from constructor)
    if (!process.env.AZURE_OPENAI_ENDPOINT) {
      completionParams.model = 'gpt-5-chat';
    }
    
    const response = await client.chat.completions.create(completionParams);
    const text = response.choices?.[0]?.message?.content?.trim();
    
    // Strip out all markdown formatting (asterisks for bold/italic)
    const cleanText = text ? text.replace(/\*\*/g, '').replace(/\*/g, '') : fallbackReason;
    return cleanText;
  } catch (error: any) {
    console.error('[generateStopReason] OpenAI error:', error);
    return fallbackReason;
  }
}

export async function generateConversationalResponse(
  userMessage: string,
  tripParameters: TripParameters,
  hasMissingInfo: boolean
): Promise<string> {
  // Check if we're using current location
  const usingCurrentLocation = tripParameters.action === 'useCurrentLocation' || (!tripParameters.origin && tripParameters.destination);
  
  let prompt = `You are a helpful journey planning assistant. The user said: "${userMessage}"

Extracted parameters: ${JSON.stringify(tripParameters)}

`;

  if (hasMissingInfo) {
    prompt += `Some information is missing. Ask the user conversationally for the missing details (origin, destination, or fuel/vehicle info if they mentioned needing gas stops).`;
  } else {
    if (usingCurrentLocation) {
      prompt += `All necessary information is available. The user did not specify a starting location, so we're using their current location as the starting point. Acknowledge the request conversationally and mention that you're using their current location as the starting point, then let them know you're planning their route.`;
    } else {
      prompt += `All necessary information is available. Acknowledge the request and let them know you're planning their route.`;
    }
  }

  try {
    const client = getOpenAIClient();
    if (!client) return "I'll help you plan your journey!";
    
    const completionParams: any = {
      messages: [
        { role: 'system', content: 'You are a concise, friendly journey planning assistant. Respond in plain text without any markdown formatting (no asterisks, no bold, no italics).' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 256,
    };
    
    // Only add model for standard OpenAI (Azure uses deployment from constructor)
    if (!process.env.AZURE_OPENAI_ENDPOINT) {
      completionParams.model = 'gpt-5-chat';
    }
    
    const response = await client.chat.completions.create(completionParams);
    const content = response.choices?.[0]?.message?.content || "I'll help you plan your journey!";
    
    // Remove any markdown formatting (asterisks for bold/italic)
    return content.replace(/\*\*/g, '').replace(/\*/g, '');
  } catch {
    return "I'll help you plan your journey!";
  }
}

/**
 * Generate a complete itinerary with stops using OpenAI (gpt-5-chat).
 * This function uses OpenAI to suggest stops (gas, food, scenic) along a route
 * based on user preferences and trip details.
 */
export async function generateItineraryWithStops(
  userPrompt: string,
  tripParameters?: TripParameters
): Promise<Itinerary> {
  const systemInstruction = `You are an expert trip planner AI. Your goal is to take a user's request and transform it into a rich, detailed, and logical travel itinerary.
- You must always respond with a valid JSON object that conforms to the provided schema.
- Infer vehicle details if needed (e.g., 'RAV4' implies a standard gas tank size and range).
- Use realistic names for businesses and points of interest.
- The 'reason' for each stop is crucial; make it compelling and specific.
- Ensure the sequence of stops is logical. Gas stops should appear before the vehicle's range is exceeded. Meal stops should be at appropriate times.
- Always include the ORIGIN and DESTINATION as the first and last stops.
- Generate plausible latitude and longitude coordinates for each stop.
- Also, generate a simplified 'overviewPath' as an array of {lat, lng} points that roughly follows major roads, connecting all the stops in order.
- If the user asks for a modification, generate a complete new itinerary based on the new constraints.

You must respond with ONLY valid JSON, no additional text or markdown formatting. The JSON must match this exact schema:
{
  "tripTitle": "string",
  "routeComparison": [
    {
      "name": "string",
      "duration": "string",
      "distance": "string",
      "cost": "string",
      "summary": "string"
    }
  ],
  "enrichedRoute": {
    "summary": {
      "name": "string",
      "duration": "string",
      "distance": "string",
      "cost": "string",
      "summary": "string"
    },
    "stops": [
      {
        "type": "ORIGIN" | "DESTINATION" | "GAS" | "FOOD" | "SCENIC" | "OTHER",
        "name": "string",
        "address": "string",
        "reason": "string",
        "durationMinutes": number,
        "latitude": number,
        "longitude": number
      }
    ],
    "overviewPath": [
      {
        "lat": number,
        "lng": number
      }
    ]
  }
}`;

  // Build context from trip parameters if available
  let contextPrompt = userPrompt;
  if (tripParameters) {
    const contextParts: string[] = [];
    
    if (tripParameters.origin) {
      contextParts.push(`Origin: ${tripParameters.origin}`);
    }
    if (tripParameters.destination) {
      contextParts.push(`Destination: ${tripParameters.destination}`);
    }
    if (tripParameters.fuelLevel !== undefined) {
      contextParts.push(`Current fuel level: ${(tripParameters.fuelLevel * 100).toFixed(0)}%`);
    }
    if (tripParameters.vehicleRange) {
      contextParts.push(`Vehicle range: ${tripParameters.vehicleRange} miles`);
    }
    if (tripParameters.preferences) {
      const prefs = tripParameters.preferences;
      if (prefs.scenic) contextParts.push('Preference: Scenic route');
      if (prefs.fast) contextParts.push('Preference: Fastest route');
      if (prefs.avoidTolls) contextParts.push('Preference: Avoid tolls');
      if (prefs.restaurantPreferences) {
        const rp = prefs.restaurantPreferences;
        const restaurantPrefs: string[] = [];
        if (rp.cuisine) restaurantPrefs.push(`Cuisine: ${rp.cuisine}`);
        if (rp.rating) restaurantPrefs.push(`Minimum rating: ${rp.rating}`);
        if (rp.priceLevel) restaurantPrefs.push(`Price level: ${rp.priceLevel}`);
        if (rp.kidFriendly) restaurantPrefs.push('Kid-friendly');
        if (rp.openNow) restaurantPrefs.push('Open now');
        if (restaurantPrefs.length > 0) {
          contextParts.push(`Restaurant preferences: ${restaurantPrefs.join(', ')}`);
        }
        if (rp.keywords && rp.keywords.length > 0) {
          contextParts.push(`Restaurant keywords: ${rp.keywords.join(', ')}`);
        }
      }
      if (prefs.customStops && prefs.customStops.length > 0) {
        const customSummary = prefs.customStops
          .map(stop => {
            const baseLabel = stop.label || stop.id;
            const keywordSummary = stop.keywords && stop.keywords.length > 0
              ? `keywords: ${stop.keywords.join(', ')}`
              : undefined;
            return keywordSummary ? `${baseLabel} (${keywordSummary})` : baseLabel;
          });
        contextParts.push(`Custom stops requested: ${customSummary.join('; ')}`);
      }
    }
    
    if (contextParts.length > 0) {
      contextPrompt = `${userPrompt}\n\nTrip details:\n${contextParts.join('\n')}`;
    }
  }

  try {
    const client = getOpenAIClient();
    if (client) {
      const completionParams: any = {
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: contextPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      };
      
      // Only add model for standard OpenAI (Azure uses deployment from constructor)
      if (!process.env.AZURE_OPENAI_ENDPOINT) {
        completionParams.model = 'gpt-5-chat';
      }
      
      const response = await client.chat.completions.create(completionParams);

      const content = response.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const parsedJson: Itinerary = JSON.parse(jsonMatch ? jsonMatch[0] : content);

      if (parsedJson.enrichedRoute && parsedJson.enrichedRoute.stops && parsedJson.enrichedRoute.overviewPath) {
        return parsedJson;
      }
      console.warn('[generateItineraryWithStops] Parsed JSON missing required fields, falling back.');
    } else {
      console.warn('[generateItineraryWithStops] OPENAI_API_KEY missing; returning fallback itinerary.');
    }
  } catch (error) {
    console.warn('[generateItineraryWithStops] OpenAI failed; returning fallback itinerary:', error);
  }

  // Deterministic heuristic fallback: minimal route with origin and destination only
  const origin = tripParameters?.origin || 'Origin';
  const destination = tripParameters?.destination || 'Destination';
  const title = `${origin} to ${destination}`;
  return {
    tripTitle: title,
    routeComparison: [
      { name: "Recommended", duration: "—", distance: "—", cost: "~$—", summary: "Direct route" }
    ],
    enrichedRoute: {
      summary: { name: "Direct Route", duration: "—", distance: "—", cost: "~$—", summary: "Direct route between origin and destination." },
      stops: [
        { type: StopType.ORIGIN, name: origin, address: origin, reason: "Trip start", durationMinutes: 0, latitude: 0, longitude: 0 },
        { type: StopType.DESTINATION, name: destination, address: destination, reason: "Trip end", durationMinutes: 0, latitude: 0, longitude: 0 },
      ],
      overviewPath: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0 }],
    }
  };
}
