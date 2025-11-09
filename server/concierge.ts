import { getDirections, getPlaceDetails, reverseGeocode } from './maps';

// Get Google Maps API key (same function as in maps.ts)
function getGoogleMapsKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_MAPS_API_KEY is not set in environment variables');
  }
  return key;
}

interface RouteConciergeRequest {
  start: string;
  destination: string;
  categories: string[]; // e.g., ["Chinese restaurant", "Boba / bubble tea"]
  timeContext?: {
    timezone: string; // e.g., "America/New_York"
    timestamp: string; // e.g., "2025-11-08T15:29:00"
  };
  maxDetourMinutes?: number; // Default: 5
  maxOffRouteMiles?: number; // Default: 1.0
  minRating?: number; // Default: 4.2
  minReviews?: number; // Default: 50
}

interface StopResult {
  name: string;
  category: string;
  address: string;
  rating: number;
  review_count: number;
  price_level: string | null;
  open_now: boolean | null;
  hours_snippet: string;
  detour_minutes: number;
  off_route_miles: number;
  time_cost_summary: string;
  best_items: string[];
  dietary_notes: string[];
  parking_notes: string;
  contact: {
    phone: string | null;
    website: string | null;
  };
  add_to_route_url: string;
  why_this_stop: string;
}

interface RouteConciergeResponse {
  route: {
    start: string;
    destination: string;
    distance_miles: number;
    drive_time_minutes: number;
    map_url: string;
  };
  stops: StopResult[];
  note?: string;
}

interface CategoryProfile {
  match: (category: string) => boolean;
  primaryTypes: string[];
  fallbackTypes?: string[];
  keywords: string[];
  searchRadiusMeters?: number;
  textQueries?: string[];
}

const CATEGORY_PROFILES: CategoryProfile[] = [
  {
    match: (category) => category.toLowerCase().includes('chinese'),
    primaryTypes: ['chinese_restaurant'],
    fallbackTypes: ['restaurant'],
    keywords: [
      'chinese',
      'szechuan',
      'sichuan',
      'hunan',
      'cantonese',
      'dim sum',
      'dumpling',
      'noodle',
      'bao',
      'hot pot',
      'xiao long bao',
      'wok'
    ],
    searchRadiusMeters: 5000,
    textQueries: [
      'authentic chinese restaurant',
      'sichuan restaurant',
      'hand pulled noodle house',
      'dumpling house'
    ],
  },
  {
    match: (category) => {
      const lower = category.toLowerCase();
      return lower.includes('boba') || lower.includes('bubble tea') || lower.includes('milk tea');
    },
    primaryTypes: ['bubble_tea_shop'],
    fallbackTypes: ['cafe', 'tea_house'],
    keywords: [
      'boba',
      'bubble tea',
      'milk tea',
      'tapioca',
      'tea bar',
      'fresh boba',
      'taro latte',
      'tea spot',
      'tea shop'
    ],
    searchRadiusMeters: 4000,
    textQueries: [
      'bubble tea shop',
      'boba tea',
      'milk tea bar'
    ],
  },
];

function getCategoryProfile(category: string): CategoryProfile | undefined {
  return CATEGORY_PROFILES.find(profile => profile.match(category));
}

/**
 * Calculate distance from a point to a polyline (route)
 */
function distanceToPolyline(
  point: { lat: number; lng: number },
  polyline: Array<{ lat: number; lng: number }>
): number {
  let minDistance = Infinity;

  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i + 1];

    // Calculate distance from point to line segment
    const dx = p2.lng - p1.lng;
    const dy = p2.lat - p1.lat;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    if (segmentLength > 0) {
      const t = Math.max(0, Math.min(1,
        ((point.lng - p1.lng) * dx + (point.lat - p1.lat) * dy) / (segmentLength * segmentLength)
      ));

      const closestPoint = {
        lat: p1.lat + t * dy,
        lng: p1.lng + t * dx,
      };

      // Haversine distance calculation
      const R = 3959; // Earth radius in miles
      const dLat = (point.lat - closestPoint.lat) * Math.PI / 180;
      const dLon = (point.lng - closestPoint.lng) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(point.lat * Math.PI / 180) * Math.cos(closestPoint.lat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      minDistance = Math.min(minDistance, distance);
    }
  }

  return minDistance;
}

/**
 * Calculate detour time by comparing route with and without the stop
 */
async function calculateDetourTime(
  origin: string,
  destination: string,
  stopLocation: { lat: number; lng: number },
  originalRouteDuration: number
): Promise<number> {
  const apiKey = getGoogleMapsKey();
  if (!apiKey) return Infinity;

  try {
    // Get route with stop as waypoint
    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
    url.searchParams.append('origin', origin);
    url.searchParams.append('destination', destination);
    url.searchParams.append('waypoints', `${stopLocation.lat},${stopLocation.lng}`);
    url.searchParams.append('key', apiKey);
    url.searchParams.append('mode', 'driving');

    const response = await fetch(url.toString());
    const data = await response.json() as any;

    if (data.status === 'OK' && data.routes && data.routes.length > 0) {
      const newRoute = data.routes[0];
      const newDuration = newRoute.legs?.reduce((sum: number, leg: any) => sum + (leg.duration?.value || 0), 0) || 0;
      const detourSeconds = newDuration - originalRouteDuration;
      return Math.round(detourSeconds / 60); // Convert to minutes
    }
  } catch (error) {
    console.error('[calculateDetourTime] Error:', error);
  }

  return Infinity;
}

/**
 * Calculate position along route (0-1, where 0 is start, 1 is destination)
 */
function calculateProgressAlongRoute(
  stopLocation: { lat: number; lng: number },
  polyline: Array<{ lat: number; lng: number }>,
  routeDistance: number
): number {
  let minDistance = Infinity;
  let closestSegmentIndex = 0;
  let distanceAlongRoute = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i + 1];

    const dx = p2.lng - p1.lng;
    const dy = p2.lat - p1.lat;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    if (segmentLength > 0) {
      const t = Math.max(0, Math.min(1,
        ((stopLocation.lng - p1.lng) * dx + (stopLocation.lat - p1.lat) * dy) / (segmentLength * segmentLength)
      ));

      const closestPoint = {
        lat: p1.lat + t * dy,
        lng: p1.lng + t * dx,
      };

      // Calculate distance
      const R = 3959;
      const dLat = (stopLocation.lat - closestPoint.lat) * Math.PI / 180;
      const dLon = (stopLocation.lng - closestPoint.lng) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(stopLocation.lat * Math.PI / 180) * Math.cos(closestPoint.lat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      if (distance < minDistance) {
        minDistance = distance;
        closestSegmentIndex = i;

        // Calculate distance along route up to this point
        let dist = 0;
        for (let j = 0; j < i; j++) {
          const pj1 = polyline[j];
          const pj2 = polyline[j + 1];
          const dxj = pj2.lng - pj1.lng;
          const dyj = pj2.lat - pj1.lat;
          dist += Math.sqrt(dxj * dxj + dyj * dyj) * 69; // Rough conversion to miles
        }
        dist += segmentLength * t * 69;
        distanceAlongRoute = dist;
      }
    }
  }

  return routeDistance > 0 ? distanceAlongRoute / routeDistance : 0;
}

/**
 * Decode polyline to array of coordinates
 */
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

/**
 * Search for places by category along route
 */
async function searchPlacesByCategory(
  category: string,
  polyline: Array<{ lat: number; lng: number }>,
  samplePoints: Array<{ lat: number; lng: number }>
): Promise<any[]> {
  const apiKey = getGoogleMapsKey();
  if (!apiKey) return [];

  const allPlaces: any[] = [];
  const profile = getCategoryProfile(category);

  // Determine place type based on category
  const primaryTypes = profile?.primaryTypes?.length ? profile.primaryTypes : ['restaurant'];
  const fallbackTypes = profile?.fallbackTypes ?? [];
  const keyword = profile ? profile.keywords.join(' ') : category.toLowerCase();
  const searchRadius = profile?.searchRadiusMeters ?? 5000;

  // Search at multiple points along the route
  for (const point of samplePoints) {
    const typeCandidates = [...primaryTypes, ...fallbackTypes];

    for (const type of typeCandidates) {
      const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
      url.searchParams.append('location', `${point.lat},${point.lng}`);
      url.searchParams.append('radius', `${searchRadius}`);
      url.searchParams.append('type', type);
      url.searchParams.append('keyword', keyword);
      url.searchParams.append('key', apiKey);

      try {
        const response = await fetch(url.toString());
        const data = await response.json() as any;

        if (data.status === 'OK' && data.results) {
          allPlaces.push(...data.results);
        }
      } catch (error) {
        console.error('[searchPlacesByCategory] Error:', error);
      }
    }
  }

  // Deduplicate by place_id
  const uniquePlaces = Array.from(
    new Map(allPlaces.map(p => [p.place_id, p])).values()
  );

  // Quick name/type filter before returning
  if (!profile) {
    return uniquePlaces;
  }

  const filtered = uniquePlaces.filter(place => {
    const lowerName = (place.name || '').toLowerCase();
    const lowerTypes = (place.types || []).map((t: string) => t.toLowerCase());

    const typeMatch = profile.primaryTypes.some(type => lowerTypes.includes(type)) ||
      (profile.fallbackTypes || []).some(type => lowerTypes.includes(type));

    const keywordMatch = profile.keywords.some(keyword => lowerName.includes(keyword));

    return typeMatch || keywordMatch;
  });

  return filtered.length > 0 ? filtered : uniquePlaces;
}

/**
 * Generate Google Maps URL with waypoints
 */
function generateGoogleMapsURL(
  origin: string,
  destination: string,
  waypoints?: Array<{ lat: number; lng: number } | string>
): string {
  const baseUrl = 'https://www.google.com/maps/dir/?api=1';
  const encodedOrigin = encodeURIComponent(origin);
  const encodedDestination = encodeURIComponent(destination);

  if (!waypoints || waypoints.length === 0) {
    return `${baseUrl}&origin=${encodedOrigin}&destination=${encodedDestination}&travelmode=driving`;
  }

  const waypointStr = waypoints.map(wp => {
    if (typeof wp === 'string') {
      return encodeURIComponent(wp);
    } else {
      return `${wp.lat},${wp.lng}`;
    }
  }).join('|');

  return `${baseUrl}&origin=${encodedOrigin}&waypoints=${waypointStr}&destination=${encodedDestination}&travelmode=driving`;
}

/**
 * Extract menu items and dietary info from reviews
 */
function extractMenuInfo(details: any, category: string): {
  bestItems: string[];
  dietaryNotes: string[];
  parkingNotes: string[];
} {
  const bestItems: string[] = [];
  const dietaryNotes: string[] = [];
  const parkingNotes: string[] = [];

  if (details.reviews && details.reviews.length > 0) {
    const reviewTexts = details.reviews.map((r: any) => r.text.toLowerCase()).join(' ');
    const allReviewTexts = details.reviews.map((r: any) => r.text).join(' '); // Keep original case for extraction

    // Extract menu items based on category
    if (category.toLowerCase().includes('chinese')) {
      // Chinese restaurant menu items
      const chineseMenuPatterns = [
        { pattern: /hand[- ]pulled noodles/gi, name: 'hand-pulled noodles' },
        { pattern: /xiao long bao|soup dumplings/gi, name: 'xiao long bao' },
        { pattern: /cumin lamb/gi, name: 'cumin lamb' },
        { pattern: /sichuan|szechuan/gi, name: 'Sichuan dishes' },
        { pattern: /kung pao/gi, name: 'kung pao chicken' },
        { pattern: /general tso|general tsao/gi, name: 'general tso chicken' },
        { pattern: /mapo tofu/gi, name: 'mapo tofu' },
        { pattern: /peking duck/gi, name: 'peking duck' },
        { pattern: /hot pot/gi, name: 'hot pot' },
        { pattern: /chili oil/gi, name: 'house chili oil' },
        { pattern: /dan dan noodles/gi, name: 'dan dan noodles' },
        { pattern: /char siu/gi, name: 'char siu' },
      ];

      for (const { pattern, name } of chineseMenuPatterns) {
        if (pattern.test(allReviewTexts) && !bestItems.includes(name)) {
          bestItems.push(name);
        }
      }
    } else if (category.toLowerCase().includes('boba') || category.toLowerCase().includes('bubble tea')) {
      // Boba/bubble tea items
      const bobaMenuPatterns = [
        { pattern: /taro/gi, name: 'taro milk tea' },
        { pattern: /fresh boba|freshly made boba/gi, name: 'fresh boba' },
        { pattern: /brown sugar/gi, name: 'brown sugar boba' },
        { pattern: /matcha/gi, name: 'matcha boba' },
        { pattern: /thai tea/gi, name: 'Thai tea' },
        { pattern: /jasmine/gi, name: 'jasmine milk tea' },
      ];

      for (const { pattern, name } of bobaMenuPatterns) {
        if (pattern.test(allReviewTexts) && !bestItems.includes(name)) {
          bestItems.push(name);
        }
      }

      // Check for fresh/quality indicators
      if (reviewTexts.includes('fresh') && (reviewTexts.includes('tea') || reviewTexts.includes('boba'))) {
        if (!bestItems.some(item => item.includes('fresh'))) {
          bestItems.unshift('fresh tea');
        }
      }
    }

    // Extract dietary info
    if (reviewTexts.includes('vegan') || reviewTexts.includes('plant-based')) {
      dietaryNotes.push('vegan options');
    }
    if (reviewTexts.includes('vegetarian') && !reviewTexts.includes('not vegetarian')) {
      dietaryNotes.push('vegetarian options');
    }
    if (reviewTexts.includes('gluten-free') || reviewTexts.includes('gluten free')) {
      dietaryNotes.push('gluten-free options');
    }

    // Extract parking info with more specificity
    const parkingMatches = [
      { pattern: /(?:free|complimentary) parking/gi, note: 'free parking available' },
      { pattern: /parking lot|lot parking/gi, note: 'parking lot available' },
      { pattern: /street parking/gi, note: 'street parking available' },
      { pattern: /garage parking|parking garage/gi, note: 'garage parking available' },
      { pattern: /ample parking|plenty of parking/gi, note: 'ample parking available' },
      { pattern: /easy parking/gi, note: 'easy parking available' },
    ];

    for (const { pattern, note } of parkingMatches) {
      if (pattern.test(allReviewTexts) && !parkingNotes.includes(note)) {
        parkingNotes.push(note);
      }
    }
  }

  // Dedupe and normalize (case-insensitive), preserve first-seen casing
  const uniq = (arr: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of arr) {
      const t = (raw || '').trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(t);
      }
    }
    return out;
  };

  return {
    bestItems: uniq(bestItems).slice(0, 3), // Limit to top 3 items
    dietaryNotes: uniq(dietaryNotes), // Remove duplicates
    parkingNotes: uniq(parkingNotes), // Remove duplicates
  };
}

/**
 * Generate "why this stop" rationale following strict format requirements
 */
function generateWhyThisStop(
  stop: any,
  category: string,
  detourMinutes: number,
  offRouteMiles: number,
  maxDetourMinutes: number,
  bestItems: string[],
  parkingNotes: string[]
): string {
  const rating = stop.rating || 0;
  const reviews = stop.review_count || stop.user_ratings_total || 0;
  
  // Format detour text
  const detourText = detourMinutes <= 1 
    ? 'minimal detour' 
    : detourMinutes <= maxDetourMinutes 
      ? `+${detourMinutes} min detour`
      : `+${detourMinutes} min detour (slightly over limit but best quality option)`;

  // Format distance text
  const distanceText = offRouteMiles < 0.3 
    ? 'directly on route' 
    : `${offRouteMiles.toFixed(1)} mi off route`;

  // Start with category match and detour/time cost (REQUIRED)
  let rationale = `Matches your ${category} request with a ${detourText} (${distanceText}). `;
  
  // Add quality signal: rating + reviews (REQUIRED)
  rationale += `Rated ${rating.toFixed(1)}★ with ${reviews.toLocaleString()} reviews. `;

  // Add concrete menu/experience detail (REQUIRED)
  if (bestItems.length > 0) {
    const items = bestItems.slice(0, 2);
    if (items.length === 2) {
      rationale += `Known for ${items[0]} and ${items[1]}. `;
    } else {
      rationale += `Known for ${items[0]}. `;
    }
  } else {
    // Fallback if no specific items found
    rationale += `Well-reviewed option for ${category.toLowerCase()}. `;
  }

  // Add parking note if available
  if (parkingNotes.length > 0) {
    rationale += parkingNotes[0] + '.';
  }

  // Handle closed or borderline cases
  if (stop.open_now === false) {
    rationale += ` (Currently closed, but worth the detour for quality.)`;
  }

  return rationale.trim();
}

/**
 * Determine if a place truly matches the requested category
 */
function categoryMatchesPlace(
  category: string,
  profile: CategoryProfile | undefined,
  place: any,
  details: any
): boolean {
  if (!profile) {
    return true;
  }

  const lowerName = (place.name || '').toLowerCase();
  const lowerDetailsName = (details?.name || '').toLowerCase();
  const lowerAddress = (details?.formatted_address || '').toLowerCase();
  const types = new Set<string>([
    ...((place.types || []).map((t: string) => t.toLowerCase())),
    ...((details?.types || []).map((t: string) => t.toLowerCase())),
  ]);

  const typeMatch = profile.primaryTypes.some(type => types.has(type));
  const fallbackTypeMatch = (profile.fallbackTypes || []).some(type => types.has(type));
  const nameMatch = profile.keywords.some(keyword =>
    lowerName.includes(keyword) ||
    lowerDetailsName.includes(keyword)
  );
  const addressMatch = profile.keywords.some(keyword => lowerAddress.includes(keyword));

  let reviewMatch = false;
  if (details?.reviews && details.reviews.length > 0) {
    const reviewsText = details.reviews
      .map((r: any) => (r.text || '').toLowerCase())
      .join(' ');
    reviewMatch = profile.keywords.some(keyword => reviewsText.includes(keyword));
  }

  return typeMatch || fallbackTypeMatch || nameMatch || addressMatch || reviewMatch;
}

/**
 * Main route concierge function
 */
export async function findRouteConciergeStops(
  request: RouteConciergeRequest
): Promise<RouteConciergeResponse> {
  const {
    start,
    destination,
    categories,
    timeContext,
    maxDetourMinutes = 5,
    maxOffRouteMiles = 1.0,
    minRating = 4.2,
    minReviews = 50,
  } = request;

  console.log('[route-concierge] Finding stops for:', { start, destination, categories });

  // Step 1: Get route
  const routeResponse = await getDirections(start, destination, {});
  if (!routeResponse || routeResponse.length === 0) {
    throw new Error('Could not find route');
  }

  const route = routeResponse[0];
  const polyline = route.overview_polyline?.points;
  if (!polyline) {
    throw new Error('Route polyline not found');
  }

  const decodedPolyline = decodePolyline(polyline);
  const routeDistance = route.legs?.reduce((sum: number, leg: any) => sum + (leg.distance?.value || 0), 0) || 0;
  const routeDistanceMiles = routeDistance / 1609.34;
  const routeDuration = route.legs?.reduce((sum: number, leg: any) => sum + (leg.duration?.value || 0), 0) || 0;
  const routeDurationMinutes = Math.round(routeDuration / 60);

  // Generate base route URL
  const baseRouteURL = generateGoogleMapsURL(start, destination);

  // Step 2: Sample points along route (focus on 25-75% progress)
  const samplePoints: Array<{ lat: number; lng: number }> = [];
  const totalPoints = decodedPolyline.length;
  const startIdx = Math.floor(totalPoints * 0.25);
  const endIdx = Math.floor(totalPoints * 0.75);
  const step = Math.max(1, Math.floor((endIdx - startIdx) / 5));

  for (let i = startIdx; i < endIdx; i += step) {
    samplePoints.push(decodedPolyline[i]);
  }

  // Also include points near start and end
  if (startIdx > 0) samplePoints.unshift(decodedPolyline[0]);
  if (endIdx < totalPoints - 1) samplePoints.push(decodedPolyline[totalPoints - 1]);

  // Step 3: Search for places in each category
  const allStops: StopResult[] = [];
  let relaxedConstraints = false;

  for (const category of categories) {
    console.log(`[route-concierge] Searching for ${category}...`);

    const categoryProfile = getCategoryProfile(category);
    const candidates = await searchPlacesByCategory(category, decodedPolyline, samplePoints);

    // Filter and rank candidates
    const validCandidates: Array<{
      place: any;
      details: any;
      offRouteMiles: number;
      progress: number;
      detourMinutes: number;
      score: number;
    }> = [];

    for (const place of candidates) {
      // Basic quality filter
      const rating = place.rating || 0;
      const reviews = place.user_ratings_total || 0;

      if (rating < minRating || reviews < minReviews) {
        continue;
      }

      // Get place details
      const details = await getPlaceDetails(place.place_id);
      if (!details) continue;

       // Ensure the place truly matches the requested category
      if (!categoryMatchesPlace(category, categoryProfile, place, details)) {
        continue;
      }

      // Calculate distance off route
      const offRouteMiles = distanceToPolyline(
        place.geometry.location,
        decodedPolyline
      );

      // Calculate progress along route
      const progress = calculateProgressAlongRoute(
        place.geometry.location,
        decodedPolyline,
        routeDistanceMiles
      );

      // Calculate detour time (this is expensive, so we'll estimate first)
      // Estimate detour time based on distance: assume 30 mph average speed
      const estimatedDetourMinutes = Math.round((offRouteMiles / 30) * 60 * 2); // Round trip

      // Quick filter: skip if estimated detour is way too high
      if (estimatedDetourMinutes > maxDetourMinutes * 2 && offRouteMiles > maxOffRouteMiles * 2) {
        continue;
      }

      // Calculate actual detour time (only for promising candidates)
      const detourMinutes = estimatedDetourMinutes <= maxDetourMinutes * 1.5 
        ? await calculateDetourTime(start, destination, place.geometry.location, routeDuration)
        : estimatedDetourMinutes;

      // Apply strict constraints (either detour OR distance must be within limit)
      const meetsDetourConstraint = detourMinutes <= maxDetourMinutes;
      const meetsDistanceConstraint = offRouteMiles <= maxOffRouteMiles;

      // Must meet at least one constraint (whichever is stricter)
      if (!meetsDetourConstraint && !meetsDistanceConstraint) {
        continue; // Skip if both constraints fail
      }

      // Calculate score (prefer: high rating, many reviews, low detour, good progress position)
      let score = rating * 20;
      score += Math.log10(reviews + 1) * 10;
      score -= detourMinutes * 2;
      score -= offRouteMiles * 5;
      if (categoryProfile) {
        score += 15; // reward strong category alignment
      }
      // Prefer stops at 25-75% progress
      if (progress >= 0.25 && progress <= 0.75) {
        score += 10;
      }

      validCandidates.push({
        place,
        details,
        offRouteMiles,
        progress,
        detourMinutes,
        score,
      });
    }

    // Sort by score and take top 3
    validCandidates.sort((a, b) => b.score - a.score);
    const topCandidates = validCandidates.slice(0, 3);

    // If no candidates meet strict constraints, relax and take best available
    if (topCandidates.length === 0 && validCandidates.length > 0) {
      relaxedConstraints = true;
      const relaxed = validCandidates
        .filter(c => c.detourMinutes <= maxDetourMinutes * 1.5 && c.offRouteMiles <= maxOffRouteMiles * 1.5)
        .slice(0, 3);
      topCandidates.push(...relaxed);
    }

    // Convert to StopResult format
    for (const candidate of topCandidates) {
      const { place, details, offRouteMiles, detourMinutes } = candidate;

      // Extract menu info
      const { bestItems, dietaryNotes, parkingNotes } = extractMenuInfo(details, category);

      // Get hours
      const hours = details.opening_hours;
      let openNow: boolean | null = null;
      let hoursSnippet = 'Hours vary';

      if (hours) {
        openNow = hours.open_now !== undefined ? hours.open_now : null;

        if (hours.weekday_text && hours.weekday_text.length > 0) {
          let dayIndex: number;
          if (timeContext?.timestamp) {
            try {
              const userDate = new Date(timeContext.timestamp);
              dayIndex = isNaN(userDate.getTime()) ? new Date().getDay() : userDate.getDay();
            } catch {
              dayIndex = new Date().getDay();
            }
          } else {
            dayIndex = new Date().getDay();
          }

          const googleDayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
          const rawHours =
            hours.weekday_text[googleDayIndex] ||
            hours.weekday_text[dayIndex] ||
            hours.weekday_text[0];

          if (rawHours) {
            const splitIndex = rawHours.indexOf(':');
            if (splitIndex > -1) {
              const dayLabel = rawHours.substring(0, splitIndex).trim();
              const hoursText = rawHours.substring(splitIndex + 1).trim();
              hoursSnippet = `${dayLabel === '' ? 'Today' : dayLabel}: ${hoursText}`;
            } else {
              hoursSnippet = rawHours;
            }
          }
        } else if (hours.periods && hours.periods.length > 0) {
          hoursSnippet = 'See Google Maps for detailed hours';
        }
      }

      // Generate "why this stop"
      const whyThisStop = generateWhyThisStop(
        { ...place, ...details, open_now: openNow },
        category,
        detourMinutes,
        offRouteMiles,
        maxDetourMinutes,
        bestItems,
        parkingNotes
      );

      // Generate add-to-route URL
      const addToRouteURL = generateGoogleMapsURL(start, destination, [place.geometry.location]);

      const stop: StopResult = {
        name: place.name,
        category,
        address: details.formatted_address || place.vicinity || place.formatted_address || '',
        rating: parseFloat((place.rating || 0).toFixed(1)),
        review_count: place.user_ratings_total || details.user_ratings_total || 0,
        price_level: details.price_level ? '$'.repeat(details.price_level) : null,
        open_now: openNow,
        hours_snippet: hoursSnippet,
        detour_minutes: Math.round(detourMinutes),
        off_route_miles: parseFloat(offRouteMiles.toFixed(2)),
        time_cost_summary: `adds ~${Math.round(detourMinutes)} min / ${offRouteMiles.toFixed(1)} mi`,
        best_items: bestItems.length > 0 ? bestItems : ['well-reviewed options'],
        dietary_notes: dietaryNotes.length > 0 ? dietaryNotes : [],
        parking_notes: parkingNotes.length > 0 ? parkingNotes.join(', ') : 'Parking information not available',
        contact: {
          phone: details.formatted_phone_number || null,
          website: details.website || null,
        },
        add_to_route_url: addToRouteURL,
        why_this_stop: whyThisStop,
      };

      allStops.push(stop);
    }
  }

  // Get formatted addresses for start and destination
  let formattedStart = start;
  let formattedDestination = destination;

  try {
    // Try to get better formatted addresses (reverseGeocode returns string | null)
    const startGeocode = await reverseGeocode(route.legs[0].start_location.lat, route.legs[0].start_location.lng);
    if (startGeocode) {
      formattedStart = startGeocode;
    }

    const lastLeg = route.legs[route.legs.length - 1];
    const destGeocode = await reverseGeocode(lastLeg.end_location.lat, lastLeg.end_location.lng);
    if (destGeocode) {
      formattedDestination = destGeocode;
    }
  } catch (error) {
    console.warn('[route-concierge] Could not geocode addresses, using originals');
  }

  // Format response
  const response: RouteConciergeResponse = {
    route: {
      start: formattedStart,
      destination: formattedDestination,
      distance_miles: parseFloat(routeDistanceMiles.toFixed(1)),
      drive_time_minutes: routeDurationMinutes,
      map_url: baseRouteURL,
    },
    stops: allStops,
  };

  if (relaxedConstraints) {
    response.note = `Relaxed detour constraints slightly due to sparse options near the route.`;
  }

  return response;
}

