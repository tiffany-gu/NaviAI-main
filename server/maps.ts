import fetch from 'node-fetch';

// Get env variables at runtime instead of module load time
const getGoogleMapsKey = () => process.env.GOOGLE_MAPS_API_KEY!;

interface DirectionsResult {
  routes: any[];
  status: string;
  error_message?: string;
}

interface PlacesResult {
  results: any[];
  status: string;
}

interface PlaceDetailsResult {
  result: {
    place_id: string;
    name: string;
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
    opening_hours?: {
      open_now?: boolean;
      weekday_text?: string[];
      periods?: Array<{
        open: { day: number; time: string };
        close?: { day: number; time: string };
      }>;
    };
    reviews?: Array<{
      author_name: string;
      rating: number;
      text: string;
      time: number;
    }>;
    photos?: Array<{
      photo_reference: string;
      width: number;
      height: number;
    }>;
    types?: string[];
    price_level?: number;
    [key: string]: any;
  };
  status: string;
  error_message?: string;
}

interface GoogleMapsGeocodingResult {
  results: Array<{
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    formatted_address?: string;
    address_components?: any[];
  }>;
  status: string;
  error_message?: string;
}

export async function getDirections(
  origin: string,
  destination: string,
  preferences?: {
    scenic?: boolean;
    fast?: boolean;
    avoidTolls?: boolean;
  }
): Promise<any[]> {
  console.log('[getDirections] Starting with origin:', origin, 'destination:', destination);

  // Check if Google Maps API key exists
  const apiKey = getGoogleMapsKey();
  if (!apiKey) {
    console.error('[getDirections] GOOGLE_MAPS_API_KEY is not set in environment variables');
    throw new Error('Google Maps API key is not configured. Please set GOOGLE_MAPS_API_KEY in .env.local');
  }
  console.log('[getDirections] Google Maps API key exists:', apiKey.substring(0, 10) + '...');

  // Helper function to build and call Directions API
  const callDirectionsAPI = async (originParam: string, destParam: string): Promise<DirectionsResult> => {
    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
    url.searchParams.append('origin', originParam);
    url.searchParams.append('destination', destParam);
    url.searchParams.append('key', apiKey);
    url.searchParams.append('alternatives', preferences?.scenic ? 'true' : 'false');
    url.searchParams.append('mode', 'driving');
    
    if (preferences?.fast) {
      url.searchParams.append('departure_time', 'now');
      url.searchParams.append('traffic_model', 'best_guess');
    }
    
    const avoidOptions: string[] = [];
    if (preferences?.avoidTolls) {
      avoidOptions.push('tolls');
    }
    if (avoidOptions.length > 0) {
      url.searchParams.append('avoid', avoidOptions.join('|'));
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error ${response.status}: ${errorText}`);
    }

    return await response.json() as DirectionsResult;
  };

  // Try 1: Use addresses directly (fastest path)
  console.log('[getDirections] Attempting route with addresses directly...');
  try {
    const data = await callDirectionsAPI(origin, destination);
    
    if (data.status === 'OK' && data.routes && data.routes.length > 0) {
      console.log(`[getDirections] Successfully found ${data.routes.length} route(s) using addresses`);
      return data.routes;
    }
    
    // If we get here, the status wasn't OK, so we'll try geocoding
    console.log(`[getDirections] Direct address lookup failed with status: ${data.status}, trying geocoding...`);
  } catch (error) {
    console.log('[getDirections] Error with direct address lookup, trying geocoding:', error);
  }

  // Try 2: Geocode addresses first, then use coordinates
  console.log('[getDirections] Geocoding origin and destination...');
  let originCoords = await geocodeAddress(origin);
  let destCoords = await geocodeAddress(destination);

  // If geocoding failed, try using Places API Text Search as fallback for business names
  if (!originCoords) {
    console.log('[getDirections] Direct geocoding failed for origin, trying Places API text search...');
    originCoords = await searchPlaceByName(origin);
  }
  
  if (!destCoords) {
    console.log('[getDirections] Direct geocoding failed for destination, trying Places API text search...');
    destCoords = await searchPlaceByName(destination);
  }

  if (!originCoords || !destCoords) {
    const originStatus = originCoords ? 'found' : 'not found';
    const destStatus = destCoords ? 'found' : 'not found';
    
    console.error(`[getDirections] All geocoding methods failed - Origin: ${originStatus}, Destination: ${destStatus}`);
    
    // Build helpful error message with suggestions
    let errorMsg = `Could not find one or both locations:\n`;
    errorMsg += `- Origin: "${origin}" ${!originCoords ? '(not found)' : ''}\n`;
    errorMsg += `- Destination: "${destination}" ${!destCoords ? '(not found)' : ''}\n\n`;
    
    if (!originCoords) {
      errorMsg += `Tips for origin "${origin}":\n`;
      errorMsg += `  • Add city and state: "${origin}, Atlanta, GA"\n`;
      errorMsg += `  • Use full address if available\n`;
      errorMsg += `  • Try a more specific name or nearby landmark\n\n`;
    }
    
    if (!destCoords) {
      errorMsg += `Tips for destination "${destination}":\n`;
      errorMsg += `  • Add city and state: "${destination}, Oxford, GA"\n`;
      errorMsg += `  • Use full address if available\n`;
      errorMsg += `  • Try official name: "Emory University, Oxford College"\n\n`;
    }
    
    errorMsg += `Example: "from Rreal Tacos, Atlanta, GA to Emory Oxford College, Oxford, GA"`;
    
    throw new Error(errorMsg);
  }

  console.log('[getDirections] Geocoding successful:');
  console.log('[getDirections] Origin coordinates:', originCoords);
  console.log('[getDirections] Destination coordinates:', destCoords);

  // Use coordinates for Directions API (more reliable)
  const originCoordsStr = `${originCoords.lat},${originCoords.lng}`;
  const destCoordsStr = `${destCoords.lat},${destCoords.lng}`;

  console.log('[getDirections] Requesting route using coordinates...');
  const data = await callDirectionsAPI(originCoordsStr, destCoordsStr);
  
  console.log('[getDirections] Google Maps API response status:', data.status);

  if (data.status === 'OK' && data.routes && data.routes.length > 0) {
    console.log(`[getDirections] Successfully found ${data.routes.length} route(s) using coordinates`);
    return data.routes;
  } else if (data.status === 'ZERO_RESULTS') {
    throw new Error(`No route found between "${origin}" and "${destination}". The locations may be too far apart, inaccessible, or require ferry/air travel.`);
  } else if (data.status === 'NOT_FOUND') {
    throw new Error(`Could not find one or both locations:\n- Origin: "${origin}"\n- Destination: "${destination}"\n\nPlease try being more specific by including the city and state.`);
  } else if (data.status === 'INVALID_REQUEST') {
    throw new Error(`Invalid route request. Please check that both locations are valid:\n- Origin: "${origin}"\n- Destination: "${destination}"`);
  } else {
    const errorMsg = data.error_message || data.status;
    console.error('[getDirections] Google Maps Directions API error:', errorMsg);
    console.error('[getDirections] Origin:', origin);
    console.error('[getDirections] Destination:', destination);
    throw new Error(`Route planning failed: ${errorMsg}. Please try again with more specific location names.`);
  }
}

// Google Maps Directions API already returns data in the format we need,
// so no transformation is necessary. The response is already compatible.

// Helper function to geocode an address using Google Maps Geocoding API
// Returns coordinates and optionally the formatted address
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; formatted_address?: string } | null> {
  const apiKey = getGoogleMapsKey();
  if (!apiKey) {
    console.error('[geocodeAddress] Google Maps API key not available');
    return null;
  }

  console.log('[geocodeAddress] Geocoding address:', address);

  // Clean up the address - remove extra whitespace and normalize
  const cleanedAddress = address.trim().replace(/\s+/g, ' ');
  
  if (!cleanedAddress) {
    console.error('[geocodeAddress] Empty address provided');
    return null;
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.append('address', cleanedAddress);
    url.searchParams.append('key', apiKey);

    console.log('[geocodeAddress] Fetching from Google Maps Geocoding API...');
  const response = await fetch(url.toString());
    
    if (!response.ok) {
      console.error('[geocodeAddress] HTTP error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json() as GoogleMapsGeocodingResult;

    console.log('[geocodeAddress] Google Maps API response status:', data.status);
    console.log('[geocodeAddress] Found', data.results?.length || 0, 'results');

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      // Pick the first (most relevant) result
      const result = data.results[0];
      const location = result.geometry.location;
      
      console.log('[geocodeAddress] Best match:', result.formatted_address, 'at', location);
      
      // Validate coordinates
      if (Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180) {
        return { 
          lat: location.lat, 
          lng: location.lng,
          formatted_address: result.formatted_address 
        };
      } else {
        console.error('[geocodeAddress] Invalid coordinates:', location);
      }
    } else if (data.status === 'ZERO_RESULTS') {
      console.error('[geocodeAddress] No results found for address:', address);
      console.error('[geocodeAddress] Try adding city and state, e.g., "Rreal Tacos, Atlanta, GA"');
    } else if (data.status === 'REQUEST_DENIED') {
      console.error('[geocodeAddress] Google Maps Geocoding API not enabled. Please:');
      console.error('1. Go to https://console.cloud.google.com/apis/library');
      console.error('2. Search for "Geocoding API"');
      console.error('3. Click "Enable"');
      console.error('4. Make sure your API key has permission to use the Geocoding API');
      throw new Error('Google Maps Geocoding API is not enabled. Please enable it in Google Cloud Console.');
    } else {
      console.error('[geocodeAddress] Geocoding API error:', data.status, data.error_message);
  }

  return null;
  } catch (error) {
    console.error('[geocodeAddress] Error geocoding address:', address, error);
    return null;
  }
}

// Helper function to reverse geocode coordinates to an address using Google Maps Geocoding API
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const apiKey = getGoogleMapsKey();
  if (!apiKey) {
    console.error('[reverseGeocode] Google Maps API key not available');
    return null;
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.append('latlng', `${lat},${lng}`);
  url.searchParams.append('key', apiKey);

  try {
    const response = await fetch(url.toString());
    const data = await response.json() as GoogleMapsGeocodingResult;

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      return data.results[0].formatted_address || null;
    }

    if (data.status === 'REQUEST_DENIED') {
      console.error('[reverseGeocode] Google Maps Geocoding API not enabled. Please:');
      console.error('1. Go to https://console.cloud.google.com/apis/library');
      console.error('2. Search for "Geocoding API"');
      console.error('3. Click "Enable"');
      console.error('4. Make sure your API key has permission to use the Geocoding API');
    } else {
      console.error('[reverseGeocode] Reverse geocoding failed:', data.status, data.error_message);
    }
    return null;
  } catch (error) {
    console.error('[reverseGeocode] Error reverse geocoding:', error);
  return null;
  }
}

// Helper function to search for a place by name using Google Places API Text Search
// This is useful for business names and POIs that might not geocode well
async function searchPlaceByName(placeName: string): Promise<{ lat: number; lng: number; formatted_address?: string } | null> {
  const apiKey = getGoogleMapsKey();
  if (!apiKey) {
    return null;
  }

  console.log('[searchPlaceByName] Searching for place:', placeName);

  try {
    // Use Places API Text Search for better business/POI matching
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.append('query', placeName);
    url.searchParams.append('key', apiKey);

    console.log('[searchPlaceByName] Fetching from Google Places API Text Search...');
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      console.error('[searchPlaceByName] HTTP error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json() as {
      results?: Array<{
        geometry: {
          location: {
            lat: number;
            lng: number;
          };
        };
        formatted_address?: string;
        name?: string;
      }>;
      status: string;
      error_message?: string;
    };

    console.log('[searchPlaceByName] Places API response status:', data.status);
    console.log('[searchPlaceByName] Found', data.results?.length || 0, 'results');

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      const location = result.geometry.location;
      
      console.log('[searchPlaceByName] Best match:', result.name, 'at', result.formatted_address, 'coordinates:', location);
      
      if (Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180) {
        return {
          lat: location.lat,
          lng: location.lng,
          formatted_address: result.formatted_address
        };
      }
    } else if (data.status === 'ZERO_RESULTS') {
      console.error('[searchPlaceByName] No results found for place:', placeName);
    } else if (data.status === 'REQUEST_DENIED') {
      console.error('[searchPlaceByName] Places API not enabled or not authorized');
    } else {
      console.error('[searchPlaceByName] Places API error:', data.status, data.error_message);
    }

    return null;
  } catch (error) {
    console.error('[searchPlaceByName] Error searching for place:', placeName, error);
    return null;
  }
}

// Helper function to format duration in seconds to readable format
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} min${minutes > 1 ? 's' : ''}`;
  }
  return `${minutes} min${minutes > 1 ? 's' : ''}`;
}

/**
 * Get detailed information about a place using Places API Details
 * This includes reviews, photos, opening hours, and other verified attributes
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetailsResult['result'] | null> {
  const apiKey = getGoogleMapsKey();
  if (!apiKey) {
    console.error('[getPlaceDetails] Google Maps API key not available');
    return null;
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.append('place_id', placeId);
    url.searchParams.append('fields', 'place_id,name,geometry,formatted_address,vicinity,opening_hours,rating,price_level,user_ratings_total,website,photos,types');
    url.searchParams.append('key', apiKey);

    console.log('[getPlaceDetails] Fetching details for place:', placeId);
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      console.error('[getPlaceDetails] HTTP error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json() as PlaceDetailsResult;

    if (data.status === 'OK' && data.result) {
      console.log('[getPlaceDetails] Successfully retrieved details for:', data.result.name);
      return data.result;
    } else {
      console.error('[getPlaceDetails] Places API error:', data.status, data.error_message);
      return null;
    }
  } catch (error) {
    console.error('[getPlaceDetails] Error fetching place details:', error);
    return null;
  }
}

/**
 * Verify if a gas station is 24/7 and has clean facilities based on reviews
 */
export async function verifyGasStationQuality(place: any): Promise<{
  is24Hours: boolean;
  hasCleanFacilities: boolean;
  verifiedAttributes: string[];
}> {
  const verifiedAttributes: string[] = [];
  let is24Hours = false;
  let hasCleanFacilities = false;

  // Get place details to check opening hours and reviews
  if (place.place_id) {
    const details = await getPlaceDetails(place.place_id);
    
    if (details) {
      // Check if 24/7 operation
      if (details.opening_hours) {
        // Check if open 24 hours (all periods have no close time or close at same time as open)
        const periods = details.opening_hours.periods;
        if (periods && periods.length > 0) {
          // If all days are open 24 hours, or if open_now is true and weekday_text suggests 24/7
          const isAlwaysOpen = periods.every(period => !period.close || period.close.time === period.open.time);
          if (isAlwaysOpen) {
            is24Hours = true;
            verifiedAttributes.push('24/7 operation');
          } else if (details.opening_hours.open_now) {
            // Check weekday_text for "Open 24 hours" pattern
            const weekdayText = details.opening_hours.weekday_text || [];
            if (weekdayText.some((day: string) => day.toLowerCase().includes('24 hours') || day.toLowerCase().includes('open 24'))) {
              is24Hours = true;
              verifiedAttributes.push('24/7 operation');
            }
          }
        }
      }

      // Analyze reviews for clean facilities
      if (details.reviews && details.reviews.length > 0) {
        const reviewTexts = details.reviews.map((r: any) => r.text.toLowerCase()).join(' ');
        
        // Look for positive mentions of cleanliness
        const cleanIndicators = ['clean', 'spotless', 'well-maintained', 'tidy', 'pristine', 'hygienic'];
        const dirtyIndicators = ['dirty', 'filthy', 'messy', 'disgusting', 'unclean'];
        
        const cleanMentions = cleanIndicators.filter(word => reviewTexts.includes(word)).length;
        const dirtyMentions = dirtyIndicators.filter(word => reviewTexts.includes(word)).length;
        
        if (cleanMentions > dirtyMentions && cleanMentions >= 2) {
          hasCleanFacilities = true;
          verifiedAttributes.push('clean facilities (verified in reviews)');
        }

        // Check for positive mentions of restrooms
        if (reviewTexts.includes('restroom') || reviewTexts.includes('bathroom')) {
          const restroomPositive = ['clean restroom', 'nice bathroom', 'good facilities', 'well-kept restroom'].some(phrase => reviewTexts.includes(phrase));
          if (restroomPositive) {
            verifiedAttributes.push('clean restrooms');
            hasCleanFacilities = true;
          }
        }

        // Check for easy access mentions
        if (reviewTexts.includes('easy access') || reviewTexts.includes('convenient location') || reviewTexts.includes('right off highway')) {
          verifiedAttributes.push('easy access');
        }
      }
    }
  }

  return { is24Hours, hasCleanFacilities, verifiedAttributes };
}

/**
 * Verify restaurant attributes based on Google Maps data (reviews, photos, etc.)
 */
export async function verifyRestaurantAttributes(
  place: any,
  requirements?: {
    vegetarian?: boolean;
    kidFriendly?: boolean;
    parking?: boolean;
    cuisine?: string;
  }
): Promise<{
  matchesRequirements: boolean;
  verifiedAttributes: string[];
  confidenceScore: number;
}> {
  const verifiedAttributes: string[] = [];
  let confidenceScore = 0;
  let matchesRequirements = true;

  if (!place.place_id) {
    return { matchesRequirements: false, verifiedAttributes: [], confidenceScore: 0 };
  }

  const details = await getPlaceDetails(place.place_id);
  if (!details) {
    return { matchesRequirements: false, verifiedAttributes: [], confidenceScore: 0 };
  }

  const detailsTypes = (details.types || []).map((t: string) => t.toLowerCase());
  const placeTypes = Array.isArray(place.types)
    ? place.types.map((t: string) => t.toLowerCase())
    : [];
  const reviews = Array.isArray(details.reviews) ? details.reviews : [];
  const reviewTexts = reviews
    .map((r: any) => (r.text || '').toLowerCase())
    .join(' ');
  const positiveReviews = reviews.filter((r: any) => r.rating >= 4).length;
  const totalReviews = reviews.length;
  const positiveRatio = totalReviews > 0 ? positiveReviews / totalReviews : 0;

  if (typeof details.rating === 'number') {
    confidenceScore += Math.round(details.rating * 5); // 4.2★ -> +21
    if (details.rating >= 4.5) {
      verifiedAttributes.push(`highly rated (${details.rating}/5)`);
      confidenceScore += 10;
    }
  }

  if (typeof details.user_ratings_total === 'number') {
    if (details.user_ratings_total >= 1000) {
      confidenceScore += 10;
    } else if (details.user_ratings_total >= 500) {
      confidenceScore += 8;
    } else if (details.user_ratings_total >= 200) {
      confidenceScore += 6;
    } else if (details.user_ratings_total >= 50) {
      confidenceScore += 4;
    } else if (details.user_ratings_total >= 10) {
      confidenceScore += 2;
    }
  }

  if (totalReviews > 0) {
    if (positiveRatio >= 0.85) {
      confidenceScore += 8;
    } else if (positiveRatio >= 0.7) {
      confidenceScore += 4;
    }
  }

  if (requirements?.cuisine) {
    const normalizedCuisine = requirements.cuisine.trim().toLowerCase();
    const cuisineVariants = new Set<string>([
      normalizedCuisine,
      normalizedCuisine.replace(/\s+/g, '_'),
      normalizedCuisine.replace(/\s+/g, ' '),
      `${normalizedCuisine}_restaurant`,
      `${normalizedCuisine} restaurant`,
    ]);

    const candidateStrings = [
      ...detailsTypes,
      ...placeTypes,
      (details.name || '').toLowerCase(),
      (place.name || '').toLowerCase(),
      reviewTexts,
    ];

    const variantList = Array.from(cuisineVariants);
    const cuisineMatch = candidateStrings.some(entry =>
      variantList.some(variant => {
        const normalizedVariant = variant.toLowerCase();
        const variantWithSpaces = normalizedVariant.replace(/_/g, ' ');
        const variantWithUnderscores = normalizedVariant.replace(/\s+/g, '_');
        const normalizedEntry = entry.toLowerCase();
        return (
          normalizedEntry.includes(normalizedVariant) ||
          normalizedEntry.includes(variantWithSpaces) ||
          normalizedEntry.includes(variantWithUnderscores)
        );
      })
    );

    if (cuisineMatch) {
      const formattedCuisine =
        requirements.cuisine.charAt(0).toUpperCase() +
        requirements.cuisine.slice(1);
      verifiedAttributes.push(`${formattedCuisine} cuisine`);
      confidenceScore += 15;
    } else {
      matchesRequirements = false;
    }
  }

  if (requirements?.vegetarian) {
    const vegetarianIndicators = [
      'vegetarian',
      'vegan',
      'plant-based',
      'meatless',
      'vegetable options',
      'salad',
      'tofu',
      'veggie',
      'plant-based menu',
    ];
    const hasVegetarian = vegetarianIndicators.some(indicator =>
      reviewTexts.includes(indicator)
    );

    if (hasVegetarian) {
      verifiedAttributes.push('vegetarian options (verified in reviews)');
      confidenceScore += 30;
    } else if (totalReviews > 0) {
      matchesRequirements = false;
    }
  }

  if (requirements?.kidFriendly) {
    const kidFriendlyIndicators = [
      'kid-friendly',
      'children',
      'family',
      'high chair',
      'kids menu',
      'child-friendly',
      'family-friendly',
      'play area',
      'kids play',
    ];
    const hasKidFriendly = kidFriendlyIndicators.some(indicator =>
      reviewTexts.includes(indicator)
    );

    if (hasKidFriendly) {
      verifiedAttributes.push('kid-friendly (verified in reviews)');
      confidenceScore += 25;
    } else if (totalReviews > 0) {
      matchesRequirements = false;
    }
  }

  if (requirements?.parking) {
    const parkingIndicators = [
      'parking',
      'parking lot',
      'ample parking',
      'easy parking',
      'parking available',
      'plenty of parking',
      'free parking',
    ];
    const parkingNegative = [
      'no parking',
      'parking difficult',
      'limited parking',
    ];

    const hasParking = parkingIndicators.some(indicator =>
      reviewTexts.includes(indicator)
    );
    const hasParkingIssues = parkingNegative.some(indicator =>
      reviewTexts.includes(indicator)
    );

    if (hasParking && !hasParkingIssues) {
      verifiedAttributes.push('parking available (verified in reviews)');
      confidenceScore += 15;
    } else if (hasParkingIssues) {
      matchesRequirements = false;
    }
  }

  if (typeof details.price_level === 'number' && details.price_level > 0) {
    verifiedAttributes.push(`${'$'.repeat(details.price_level)} price range`);
  }

  return { matchesRequirements, verifiedAttributes, confidenceScore };
}

export async function findPlacesAlongRoute(
  polyline: string,
  type: 'gas_station' | 'restaurant' | 'tourist_attraction' | 'cafe' | 'meal_takeaway' | 'bakery',
  filters?: {
    rating?: number;
    priceLevel?: string;
    keyword?: string;
  }
): Promise<any[]> {
  const decodedPath = decodePolyline(polyline);
  
  const samplePoints = samplePolylinePoints(decodedPath, 5);
  
  const allPlaces: any[] = [];
  
  for (const point of samplePoints) {
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.append('location', `${point.lat},${point.lng}`);
    url.searchParams.append('radius', '5000');
    url.searchParams.append('type', type);
    if (filters?.keyword) {
      url.searchParams.append('keyword', filters.keyword);
    }
    url.searchParams.append('key', getGoogleMapsKey());

    const response = await fetch(url.toString());
    const data = await response.json() as PlacesResult;

    if (data.status === 'OK' && data.results) {
      allPlaces.push(...data.results);
    }
  }

  let filteredPlaces = allPlaces;
  
  if (type === 'restaurant') {
    // Enforce stronger filters for restaurants
    const minRating = Math.max(filters?.rating ?? 0, 4.3);
    filteredPlaces = filteredPlaces.filter(p => (p.rating ?? 0) >= minRating && (p.user_ratings_total ?? 0) >= 50);
  } else if (filters?.rating) {
    filteredPlaces = filteredPlaces.filter(p => (p.rating ?? 0) >= filters.rating!);
  }

  const uniquePlaces = Array.from(
    new Map(filteredPlaces.map(p => [p.place_id, p])).values()
  );

  // Cap results to reduce API spam downstream and keep UI snappy
  return uniquePlaces
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 10);
}

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  return points;
}

function samplePolylinePoints(
  points: Array<{ lat: number; lng: number }>,
  numSamples: number
): Array<{ lat: number; lng: number }> {
  if (points.length <= numSamples) return points;

  const step = Math.floor(points.length / numSamples);
  const sampled: Array<{ lat: number; lng: number }> = [];

  for (let i = 0; i < numSamples; i++) {
    sampled.push(points[i * step]);
  }

  return sampled;
}

export function calculateGasStops(
  route: any,
  fuelLevel: number,
  vehicleRange: number,
  minimumFuelThreshold: number = 0.2
): Array<{ distance: number; location: { lat: number; lng: number } }> {
  const legs = route.legs || [];
  const stops: Array<{ distance: number; location: { lat: number; lng: number } }> = [];

  let currentFuel = fuelLevel * vehicleRange;
  let totalDistanceCovered = 0;
  const minFuelRemaining = minimumFuelThreshold * vehicleRange;
  const safeRangePerTank = (1 - minimumFuelThreshold) * vehicleRange;

  for (const leg of legs) {
    const legDistanceMiles = (leg.distance?.value || 0) / 1609.34;
    let remainingLegDistance = legDistanceMiles;

    while (remainingLegDistance > 0) {
      const distanceToRefuel = currentFuel - minFuelRemaining;

      if (remainingLegDistance <= distanceToRefuel) {
        currentFuel -= remainingLegDistance;
        totalDistanceCovered += remainingLegDistance;
        remainingLegDistance = 0;
      } else {
        const stopDistance = totalDistanceCovered + distanceToRefuel;
        
        const progressRatio = distanceToRefuel / legDistanceMiles;
        const interpolatedLat = leg.start_location.lat + 
          (leg.end_location.lat - leg.start_location.lat) * progressRatio;
        const interpolatedLng = leg.start_location.lng + 
          (leg.end_location.lng - leg.start_location.lng) * progressRatio;

        stops.push({
          distance: stopDistance,
          location: { lat: interpolatedLat, lng: interpolatedLng },
        });

        currentFuel = vehicleRange;
        totalDistanceCovered = stopDistance;
        remainingLegDistance -= distanceToRefuel;
      }
    }
  }

  return stops;
}
