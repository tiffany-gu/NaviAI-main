import fetch from 'node-fetch';

// Using REST API directly instead of SDK to avoid auth issues
// Get env variables at runtime instead of module load time
const getGeminiApiKey = () => process.env.AI_INTEGRATIONS_GEMINI_API_KEY!;
// Use v1beta for Google Search grounding support (required for grounding features)
const GEMINI_API_URL_V1BETA = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
// Use v1 for standard API calls (generateStopReason doesn't need grounding)
const GEMINI_API_URL_V1 = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';

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
    };
    requestedStops?: {
      gas?: boolean;
      restaurant?: boolean;
      scenic?: boolean;
    };
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

export async function parseUserRequest(userMessage: string, conversationHistory: string[]): Promise<TripParameters> {
  console.log('Parsing user message:', userMessage);

  // Clean up the message - remove common phrases that might interfere with parsing
  const cleanedMessage = userMessage.trim();

  // Try AI extraction with Google Maps grounding for better location resolution
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

IMPORTANT:
1. Always include city and state for locations to ensure Google Maps can find them
2. Extract vehicle range information if mentioned (e.g., "150 miles of range", "RAV4 has ~400 mile range")
3. Extract fuel level if mentioned (e.g., "half a tank", "1/4 tank")
4. CRITICAL: Extract which types of stops the user explicitly requested (gas, restaurant, scenic)
5. Extract cuisine type from natural language (e.g., "mediterranean food" → "mediterranean")
6. Extract quality indicators ("good", "best") as rating preferences
7. Return ONLY valid JSON.`;

  const apiKey = getGeminiApiKey();
  console.log('Calling Gemini API with key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'undefined');

  try {
    // Try v1beta with Google Search grounding first, fallback to v1 if not available
    // Note: v1beta may not support all models, so we'll try v1beta first and fallback to v1
    let requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      tools: [{
        googleSearch: {}
      }],
      generationConfig: {
        temperature: 0.2, // Lower temperature for more consistent extraction
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json', // Request JSON response
      }
    };

    // Try v1beta first for Google Search grounding
    let response = await fetch(`${GEMINI_API_URL_V1BETA}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    // If v1beta fails with 404 (model not found), fallback to v1 without grounding
    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[parseUserRequest] v1beta API not available, falling back to v1:', errorText);
      
      // Remove Google Search grounding and use v1 endpoint
      requestBody = {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        }
      } as any;

      response = await fetch(`${GEMINI_API_URL_V1}?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[parseUserRequest] Gemini API HTTP error:', response.status, errorText);
      // Fall through to regex fallback
    } else {
      const data: any = await response.json();

      console.log('[parseUserRequest] Gemini API response:', JSON.stringify(data, null, 2));

      // Check for API errors in response
      if (data.error) {
        console.error('[parseUserRequest] Gemini API returned error:', data.error);
        // Fall through to regex fallback
      } else if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        // Process the response
        const text = data.candidates[0].content.parts[0].text;
        console.log('[parseUserRequest] Extracted text from Gemini:', text);

        // Extract JSON from the response (might be wrapped in markdown code blocks)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]) as TripParameters;

            console.log('[parseUserRequest] Initial parsed from Gemini (with Google Maps grounding):', JSON.stringify(parsed, null, 2));

            // Gemini should now return well-formatted addresses, so minimal cleaning needed
            if (parsed.origin) {
              parsed.origin = parsed.origin.trim();
              console.log('[parseUserRequest] Origin:', parsed.origin);
            }

            if (parsed.destination) {
              parsed.destination = parsed.destination.trim();
              console.log('[parseUserRequest] Destination:', parsed.destination);
            }

            // Simple validation - just check that we have actual location data
            const invalidWords = /^(plan|route|trip|go|travel|want|need|from|to)$/i;

            if (parsed.origin && (parsed.origin.length < 3 || invalidWords.test(parsed.origin))) {
              console.warn('[parseUserRequest] Invalid origin after Gemini processing:', parsed.origin);
              parsed.origin = undefined;
            }

            if (parsed.destination && (parsed.destination.length < 3 || invalidWords.test(parsed.destination))) {
              console.warn('[parseUserRequest] Invalid destination after Gemini processing:', parsed.destination);
              parsed.destination = undefined;
            }

            console.log('[parseUserRequest] Final validated trip parameters (Gemini with grounding):', JSON.stringify(parsed, null, 2));

            // Return if we have valid data
            if (parsed.origin && parsed.destination) {
              return parsed;
            } else if (parsed.destination && !parsed.origin) {
              return { destination: parsed.destination, action: 'useCurrentLocation' };
            }
            // Otherwise fall through to regex fallback
            console.log('[parseUserRequest] Gemini parsing incomplete, falling back to regex');
          } catch (parseError) {
            console.error('[parseUserRequest] Failed to parse JSON from Gemini response:', parseError);
            console.error('[parseUserRequest] Response text:', text);
            // Fall through to regex fallback
          }
        }
      } else {
        console.warn('[parseUserRequest] No valid candidates in Gemini response, trying regex fallback');
      }
    }
  } catch (apiError) {
    console.error('[parseUserRequest] Error calling Gemini API:', apiError);
    // Fall through to regex fallback
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
      return { destination, action: 'useCurrentLocation' };
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
      return { destination, action: 'useCurrentLocation' };
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
        return { origin, destination };
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
      return { origin, destination };
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
        return { origin, destination };
      }
    }
  }

  console.warn('Could not extract trip parameters from message:', cleanedMessage);
  return {};
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

  const prompt = `You are an expert travel advisor with DIRECT ACCESS to Google Maps data through grounding. Generate a trustworthy, specific justification (2-3 sentences) for why this stop was selected, using ONLY VERIFIED data from Google Maps.

LOCATION TO ANALYZE:
- Name: ${stopName}
- Type: ${stopType}
- Location: ${location}
- Initial Rating: ${rating}
${stopDetails.types ? `- Categories: ${stopDetails.types.slice(0, 3).join(', ')}` : ''}
${stopDetails.opening_hours?.open_now !== undefined ? `- Status: ${stopDetails.opening_hours.open_now ? 'Open' : 'Closed'}` : ''}
${stopDetails.price_level ? `- Price level: ${'$'.repeat(stopDetails.price_level)}` : ''}
${stopDetails.user_ratings_total ? `- Review count: ${stopDetails.user_ratings_total}` : ''}
${stopDetails.verifiedAttributes && stopDetails.verifiedAttributes.length > 0 ? `- VERIFIED ATTRIBUTES (from Google Maps): ${stopDetails.verifiedAttributes.join(', ')}` : ''}
${stopDetails.is24Hours ? `- VERIFIED: Open 24/7 (confirmed from Google Maps)` : ''}
${stopDetails.hasCleanFacilities ? `- VERIFIED: Clean facilities (confirmed from Google Maps reviews)` : ''}

ROUTE CONTEXT: ${routeContext}

GROUNDING TASK:
${groundingInstructions}

YOUR TASK:
1. Query Google Maps data for "${stopName}" to VERIFY and ENRICH the information above
2. Analyze actual reviews, photos, and place details from Google Maps
3. Write a justification based ONLY on facts you can verify through Google Maps grounding
4. Include specific details like: exact rating from Maps, number of reviews, verified amenities, recent review mentions, distance from highway, parking details

STYLE: Direct, confident, data-driven. Highlight verified attributes prominently.

Example for gas station with verified attributes:
"Selected for its verified 4.7★ rating (1,247 reviews) with VERIFIED 24/7 operation and clean facilities confirmed in recent reviews. Located 0.3 miles off I-5 with easy re-entry, making it the highest-rated option at this 150-mile mark on your journey."

Example for restaurant with verified attributes:
"Chosen for its verified ${stopDetails.verifiedAttributes?.join(', ') || 'high ratings'} from Google Maps data. ${stopDetails.verifiedAttributes?.includes('vegetarian options') ? 'Recent reviews confirm excellent vegetarian options' : ''}${stopDetails.verifiedAttributes?.includes('kid-friendly') ? ' with kid-friendly amenities verified by multiple reviewers' : ''}. Rated ${rating}/5 with parking available, perfect for a meal break on your journey."

${typeSpecificContext}

CRITICAL: Use Google Maps grounding to verify ALL claims. Do NOT hallucinate details. If data isn't available through grounding, acknowledge it (e.g., "well-rated option" instead of specific stars if grounding doesn't return rating).`;

  try {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      console.error('[generateStopReason] Gemini API key not found');
      return `${stopName} is perfectly positioned ${location}, offering ${rating} quality service. It's an ideal spot to take a break during your journey.`;
    }

    // Use v1 API endpoint (doesn't need Google Search grounding - we already have verified data from Google Maps)
    const requestBody: any = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.7, // Balanced temperature for factual yet engaging responses
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 400, // Allow for detailed responses
      }
    };

    const response = await fetch(`${GEMINI_API_URL_V1}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[generateStopReason] Gemini API HTTP error: ${response.status}`, errorText);
      return `${stopName} is perfectly positioned ${location}, offering ${rating} quality. It's an ideal spot to take a break and continue your journey refreshed.`;
    }

    const data: any = await response.json();

    console.log('[generateStopReason] Gemini API response:', JSON.stringify(data, null, 2));

    // Check for API errors
    if (data.error) {
      console.error('[generateStopReason] Gemini API returned error:', data.error);
      return `${stopName} stands out ${location} with its ${rating} reputation. Perfect for a well-timed break that adds value to your trip.`;
    }

    // Extract the generated reason
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      const reason = data.candidates[0].content.parts[0].text.trim();
      console.log(`[generateStopReason] Generated sophisticated reason: ${reason}`);
      return reason;
    } else {
      console.warn('[generateStopReason] No valid response from Gemini API');
      console.warn('[generateStopReason] Response data:', JSON.stringify(data, null, 2));
      return `${stopName} is perfectly positioned ${location}, offering ${rating} quality. It's an ideal spot to take a break during your journey.`;
    }
  } catch (error: any) {
    console.error('[generateStopReason] Error calling Gemini API:', error);
    return `This ${stopType} is a good choice along your route based on location and ratings.`;
  }
}

export async function generateConversationalResponse(
  userMessage: string,
  tripParameters: TripParameters,
  hasMissingInfo: boolean
): Promise<string> {
  let prompt = `You are a helpful journey planning assistant. The user said: "${userMessage}"

Extracted parameters: ${JSON.stringify(tripParameters)}

`;

  if (hasMissingInfo) {
    prompt += `Some information is missing. Ask the user conversationally for the missing details (origin, destination, or fuel/vehicle info if they mentioned needing gas stops).`;
  } else {
    prompt += `All necessary information is available. Acknowledge the request and let them know you're planning their route.`;
  }

  const response = await fetch(`${GEMINI_API_URL_V1}?key=${getGeminiApiKey()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 512,
      }
    })
  });

  const data: any = await response.json();

  if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
    return "I'll help you plan your journey!";
  }

  return data.candidates[0].content.parts[0].text;
}

/**
 * Generate a complete itinerary with stops using Gemini's structured output.
 * This function uses Gemini AI to suggest stops (gas, food, scenic) along a route
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
- If the user asks for a modification, generate a complete new itinerary based on the new constraints.`;

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
      }
    }
    
    if (contextParts.length > 0) {
      contextPrompt = `${userPrompt}\n\nTrip details:\n${contextParts.join('\n')}`;
    }
  }

  // Define the response schema for structured output
  const responseSchema = {
    type: 'object',
    properties: {
      tripTitle: {
        type: 'string',
        description: 'A creative and descriptive title for the trip, e.g., "Coastal Cruise: SF to LA".'
      },
      routeComparison: {
        type: 'array',
        description: 'A comparison of 2-3 route options, like scenic vs. fastest.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'e.g., "Google\'s Fastest Route" or "Scenic Pacific Coast Highway"' },
            duration: { type: 'string', description: 'Total travel time, e.g., "6h 30m"' },
            distance: { type: 'string', description: 'Total distance, e.g., "450 miles"' },
            cost: { type: 'string', description: 'Estimated cost for gas or tolls, e.g., "~$65 gas"' },
            summary: { type: 'string', description: 'A brief summary of the route\'s characteristics.' }
          },
          required: ['name', 'duration', 'distance', 'cost', 'summary']
        }
      },
      enrichedRoute: {
        type: 'object',
        description: 'The detailed, enriched itinerary for the user\'s chosen or recommended route.',
        properties: {
          summary: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name of the chosen route, e.g., "Your Scenic Route"' },
              duration: { type: 'string' },
              distance: { type: 'string' },
              cost: { type: 'string' },
              summary: { type: 'string' }
            },
            required: ['name', 'duration', 'distance', 'cost', 'summary']
          },
          stops: {
            type: 'array',
            description: 'An ordered list of stops along the route, starting with origin and ending with destination.',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['ORIGIN', 'DESTINATION', 'GAS', 'FOOD', 'SCENIC', 'OTHER'],
                  description: 'The type of stop.'
                },
                name: { type: 'string', description: 'Name of the place, e.g., "Shell Gas Station" or "Bixby Bridge Viewpoint".' },
                address: { type: 'string', description: 'A plausible city or address for the stop.' },
                reason: {
                  type: 'string',
                  description: 'The "why this stop?" explanation. Be specific, e.g., "Top-rated gas station just before a long stretch" or "Famous for its stunning coastal views and photo opportunities."'
                },
                durationMinutes: { type: 'integer', description: 'Estimated duration of the stop in minutes.' },
                latitude: { type: 'number', description: 'The latitude coordinate of the stop.' },
                longitude: { type: 'number', description: 'The longitude coordinate of the stop.' }
              },
              required: ['type', 'name', 'address', 'reason', 'durationMinutes', 'latitude', 'longitude']
            }
          },
          overviewPath: {
            type: 'array',
            description: 'An array of {lat, lng} objects representing the route polyline for drawing on a map. Should contain at least two points.',
            items: {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lng: { type: 'number' }
              },
              required: ['lat', 'lng']
            }
          }
        },
        required: ['summary', 'stops', 'overviewPath']
      }
    },
    required: ['tripTitle', 'routeComparison', 'enrichedRoute']
  };

  const apiKey = getGeminiApiKey();
  console.log('Calling Gemini API for itinerary generation with key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'undefined');

  const response = await fetch(`${GEMINI_API_URL_V1}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: contextPrompt
        }]
      }],
      systemInstruction: {
        parts: [{
          text: systemInstruction
        }]
      },
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: responseSchema
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error response:', response.status, errorText);
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data: any = await response.json();

  console.log('Gemini API response for itinerary:', JSON.stringify(data, null, 2));

  // Check for API errors in the response
  if (data.error) {
    console.error('Gemini API returned an error:', data.error);
    throw new Error(`Gemini API error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
    console.error('No valid response from Gemini API for itinerary generation');
    console.error('Full response:', JSON.stringify(data, null, 2));
    throw new Error('Failed to generate itinerary from Gemini API: No valid candidates in response');
  }

  const jsonText = data.candidates[0].content.parts[0].text.trim();
  let parsedJson: Itinerary;

  try {
    parsedJson = JSON.parse(jsonText);
  } catch (error) {
    console.error('Failed to parse JSON from Gemini response:', error);
    console.error('Response text:', jsonText);
    throw new Error('Failed to parse itinerary JSON from Gemini response');
  }

  // Basic validation to ensure the parsed object looks like our itinerary
  if (parsedJson.enrichedRoute && parsedJson.enrichedRoute.stops && parsedJson.enrichedRoute.overviewPath) {
    return parsedJson;
  } else {
    console.error('Generated JSON does not match the expected Itinerary structure:', parsedJson);
    throw new Error('Generated JSON does not match the expected Itinerary structure');
  }
}
