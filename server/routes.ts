import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { parseUserRequest, generateConversationalResponse, generateStopReason, generateItineraryWithStops } from "./gpt";
import { getDirections, findPlacesAlongRoute, calculateGasStops, reverseGeocode, verifyGasStationQuality, verifyRestaurantAttributes, getPlaceDetails } from "./maps";
import { findRouteConciergeStops } from "./concierge";
import { insertTripRequestSchema, insertConversationMessageSchema } from "@shared/schema";
import { calculateArrivalDeadline, calculateTimeAllocations, formatDuration } from "./timeUtils";
import OpenAI, { AzureOpenAI } from "openai";

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const { message, tripRequestId, userLocation } = req.body;

      let conversationHistory: string[] = [];
      if (tripRequestId) {
        const messages = await storage.getMessagesByTripId(tripRequestId);
        conversationHistory = messages.map(m => `${m.role}: ${m.content}`);
      }

      const tripParameters = await parseUserRequest(message, conversationHistory);

      console.log('[chat] Extracted trip parameters:', JSON.stringify(tripParameters, null, 2));

      // Validate extracted locations - they should not contain common phrases
      // Allow "the", "a", "an" as they can be part of proper nouns
      const invalidPatterns = /^(plan|route|trip|go|travel|want|need|from\s|to\s)/i;
      const invalidWords = /^(plan|route|trip|go|travel|want|need|from|to)$/i;

      if (tripParameters.origin && invalidPatterns.test(tripParameters.origin)) {
        console.warn('[chat] Invalid origin detected, cleaning:', tripParameters.origin);

        // Careful cleaning - preserve proper nouns
        let cleaned = tripParameters.origin;
        cleaned = cleaned.replace(/^.*?(plan\s+(a\s+)?route\s+from\s+|from\s+)/i, '');
        cleaned = cleaned.replace(/\s+to\s+.*$/i, '');
        // Only remove standalone command words
        if (/^(plan|route|trip|go|travel|want|need)\s+/i.test(cleaned)) {
          cleaned = cleaned.replace(/^(plan|route|trip|go|travel|want|need)\s+/i, '');
        }
        cleaned = cleaned.trim();

        tripParameters.origin = cleaned;
        console.log('[chat] Cleaned origin:', tripParameters.origin);

        // If still invalid, set to undefined
        if (cleaned.length < 2 || invalidWords.test(cleaned)) {
          console.warn('[chat] Origin still invalid after cleaning, setting to undefined');
          tripParameters.origin = undefined;
        }
      }

      if (tripParameters.destination) {
        if (invalidPatterns.test(tripParameters.destination) || tripParameters.destination.length < 3) {
          console.warn('[chat] Invalid destination detected:', tripParameters.destination);

          // Try to re-extract from the message
          const toIndex = message.toLowerCase().indexOf(' to ');
          if (toIndex !== -1) {
            let extracted = message.substring(toIndex + 4).trim();
            extracted = extracted.replace(/[.!?,;].*$/i, '').trim();
            extracted = extracted.replace(/^(plan|route|trip|go|travel|want|need|the|a)\s+/i, '');

            if (extracted.length >= 3 && !invalidWords.test(extracted)) {
              tripParameters.destination = extracted;
              console.log('[chat] Re-extracted destination from message:', tripParameters.destination);
            } else {
              console.warn('[chat] Could not extract valid destination, setting to undefined');
              tripParameters.destination = undefined;
            }
          }
        }
      }

      // If action is "useCurrentLocation", reverse geocode the user's coordinates
      if (tripParameters.action === 'useCurrentLocation' && userLocation) {
        const { lat, lng } = userLocation;
        const origin = await reverseGeocode(lat, lng);
        if (origin) {
          tripParameters.origin = origin;
          console.log('[chat] Reverse geocoded origin from current location (explicit action):', origin);
        }
        delete tripParameters.action;
      } else if (!tripParameters.origin && userLocation) {
        // No origin provided - automatically use current location as starting point
        const { lat, lng } = userLocation;
        const origin = await reverseGeocode(lat, lng);
        if (origin) {
          tripParameters.origin = origin;
          console.log('[chat] Auto-filled origin from current location (no starting position specified):', origin);
        } else {
          console.warn('[chat] Could not reverse geocode current location, using coordinates directly');
          // Use coordinates directly if reverse geocoding fails
          tripParameters.origin = `${lat},${lng}`;
        }
      }

      // Final validation: check if origin and destination are valid
      const hasMissingInfo = !tripParameters.origin || !tripParameters.destination ||
                             tripParameters.origin.length < 2 || tripParameters.destination.length < 2 ||
                             invalidPatterns.test(tripParameters.origin) || invalidPatterns.test(tripParameters.destination);
      
      console.log('[chat] Has missing info:', hasMissingInfo);
      if (hasMissingInfo) {
        console.log('[chat] Origin:', tripParameters.origin, 'Destination:', tripParameters.destination);
      }

      const aiResponse = await generateConversationalResponse(
        message,
        tripParameters,
        hasMissingInfo
      );

      let currentTripId = tripRequestId;
      if (!hasMissingInfo && !tripRequestId) {
        const tripRequest = await storage.createTripRequest({
          origin: tripParameters.origin!,
          destination: tripParameters.destination!,
          fuelLevel: tripParameters.fuelLevel,
          vehicleRange: tripParameters.vehicleRange,
          preferences: tripParameters.preferences,
        });
        currentTripId = tripRequest.id;
      } else if (!hasMissingInfo && tripRequestId) {
        await storage.updateTripRequest(tripRequestId, {
          fuelLevel: tripParameters.fuelLevel ?? undefined,
          vehicleRange: tripParameters.vehicleRange ?? undefined,
          preferences: tripParameters.preferences ?? undefined,
        });
      }

      if (currentTripId) {
        await storage.createMessage({
          tripRequestId: currentTripId,
          role: 'user',
          content: message,
          timestamp: new Date().toISOString(),
        });

        await storage.createMessage({
          tripRequestId: currentTripId,
          role: 'assistant',
          content: aiResponse,
          timestamp: new Date().toISOString(),
        });
      }

      // Check if user requested stops
      const hasRequestedStops = tripParameters.preferences?.requestedStops &&
        Object.values(tripParameters.preferences.requestedStops).some(v => v === true);

      res.json({
        response: aiResponse,
        tripRequestId: currentTripId,
        tripParameters,
        hasMissingInfo,
        requestedStops: hasRequestedStops,
      });
    } catch (error: any) {
      console.error('Chat error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/plan-route", async (req: Request, res: Response) => {
    let tripRequest: any = null;
    try {
      const { tripRequestId } = req.body;

      tripRequest = await storage.getTripRequest(tripRequestId);
      if (!tripRequest) {
        return res.status(404).json({ error: 'Trip request not found' });
      }

      if (!tripRequest.origin || !tripRequest.destination) {
        return res.status(400).json({ 
          error: 'Origin and destination are required. Please provide both locations.' 
        });
      }

      console.log('[plan-route] Planning route from', tripRequest.origin, 'to', tripRequest.destination);

      const routes = await getDirections(
        tripRequest.origin,
        tripRequest.destination,
        tripRequest.preferences || undefined
      );

      if (!routes || routes.length === 0) {
        return res.status(404).json({ 
          error: `No route found between "${tripRequest.origin}" and "${tripRequest.destination}". Please check the locations and try again.` 
        });
      }

      const selectedRoute = tripRequest.preferences?.scenic 
        ? routes[routes.length > 1 ? 1 : 0]
        : routes[0];

      await storage.updateTripRequest(tripRequestId, {
        route: selectedRoute,
      });

      console.log('[plan-route] Successfully planned route, distance:', selectedRoute.legs[0]?.distance?.text);

      res.json({
        routes,
        selectedRoute,
      });
    } catch (error: any) {
      console.error('[plan-route] Route planning error:', error);
      
      // Provide more user-friendly error messages
      let errorMessage = error.message || 'Failed to plan route';
      
      if (errorMessage.includes('geocode')) {
        const origin = tripRequest?.origin || 'origin';
        const destination = tripRequest?.destination || 'destination';
        errorMessage = `Could not find the location. Please check that "${origin}" and "${destination}" are valid addresses.`;
      } else if (errorMessage.includes('No route found')) {
        const origin = tripRequest?.origin || 'origin';
        const destination = tripRequest?.destination || 'destination';
        errorMessage = `No route found between "${origin}" and "${destination}". The locations may be too far apart or inaccessible by road.`;
      }
      
      res.status(500).json({ error: errorMessage });
    }
  });

  // Test endpoint for direct routing (bypasses storage)
  app.post("/api/test-route", async (req: Request, res: Response) => {
    try {
      const { origin, destination, preferences } = req.body;

      if (!origin || !destination) {
        return res.status(400).json({ error: 'Origin and destination required' });
      }

      const routes = await getDirections(origin, destination, preferences);

      res.json({
        routes,
        success: true,
      });
    } catch (error: any) {
      console.error('Test route error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/find-stops", async (req: Request, res: Response) => {
    try {
      const { tripRequestId } = req.body;

      const tripRequest = await storage.getTripRequest(tripRequestId);
      if (!tripRequest || !tripRequest.route) {
        return res.status(404).json({ error: 'Trip request or route not found' });
      }

      // Google Maps Directions API returns routes with overview_polyline.points
      const polyline = tripRequest.route.overview_polyline?.points;
      if (!polyline) {
        console.error('[find-stops] No polyline found in route:', JSON.stringify(tripRequest.route, null, 2));
        return res.status(400).json({ error: 'Route polyline not found' });
      }
      
      console.log('[find-stops] Using polyline for trip:', tripRequestId, 'Polyline length:', polyline?.length || 0);

      const stops: any[] = [];
      const routeDistance = tripRequest.route.legs?.[0]?.distance?.value || 0;
      const routeDistanceMiles = routeDistance / 1609.34; // Convert meters to miles

      // GROUNDED APPROACH: Use real Google Maps Places API data with intelligent filtering
      console.log(`[find-stops] Finding grounded stops for ${routeDistanceMiles.toFixed(0)}-mile route`);

      // Step 1: Determine which stops to find based on user request AND intelligent defaults
      const requestedStops = tripRequest.preferences?.requestedStops;
      const userWantsGas = requestedStops?.gas === true;
      const userWantsRestaurant = requestedStops?.restaurant === true;
      const userWantsScenic = requestedStops?.scenic === true;

      // Calculate route duration for intelligent defaults
      const routeDuration = tripRequest.route.legs?.[0]?.duration?.value || 0;
      const routeDurationHours = routeDuration / 3600;

      // INTELLIGENT DEFAULTS: Suggest stops based on route characteristics
      // 1. Restaurant stops for routes > 3 hours (meal break makes sense)
      const shouldSuggestRestaurant = userWantsRestaurant || routeDurationHours >= 3;

      // 2. Scenic stops for scenic routes or very long routes (> 4 hours)
      const shouldSuggestScenic = userWantsScenic || tripRequest.preferences?.scenic || routeDurationHours >= 4;

      // 3. Gas stops if explicitly requested, vehicle range requires it, or route is long (>200 miles)
      const shouldSuggestGas = userWantsGas || routeDistanceMiles >= 200;

      console.log('[find-stops] Stop suggestions:', {
        userRequested: { gas: userWantsGas, restaurant: userWantsRestaurant, scenic: userWantsScenic },
        intelligent: { gas: shouldSuggestGas, restaurant: shouldSuggestRestaurant, scenic: shouldSuggestScenic },
        routeInfo: { distanceMiles: routeDistanceMiles.toFixed(0), durationHours: routeDurationHours.toFixed(1) }
      });

      // Calculate if gas stops are needed based on vehicle range
      const needsGasByRange = tripRequest.vehicleRange && routeDistanceMiles > 0;
      let needsGasStops = shouldSuggestGas; // Start with intelligent default

      if (needsGasByRange && tripRequest.vehicleRange) {
        const fuelLevel = tripRequest.fuelLevel ?? 1.0; // Default to full tank
        const currentRange = fuelLevel * tripRequest.vehicleRange;
        const safetyBuffer = 50; // Miles to keep in reserve

        console.log(`[find-stops] Vehicle range: ${tripRequest.vehicleRange} mi, Current range: ${currentRange.toFixed(0)} mi`);

        if (routeDistanceMiles > currentRange - safetyBuffer) {
          needsGasStops = true; // Need gas by range calculation
          console.log(`[find-stops] Gas stop needed due to vehicle range`);
        }
      }

      if (needsGasStops) {
        // Need gas stops - calculate positions
        const fuelLevel = tripRequest.fuelLevel ?? 1.0; // Default to full tank
        const vehicleRange = tripRequest.vehicleRange || 300; // Default range
        
        const gasStopPositions = calculateGasStops(
          tripRequest.route,
          fuelLevel,
          vehicleRange,
          0.2 // Keep 20% fuel as reserve
        );

          console.log(`[find-stops] Need ${gasStopPositions.length} gas stop(s) based on range calculation`);

          // Find actual gas stations at calculated positions with grounded verification
          for (const gasStopPos of gasStopPositions) {
            try {
              const gasStations = await findPlacesAlongRoute(
                polyline,
                'gas_station',
                { rating: 4.0 }
              );

              console.log(`[find-stops] Found ${gasStations.length} candidate gas stations near ${gasStopPos.distance.toFixed(0)}-mile mark`);

              // Verify and rank gas stations based on grounded attributes
              const verifiedStations = await Promise.all(
                gasStations.slice(0, 5).map(async (station) => {
                  const quality = await verifyGasStationQuality(station);
                  const stationLat = station.geometry.location.lat;
                  const stationLng = station.geometry.location.lng;
                  const distance = Math.sqrt(
                    Math.pow(stationLat - gasStopPos.location.lat, 2) +
                    Math.pow(stationLng - gasStopPos.location.lng, 2)
                  );

                  // Calculate score: prioritize 24/7, clean facilities, high rating, proximity
                  let score = (station.rating || 0) * 10;
                  if (quality.is24Hours) score += 30;
                  if (quality.hasCleanFacilities) score += 20;
                  score -= distance * 100; // Prefer closer stations

                  return {
                    station,
                    quality,
                    distance,
                    score,
                  };
                })
              );

              // Sort by score and pick the best
              verifiedStations.sort((a, b) => b.score - a.score);
              const bestStation = verifiedStations[0];

              if (bestStation && bestStation.station) {
                const station = bestStation.station;
                const quality = bestStation.quality;
                
                // Check if this station is already in the stops array
                if (stops.find(s => s.name === station.name)) {
                  console.log(`[find-stops] Skipping duplicate gas station: ${station.name}`);
                  continue; // Skip to next gas stop position
                }
                
                console.log(`[find-stops] Selected gas station: ${station.name} (score: ${bestStation.score.toFixed(0)})`);
                console.log(`[find-stops] Verified attributes:`, quality.verifiedAttributes);

                // Build context with verified attributes for Gemini
                let contextWithVerified = `Strategic refueling stop at the ${gasStopPos.distance.toFixed(0)}-mile mark on your ${routeDistanceMiles.toFixed(0)}-mile journey from ${tripRequest.origin} to ${tripRequest.destination}`;
                if (quality.verifiedAttributes.length > 0) {
                  contextWithVerified += `. Verified attributes from Google Maps: ${quality.verifiedAttributes.join(', ')}`;
                }

                // Generate grounded reason that includes verified attributes
                const reason = await generateStopReason(
                  'gas',
                  station.name,
                  {
                    ...station,
                    verifiedAttributes: quality.verifiedAttributes,
                    is24Hours: quality.is24Hours,
                    hasCleanFacilities: quality.hasCleanFacilities,
                  },
                  contextWithVerified
                );

                // Get place details for accurate hours
                const details = await getPlaceDetails(station.place_id);
                const hours = details?.opening_hours?.open_now 
                  ? (quality.is24Hours ? 'Open 24/7' : 'Open now')
                  : 'Hours vary';

                stops.push({
                  type: 'gas',
                  name: station.name,
                  category: 'Gas Station',
                  rating: station.rating,
                  hours: hours,
                  distanceOffRoute: `${(bestStation.distance * 69).toFixed(1)} mi`, // Convert to miles
                  reason: reason,
                  location: station.geometry.location,
                  verifiedAttributes: quality.verifiedAttributes, // Add verified attributes for UI
                });
              }
            } catch (error) {
              console.error('[find-stops] Error finding gas station:', error);
            }
          }
      } else {
        console.log('[find-stops] Skipping gas stop search - not needed based on route distance and vehicle range');
      }

      // Step 2: Find restaurants if requested OR route is long enough for a meal break
      if (shouldSuggestRestaurant) {
        const restaurantPrefs = tripRequest.preferences?.restaurantPreferences;
        const targetRestaurants = 1; // Find 1 restaurant stop

        console.log(`[find-stops] Finding restaurant stop (requested: ${userWantsRestaurant}, intelligent: ${routeDurationHours >= 3}) with preferences:`, restaurantPrefs);

        try {
          // Build search criteria based on user preferences
          const searchCriteria: any = { rating: restaurantPrefs?.rating || 4.0 };
        
          // Use cuisine preference as keyword for search
          if (restaurantPrefs?.cuisine) {
            // Normalize cuisine name (e.g., "mediterranean" -> "mediterranean restaurant")
            const cuisineKeyword = restaurantPrefs.cuisine.toLowerCase();
            searchCriteria.keyword = cuisineKeyword;
            console.log(`[find-stops] Searching for restaurants with cuisine: ${cuisineKeyword}`);
          }

          const restaurants = await findPlacesAlongRoute(
            polyline,
            'restaurant',
            searchCriteria
          );

          console.log(`[find-stops] Found ${restaurants.length} candidate restaurants`);

          // Verify restaurant attributes using Google Maps data
          const verifiedRestaurants = await Promise.all(
            restaurants.slice(0, 10).map(async (restaurant) => {
              if (stops.find(s => s.name === restaurant.name)) {
                return null; // Skip if already added
              }

              // Check if user wants vegetarian/vegan options
              const wantsVegetarian = restaurantPrefs?.vegetarian === true;
              const wantsVegan = restaurantPrefs?.vegan === true;

              // Build requirements object based on user preferences
              const requirements: {
                vegetarian?: boolean;
                kidFriendly?: boolean;
                cuisine?: string;
              } = {
              };

              if (restaurantPrefs?.cuisine && !wantsVegetarian && !wantsVegan) {
                // Only check cuisine if it's not vegetarian/vegan (those are handled separately)
                requirements.cuisine = restaurantPrefs.cuisine;
              }
              if (wantsVegetarian || wantsVegan) {
                requirements.vegetarian = true;
              }
              if (restaurantPrefs?.kidFriendly) {
                requirements.kidFriendly = true;
              }

              const verification = await verifyRestaurantAttributes(restaurant, requirements);

              return {
                restaurant,
                verification,
                skippedVerification: false,
              };
            })
          );

          const evaluatedRestaurants = verifiedRestaurants
            .filter((v): v is NonNullable<typeof v> => v !== null);

          const hasSpecificRequirements = !!(
            restaurantPrefs &&
            (
              restaurantPrefs.vegetarian ||
              restaurantPrefs.vegan ||
              restaurantPrefs.kidFriendly ||
              restaurantPrefs.cuisine
            )
          );

          let selectedRestaurants = evaluatedRestaurants
            .filter(v => {
              if (hasSpecificRequirements) {
                return v.verification.matchesRequirements;
              }
              return v.verification.confidenceScore >= 20;
            })
            .sort((a, b) => b.verification.confidenceScore - a.verification.confidenceScore)
            .slice(0, targetRestaurants);

          if (selectedRestaurants.length === 0) {
            console.log('[find-stops] No restaurants matched strict requirements; relaxing filters');

            const relaxedRestaurants = evaluatedRestaurants
              .filter(v => v.verification.confidenceScore >= 10 || !hasSpecificRequirements)
              .sort((a, b) => (b.restaurant.rating || 0) - (a.restaurant.rating || 0))
              .slice(0, targetRestaurants);

            if (relaxedRestaurants.length > 0) {
              selectedRestaurants = relaxedRestaurants;
            } else if (restaurants.length > 0) {
              console.log('[find-stops] Falling back to top-rated search results without verification');
              selectedRestaurants = restaurants.slice(0, targetRestaurants).map(restaurant => ({
                restaurant,
                verification: {
                  matchesRequirements: false,
                  verifiedAttributes: [],
                  confidenceScore: restaurant.rating ? restaurant.rating * 2 : 0,
                },
                skippedVerification: true as boolean,
              }));
            }
          }

          console.log(`[find-stops] Selected ${selectedRestaurants.length} restaurants after applying fallbacks`);

          // Add selected restaurants to stops
          for (const { restaurant, verification } of selectedRestaurants) {
            console.log(`[find-stops] Selected restaurant: ${restaurant.name}`);
            console.log(`[find-stops] Verified attributes:`, verification.verifiedAttributes);
            console.log(`[find-stops] Confidence score:`, verification.confidenceScore);

            // Build context with verified attributes for Gemini
            let contextWithRequirements = `Dining option on your ${routeDistanceMiles.toFixed(0)}-mile journey from ${tripRequest.origin} to ${tripRequest.destination}`;

            if (restaurantPrefs) {
              const requirements: string[] = [];
              if (restaurantPrefs.cuisine) requirements.push(`${restaurantPrefs.cuisine} cuisine`);
              if (restaurantPrefs.kidFriendly) requirements.push('kid-friendly amenities');
              if (restaurantPrefs.priceLevel) requirements.push(`${restaurantPrefs.priceLevel} price range`);

              if (requirements.length > 0) {
                contextWithRequirements += `. User requires: ${requirements.join(', ')}`;
              }
            }

            if (verification.verifiedAttributes.length > 0) {
              contextWithRequirements += `. Verified from Google Maps reviews and data: ${verification.verifiedAttributes.join(', ')}`;
            }

            const reason = await generateStopReason(
              'restaurant',
              restaurant.name,
              {
                ...restaurant,
                verifiedAttributes: verification.verifiedAttributes,
              },
              contextWithRequirements
            );

            // Get place details for accurate hours
            const details = await getPlaceDetails(restaurant.place_id);
            const hours = details?.opening_hours?.open_now ? 'Open now' : 'Hours vary';

            stops.push({
              type: 'restaurant',
              name: restaurant.name,
              category: restaurant.types?.[0]?.replace(/_/g, ' ') || 'Restaurant',
              rating: restaurant.rating,
              priceLevel: restaurant.price_level ? '$'.repeat(restaurant.price_level) : '$$',
              hours: hours,
              distanceOffRoute: '0.5 mi',
              reason: reason,
              location: restaurant.geometry.location,
              verifiedAttributes: verification.verifiedAttributes, // Add verified attributes for UI
            });
          }
        } catch (error) {
          console.error('[find-stops] Error finding restaurants:', error);
        }
      } else {
        console.log('[find-stops] Skipping restaurant search - route is short (<3 hours) and not requested');
      }

      const customStopRequestsRaw = tripRequest.preferences?.customStops;
      const customStopRequests = Array.isArray(customStopRequestsRaw)
        ? (customStopRequestsRaw as Array<{
          id: string;
          label?: string;
          keywords?: string[];
          placeTypes?: string[];
          minRating?: number;
        }>)
        : [];

      if (customStopRequests.length > 0) {
        console.log('[find-stops] Processing custom stop requests:', customStopRequests.map(stop => stop.label || stop.id));

        for (const customStop of customStopRequests) {
          if (!customStop || !customStop.keywords || customStop.keywords.length === 0) {
            console.warn('[find-stops] Skipping custom stop with insufficient data:', customStop);
            continue;
          }

          const placeTypes = customStop.placeTypes && customStop.placeTypes.length > 0
            ? customStop.placeTypes
            : ['restaurant'];
          const keywords = customStop.keywords;
          const minimumRating =
            customStop.minRating ??
            tripRequest.preferences?.restaurantPreferences?.rating ??
            4.0;

          let selectedPlace: any | null = null;
          let selectedKeyword: string | null = null;
          let selectedType: string | null = null;

          for (const placeType of placeTypes) {
            for (const keyword of keywords) {
              const searchResults = await findPlacesAlongRoute(
                polyline,
                placeType as any,
                {
                  rating: minimumRating,
                  keyword,
                }
              );

              const filteredResults = searchResults.filter(result =>
                !stops.some(existingStop => existingStop.name === result.name)
              );

              if (filteredResults.length > 0) {
                selectedPlace = filteredResults[0];
                selectedKeyword = keyword;
                selectedType = placeType;
                break;
              }
            }

            if (selectedPlace) {
              break;
            }
          }

          if (!selectedPlace) {
            console.warn(`[find-stops] No places found for custom request "${customStop.label || customStop.id}"`);
            continue;
          }

          let verification: { verifiedAttributes: string[]; confidenceScore: number } = {
            verifiedAttributes: [],
            confidenceScore: 0,
          };

          try {
            verification = await verifyRestaurantAttributes(selectedPlace);
          } catch (verificationError) {
            console.warn('[find-stops] Verification failed for custom stop:', verificationError);
          }

          const contextSegments = [
            `Custom stop "${customStop.label || customStop.id}" requested along your ${routeDistanceMiles.toFixed(0)}-mile journey from ${tripRequest.origin} to ${tripRequest.destination}`,
          ];

          if (selectedKeyword) {
            contextSegments.push(`Keyword focus: ${selectedKeyword}`);
          }

          if (selectedType) {
            contextSegments.push(`Place type targeted: ${selectedType}`);
          }

          if (verification.verifiedAttributes.length > 0) {
            contextSegments.push(`Verified attributes: ${verification.verifiedAttributes.join(', ')}`);
          }

          const reason = await generateStopReason(
            'restaurant',
            selectedPlace.name,
            {
              ...selectedPlace,
              verifiedAttributes: verification.verifiedAttributes,
            },
            contextSegments.join('. ')
          );

          const details = await getPlaceDetails(selectedPlace.place_id);
          const hours = details?.opening_hours?.open_now !== undefined
            ? (details.opening_hours.open_now ? 'Open now' : 'Closed')
            : 'Hours vary';

          // Determine stop type based on custom stop ID or label
          let stopType = 'restaurant';
          if (customStop.id === 'grocery' || customStop.label?.toLowerCase().includes('grocery')) {
            stopType = 'grocery';
          } else if (customStop.id === 'coffee' || customStop.label?.toLowerCase().includes('coffee')) {
            stopType = 'coffee';
          } else if (customStop.id === 'dessert' || customStop.label?.toLowerCase().includes('dessert')) {
            stopType = 'dessert';
          } else if (customStop.id === 'tea' || customStop.label?.toLowerCase().includes('tea')) {
            stopType = 'tea';
          } else if (customStop.id === 'bubbleTea' || customStop.label?.toLowerCase().includes('bubble')) {
            stopType = 'bubbleTea';
          }

          stops.push({
            type: stopType,
            name: selectedPlace.name,
            category: customStop.label || selectedPlace.types?.[0]?.replace(/_/g, ' ') || 'Food & Drink',
            rating: selectedPlace.rating,
            priceLevel: selectedPlace.price_level ? '$'.repeat(selectedPlace.price_level) : undefined,
            hours,
            distanceOffRoute: '0.4 mi',
            reason,
            location: selectedPlace.geometry.location,
            verifiedAttributes: verification.verifiedAttributes,
          });
        }
      }

      // Step 3: Find scenic stops if requested OR route is scenic/very long
      if (shouldSuggestScenic) {
        const targetScenicStops = 1; // One scenic stop for variety

        console.log(`[find-stops] Finding scenic viewpoints (requested: ${userWantsScenic}, intelligent: ${tripRequest.preferences?.scenic || routeDurationHours >= 4})`);

        try {
          const scenicPlaces = await findPlacesAlongRoute(
            polyline,
            'tourist_attraction',
            { rating: 4.2 } // Higher rating threshold for scenic spots
          );

          console.log(`[find-stops] Found ${scenicPlaces.length} candidate scenic locations`);

          for (let i = 0; i < Math.min(targetScenicStops, scenicPlaces.length); i++) {
            const scenic = scenicPlaces[i];
            if (scenic && !stops.find(s => s.name === scenic.name)) {
              console.log(`[find-stops] Evaluating scenic spot: ${scenic.name}`);

              // Generate grounded reason with verification of photo quality and views
              const reason = await generateStopReason(
                'scenic',
                scenic.name,
                scenic,
                `Scenic viewpoint worth experiencing on your ${routeDistanceMiles.toFixed(0)}-mile journey from ${tripRequest.origin} to ${tripRequest.destination}. Verify photo opportunities and accessibility.`
              );

              stops.push({
                type: 'scenic',
                name: scenic.name,
                category: 'Scenic Overlook',
                rating: scenic.rating,
                hours: scenic.opening_hours?.open_now !== undefined
                  ? (scenic.opening_hours.open_now ? 'Open now' : 'Closed')
                  : 'Open 24 hours',
                distanceOffRoute: '1.2 mi',
                reason: reason,
                location: scenic.geometry.location,
              });
            }
          }
        } catch (error) {
          console.error('[find-stops] Error finding scenic places:', error);
        }
      } else {
        console.log('[find-stops] Skipping scenic search - route is not scenic and not long enough (<4 hours)');
      }

      console.log(`[find-stops] Found ${stops.length} grounded stops total`);

      // Quality over quantity - only add fallback if we have very few stops
      if (stops.length === 0) {
        console.log('[find-stops] No stops found with high criteria, adding fallback options...');
        try {
          const fallbackPlaces = await findPlacesAlongRoute(
            polyline,
            'restaurant',
            { rating: 3.5 }
          );

          for (let i = 0; i < Math.min(2, fallbackPlaces.length); i++) {
            const place = fallbackPlaces[i];
            if (place && !stops.find(s => s.name === place.name)) {
              const reason = await generateStopReason(
                'restaurant',
                place.name,
                place,
                `Convenient stop along your route from ${tripRequest.origin} to ${tripRequest.destination}`
              );

              stops.push({
                type: 'restaurant',
                name: place.name,
                category: 'Restaurant',
                rating: place.rating,
                priceLevel: place.price_level ? '$'.repeat(place.price_level) : '$$',
                hours: place.opening_hours?.open_now ? 'Open now' : 'Hours vary',
                distanceOffRoute: '0.5 mi',
                reason: reason,
                location: place.geometry.location,
              });
            }
          }
        } catch (error) {
          console.error('[find-stops] Error finding fallback places:', error);
        }
      }

      // Calculate time allocations if time constraints are present
      let timeConstraintInfo: any = null;
      const timeConstraints = tripRequest.preferences?.timeConstraints;
      if (timeConstraints && (timeConstraints.arrivalTime || timeConstraints.arrivalTimeHours)) {
        console.log('[find-stops] Time constraints detected, calculating time allocations');
        
        try {
          const { deadline, departure } = calculateArrivalDeadline(timeConstraints);
          
          if (deadline && stops.length > 0) {
            // Calculate route duration in minutes
            const routeDurationMinutes = routeDuration / 60;
            
            // Prepare stop data for time calculation
            // For now, we'll estimate travel times between stops (this could be improved with actual route calculations)
            const stopsWithTravelTimes = stops.map((stop, index) => {
              // Estimate: assume stops are evenly spaced along route
              // Actual implementation would calculate real travel times
              const segments = stops.length + 1; // segments between stops + to/from stops
              const segmentTime = routeDurationMinutes / segments;
              
              return {
                name: stop.name,
                type: stop.type,
                travelTimeFromPreviousMinutes: index === 0 ? segmentTime : segmentTime,
                travelTimeToNextMinutes: index === stops.length - 1 ? segmentTime : segmentTime,
              };
            });
            
            // Calculate time allocations
            const timeCalculation = calculateTimeAllocations(
              deadline,
              departure,
              routeDurationMinutes,
              stopsWithTravelTimes,
              10 // 10 minute buffer
            );
            
            console.log('[find-stops] Time calculation result:', {
              totalTravelTime: formatDuration(timeCalculation.totalTravelTimeMinutes),
              availableForStops: formatDuration(timeCalculation.availableTimeForStopsMinutes),
              isFeasible: timeCalculation.isFeasible,
              warning: timeCalculation.warning,
            });
            
            // Add time allocation info to each stop
            stops.forEach((stop) => {
              const recommendedMinutes = timeCalculation.recommendedStopDurations.get(stop.name);
              const maxMinutes = timeCalculation.maxStopDurations.get(stop.name);
              
              if (recommendedMinutes !== undefined) {
                stop.recommendedDurationMinutes = recommendedMinutes;
                stop.recommendedDuration = formatDuration(recommendedMinutes);
              }
              if (maxMinutes !== undefined) {
                stop.maxDurationMinutes = maxMinutes;
                stop.maxDuration = formatDuration(maxMinutes);
              }
            });
            
            // Store time constraint info to return in response
            timeConstraintInfo = {
              arrivalDeadline: deadline.toISOString(),
              departureTime: departure?.toISOString(),
              totalTravelTimeMinutes: timeCalculation.totalTravelTimeMinutes,
              availableTimeForStopsMinutes: timeCalculation.availableTimeForStopsMinutes,
              isFeasible: timeCalculation.isFeasible,
              warning: timeCalculation.warning,
            };
            
            if (timeCalculation.warning) {
              console.warn('[find-stops] Time constraint warning:', timeCalculation.warning);
            }
          }
        } catch (error) {
          console.error('[find-stops] Error calculating time allocations:', error);
        }
      }

      await storage.updateTripRequest(tripRequestId, {
        stops,
      });

      console.log(`[find-stops] Found ${stops.length} stops, now recalculating route with waypoints`);

      // Automatically recalculate route with all stops as waypoints to get accurate directions
      if (stops.length > 0 && tripRequest.origin && tripRequest.destination) {
        try {
          // Prepare waypoints from stops (only include stops with valid locations)
          // Sort stops by their position along the route to ensure correct order
          // We'll estimate position by finding the closest point on the route polyline
          let sortedStops = stops.filter(stop => stop.location && stop.location.lat && stop.location.lng);
          
          if (polyline && sortedStops.length > 0) {
            // Decode the route polyline to get route points
            const routePoints: Array<{ lat: number; lng: number }> = [];
            let index = 0;
            let lat = 0;
            let lng = 0;

            while (index < polyline.length) {
              let shift = 0;
              let result = 0;
              let byte: number;

              do {
                byte = polyline.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
              } while (byte >= 0x20);

              const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
              lat += deltaLat;

              shift = 0;
              result = 0;

              do {
                byte = polyline.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
              } while (byte >= 0x20);

              const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
              lng += deltaLng;

              routePoints.push({
                lat: lat / 1e5,
                lng: lng / 1e5,
              });
            }

            // Calculate distance along route for each stop
            const stopsWithDistance = sortedStops.map(stop => {
              let minDistance = Infinity;
              let closestPointIndex = 0;
              let accumulatedDistance = 0;

              // Find closest point on route and calculate distance along route
              for (let i = 0; i < routePoints.length - 1; i++) {
                const p1 = routePoints[i];
                const p2 = routePoints[i + 1];
                
                // Calculate distance from stop to line segment
                const dx = p2.lng - p1.lng;
                const dy = p2.lat - p1.lat;
                const segmentLength = Math.sqrt(dx * dx + dy * dy);
                
                if (segmentLength > 0) {
                  const t = Math.max(0, Math.min(1, 
                    ((stop.location!.lng - p1.lng) * dx + (stop.location!.lat - p1.lat) * dy) / (segmentLength * segmentLength)
                  ));
                  
                  const closestPoint = {
                    lat: p1.lat + t * dy,
                    lng: p1.lng + t * dx,
                  };
                  
                  const distance = Math.sqrt(
                    Math.pow(stop.location!.lat - closestPoint.lat, 2) +
                    Math.pow(stop.location!.lng - closestPoint.lng, 2)
                  );
                  
                  if (distance < minDistance) {
                    minDistance = distance;
                    // Calculate accumulated distance along route up to this point
                    let dist = 0;
                    for (let j = 0; j < i; j++) {
                      const dp = routePoints[j + 1];
                      const dp1 = routePoints[j];
                      dist += Math.sqrt(
                        Math.pow(dp.lat - dp1.lat, 2) +
                        Math.pow(dp.lng - dp1.lng, 2)
                      );
                    }
                    // Add distance along current segment
                    dist += segmentLength * t;
                    closestPointIndex = i;
                    accumulatedDistance = dist;
                  }
                }
              }

              return {
                stop,
                distanceAlongRoute: accumulatedDistance,
              };
            });

            // Sort by distance along route
            stopsWithDistance.sort((a, b) => a.distanceAlongRoute - b.distanceAlongRoute);
            sortedStops = stopsWithDistance.map(item => item.stop);
            
            console.log('[find-stops] Stops sorted by position along route:', sortedStops.map(s => s.name).join(' -> '));
          }

          // Limit to at most 8 waypoints to avoid Directions API limits and keep routes stable
          const waypoints = sortedStops.slice(0, 8).map(stop => ({
            name: stop.name,
            location: stop.location!,
          }));

          if (waypoints.length > 0) {
            console.log(`[find-stops] Recalculating route with ${waypoints.length} waypoints in order:`, waypoints.map(w => w.name).join(' -> '));
            
            const apiKey = process.env.GOOGLE_MAPS_API_KEY;
            if (!apiKey) {
              console.error('[find-stops] Google Maps API key not found');
              return res.json({ stops, route: tripRequest.route, timeConstraintInfo }); // Return stops without recalculating route
            }

            // Use coordinates from the original route if available, otherwise use addresses
            let origin = tripRequest.origin;
            let destination = tripRequest.destination;

            if (tripRequest.route?.legs?.[0]) {
              const firstLeg = tripRequest.route.legs[0];
              const lastLeg = tripRequest.route.legs[tripRequest.route.legs.length - 1];

              if (firstLeg.start_location) {
                origin = `${firstLeg.start_location.lat},${firstLeg.start_location.lng}`;
              }
              if (lastLeg.end_location) {
                destination = `${lastLeg.end_location.lat},${lastLeg.end_location.lng}`;
              }
            }

            // Build waypoints parameter for Directions API
            // Note: We don't use optimize:true because we want to maintain the order
            // (gas stops need to be in specific positions based on fuel range)
            const waypointsParam = waypoints.map(wp => `${wp.location.lat},${wp.location.lng}`).join('|');

            const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
            url.searchParams.append('origin', origin);
            url.searchParams.append('destination', destination);
            url.searchParams.append('waypoints', waypointsParam); // Maintain order, don't optimize
            url.searchParams.append('key', apiKey);
            url.searchParams.append('mode', 'driving');
            
            // Apply user preferences
            if (tripRequest.preferences?.avoidTolls) {
              url.searchParams.append('avoid', 'tolls');
            }
            if (tripRequest.preferences?.fast) {
              url.searchParams.append('departure_time', 'now');
              url.searchParams.append('traffic_model', 'best_guess');
            }

            console.log('[find-stops] Calling Google Maps Directions API with waypoints');
            console.log('[find-stops] Route will go: Origin ->', waypoints.map(w => w.name).join(' -> '), '-> Destination');
            const directionsResponse = await fetch(url.toString());

            if (!directionsResponse.ok) {
              console.error('[find-stops] Directions API HTTP error:', directionsResponse.status);
              // Continue without recalculating route
              return res.json({ stops, route: tripRequest.route, timeConstraintInfo });
            }

            const directionsData = await directionsResponse.json();

            if (directionsData.status === 'OK' && directionsData.routes && directionsData.routes.length > 0) {
              const updatedRoute = directionsData.routes[0];
              
              console.log(`[find-stops] Successfully recalculated route with ${waypoints.length} waypoints`);
              console.log(`[find-stops] New route has ${updatedRoute.legs?.length || 0} legs`);
              console.log(`[find-stops] Total distance: ${updatedRoute.legs?.reduce((sum: number, leg: any) => sum + (leg.distance?.value || 0), 0) / 1609.34 || 0} miles`);
              console.log(`[find-stops] Total duration: ${updatedRoute.legs?.reduce((sum: number, leg: any) => sum + (leg.duration?.value || 0), 0) / 60 || 0} minutes`);

              // Update trip request with the new route that includes waypoints
              await storage.updateTripRequest(tripRequestId, {
                route: updatedRoute,
              });

              return res.json({ 
                stops,
                route: updatedRoute, // Return the updated route with waypoints
                timeConstraintInfo,
              });
            } else {
              console.warn('[find-stops] Directions API returned non-OK status:', directionsData.status, directionsData.error_message);
              console.warn('[find-stops] Continuing with original route');
              // Continue with original route if waypoints fail
              return res.json({ stops, route: tripRequest.route, timeConstraintInfo });
            }
          }
        } catch (routeError) {
          console.error('[find-stops] Error recalculating route with waypoints:', routeError);
          // Continue without recalculating route if there's an error
          return res.json({ stops, route: tripRequest.route, timeConstraintInfo });
        }
      }

      console.log(`[find-stops] Returning ${stops.length} stops for trip ${tripRequestId}`);
      res.json({ stops, route: tripRequest.route, timeConstraintInfo });
    } catch (error: any) {
      console.error('Find stops error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Recalculate route with added waypoints (stops).
   * When users click "Add to Route", this endpoint recalculates the route
   * to include the selected stops in the correct order.
   */
  app.post("/api/recalculate-route", async (req: Request, res: Response) => {
    console.log('[recalculate-route] Request received:', JSON.stringify(req.body, null, 2));

    try {
      const { tripRequestId, waypoints } = req.body;

      if (!tripRequestId) {
        console.error('[recalculate-route] Missing tripRequestId');
        return res.status(400).json({ error: 'Trip request ID is required' });
      }

      if (!waypoints || !Array.isArray(waypoints)) {
        console.error('[recalculate-route] Invalid waypoints:', waypoints);
        return res.status(400).json({ error: 'Waypoints array is required' });
      }

      console.log(`[recalculate-route] Looking up trip request: ${tripRequestId}`);
      const tripRequest = await storage.getTripRequest(tripRequestId);

      if (!tripRequest) {
        console.error('[recalculate-route] Trip request not found:', tripRequestId);
        return res.status(404).json({ error: 'Trip request not found' });
      }

      if (!tripRequest.origin || !tripRequest.destination) {
        console.error('[recalculate-route] Missing origin or destination');
        return res.status(400).json({ error: 'Origin and destination are required' });
      }

      console.log(`[recalculate-route] Recalculating route from ${tripRequest.origin} to ${tripRequest.destination} with ${waypoints.length} waypoint(s)`);

      // Validate waypoints have valid coordinates
      for (const wp of waypoints) {
        if (!wp.location || typeof wp.location.lat !== 'number' || typeof wp.location.lng !== 'number') {
          console.error('[recalculate-route] Invalid waypoint:', wp);
          return res.status(400).json({ error: `Invalid waypoint location: ${wp.name}` });
        }
        if (Math.abs(wp.location.lat) > 90 || Math.abs(wp.location.lng) > 180) {
          console.error('[recalculate-route] Waypoint coordinates out of range:', wp);
          return res.status(400).json({ error: `Waypoint coordinates out of range: ${wp.name}` });
        }
      }

      // Build waypoints string for Google Maps API (cap to 8)
      // Format: "location1|location2|location3"
      const limitedWaypoints = waypoints.slice(0, 8);
      const waypointsParam = limitedWaypoints.map(wp => {
        console.log('[recalculate-route] Waypoint:', wp.name, wp.location);
        return `${wp.location.lat},${wp.location.lng}`;
      }).join('|');

      console.log('[recalculate-route] Waypoints param:', waypointsParam);

      // Call Google Maps Directions API with waypoints
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.error('[recalculate-route] Google Maps API key not found');
        return res.status(500).json({ error: 'Google Maps API key not configured' });
      }

      // Use coordinates from the original route if available, otherwise use stored addresses
      let origin = tripRequest.origin;
      let destination = tripRequest.destination;

      // If the original route exists, use its start/end coordinates for more accuracy
      if (tripRequest.route?.legs?.[0]) {
        const firstLeg = tripRequest.route.legs[0];
        const lastLeg = tripRequest.route.legs[tripRequest.route.legs.length - 1];

        if (firstLeg.start_location) {
          origin = `${firstLeg.start_location.lat},${firstLeg.start_location.lng}`;
          console.log('[recalculate-route] Using origin coordinates from original route:', origin);
        }
        if (lastLeg.end_location) {
          destination = `${lastLeg.end_location.lat},${lastLeg.end_location.lng}`;
          console.log('[recalculate-route] Using destination coordinates from original route:', destination);
        }
      }

      const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
      url.searchParams.append('origin', origin);
      url.searchParams.append('destination', destination);
      if (limitedWaypoints.length > 0) {
        // optimize:true tells Google to reorder waypoints for the best route
        url.searchParams.append('waypoints', `optimize:true|${waypointsParam}`);
      }
      url.searchParams.append('key', apiKey);
      url.searchParams.append('mode', 'driving');
      url.searchParams.append('alternatives', 'false'); // Single optimized route
      if (tripRequest.preferences?.avoidTolls) {
        url.searchParams.append('avoid', 'tolls');
      }

      console.log('[recalculate-route] Calling Google Maps API...');
      console.log('[recalculate-route] Request URL:', url.toString().replace(apiKey, 'API_KEY_HIDDEN'));
      const response = await fetch(url.toString());

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[recalculate-route] Google Maps API HTTP error:', response.status, errorText);
        return res.status(500).json({ error: `Google Maps API error: ${response.status}` });
      }

      const data = await response.json();
      console.log('[recalculate-route] Google Maps API response status:', data.status);

      if (data.status !== 'OK') {
        console.error('[recalculate-route] Google Maps API returned non-OK status:', data.status, data.error_message);

        // Provide more specific error messages
        let errorMessage = 'Failed to calculate route with waypoints';
        if (data.status === 'NOT_FOUND') {
          errorMessage = `Could not find a valid route. Please check that the locations are accessible by road:\n- Origin: ${tripRequest.origin}\n- Destination: ${tripRequest.destination}\n- Waypoints: ${waypoints.map(w => w.name).join(', ')}`;
        } else if (data.status === 'ZERO_RESULTS') {
          errorMessage = `No route found with the selected waypoints. The stops may be too far off route or unreachable.`;
        } else if (data.status === 'MAX_WAYPOINTS_EXCEEDED') {
          errorMessage = `Too many waypoints selected (maximum 25). Please select fewer stops.`;
        } else if (data.error_message) {
          errorMessage = data.error_message;
        }

        return res.status(500).json({ error: errorMessage });
      }

      if (!data.routes || data.routes.length === 0) {
        console.error('[recalculate-route] No routes returned');
        return res.status(404).json({ error: 'No routes found with the specified waypoints' });
      }

      const newRoute = data.routes[0];
      console.log('[recalculate-route] Successfully calculated route with waypoints');
      console.log('[recalculate-route] Optimized waypoint_order:', newRoute.waypoint_order);

      // Reorder waypoints according to Google's optimization
      let reorderedWaypoints = limitedWaypoints;
      if (newRoute.waypoint_order && newRoute.waypoint_order.length > 0) {
        reorderedWaypoints = newRoute.waypoint_order.map((idx: number) => limitedWaypoints[idx]);
        console.log('[recalculate-route] Waypoints reordered per Google optimization');
      }

      // Update trip request with new route
      await storage.updateTripRequest(tripRequestId, {
        route: newRoute,
      });

      console.log(`[recalculate-route] Successfully updated trip request with ${limitedWaypoints.length} waypoint(s)`);

      return res.json({
        route: newRoute,
        waypoints: reorderedWaypoints, // Return in optimized order
      });
    } catch (error: any) {
      console.error('[recalculate-route] Unexpected error:', error);
      console.error('[recalculate-route] Error stack:', error.stack);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  /**
   * Generate itinerary with stops using Gemini AI structured output.
   * This endpoint uses Gemini to suggest stops (gas, food, scenic) along a route
   * based on user preferences and trip details.
   */
  app.post("/api/generate-itinerary", async (req: Request, res: Response) => {
    try {
      const { userPrompt, tripRequestId } = req.body;

      if (!userPrompt) {
        return res.status(400).json({ error: 'User prompt is required' });
      }

      let tripParameters = null;
      
      // If tripRequestId is provided, get trip parameters from storage
      if (tripRequestId) {
        const tripRequest = await storage.getTripRequest(tripRequestId);
        if (tripRequest) {
          tripParameters = {
            origin: tripRequest.origin,
            destination: tripRequest.destination,
            fuelLevel: tripRequest.fuelLevel ?? undefined,
            vehicleRange: tripRequest.vehicleRange ?? undefined,
            preferences: tripRequest.preferences ?? undefined,
          };
        }
      } else {
        // Try to extract trip parameters from the prompt
        const parsedParams = await parseUserRequest(userPrompt, []);
        if (parsedParams.origin || parsedParams.destination) {
          tripParameters = parsedParams;
        }
      }

      // Generate itinerary with stops using Gemini
      const itinerary = await generateItineraryWithStops(userPrompt, tripParameters || undefined);

      // If tripRequestId exists, save the itinerary stops to the trip request
      if (tripRequestId) {
        // Convert itinerary stops to the format expected by the existing storage
        const stops: any[] = itinerary.enrichedRoute.stops
          .filter(stop => stop.type !== 'ORIGIN' && stop.type !== 'DESTINATION')
          .map(stop => {
            const stopType = stop.type.toLowerCase();
            const category = stop.type === 'GAS' ? 'Gas Station' 
              : stop.type === 'FOOD' ? 'Restaurant' 
              : stop.type === 'SCENIC' ? 'Scenic Overlook' 
              : 'Other';
            return {
              type: stopType,
              name: stop.name,
              category,
              rating: 4.5, // Default rating since Gemini doesn't provide this
              priceLevel: '$$',
              hours: 'Hours vary',
              distanceOffRoute: '0.5 mi',
              reason: stop.reason,
              location: {
                lat: stop.latitude,
                lng: stop.longitude,
              },
            };
          });

        await storage.updateTripRequest(tripRequestId, {
          stops,
        });
      }

      res.json({
        itinerary,
        success: true,
      });
    } catch (error: any) {
      console.error('Generate itinerary error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route Concierge endpoint - strict filtering with detour constraints
  app.post("/api/route-concierge", async (req: Request, res: Response) => {
    try {
      const {
        start,
        destination,
        categories,
        timeContext,
        maxDetourMinutes,
        maxOffRouteMiles,
        minRating,
        minReviews,
      } = req.body;

      if (!start || !destination || !categories || !Array.isArray(categories) || categories.length === 0) {
        return res.status(400).json({
          error: 'Missing required fields: start, destination, and categories (array) are required'
        });
      }

      console.log('[route-concierge] Request:', { start, destination, categories });

      const response = await findRouteConciergeStops({
        start,
        destination,
        categories,
        timeContext,
        maxDetourMinutes: maxDetourMinutes || 5,
        maxOffRouteMiles: maxOffRouteMiles || 1.0,
        minRating: minRating || 4.2,
        minReviews: minReviews || 50,
      });

      // Generate human-readable summary
      const summary = generateConciergeSummary(response);

      res.json({
        summary,
        ...response,
      });
    } catch (error: any) {
      console.error('[route-concierge] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to find route concierge stops' });
    }
  });

  function generateConciergeSummary(response: any): string {
    const { route, stops } = response;
    const stopCount = stops.length;
    const totalDetour = stops.reduce((sum: number, stop: any) => sum + stop.detour_minutes, 0);

    let summary = `Found ${stopCount} stop${stopCount !== 1 ? 's' : ''} along your ${route.distance_miles}-mile route from ${route.start} to ${route.destination}. `;
    summary += `Total drive time: ${route.drive_time_minutes} minutes${totalDetour > 0 ? ` (plus ~${totalDetour} minutes for stops)` : ''}. `;

    if (stops.length > 0) {
      const categories = Array.from(new Set(stops.map((s: any) => s.category)));
      summary += `Stops include: ${categories.join(' and ')}. `;

      const detours = stops.map((s: any) => `${s.detour_minutes} min`).join(', ');
      summary += `All stops kept within ${detours} detours and under 1 mile off route. `;

      const openStops = stops.filter((s: any) => s.open_now === true);
      if (openStops.length > 0) {
        summary += `${openStops.length} stop${openStops.length !== 1 ? 's are' : ' is'} currently open.`;
      }
    }

    if (response.note) {
      summary += ` ${response.note}`;
    }

    return summary;
  }

  // Voice transcription endpoint using Azure OpenAI Whisper
  app.post("/api/transcribe", async (req: Request, res: Response) => {
    try {
      console.log('[transcribe] ===== TRANSCRIPTION REQUEST RECEIVED =====');
      console.log('[transcribe] Request headers:', JSON.stringify(req.headers, null, 2));
      console.log('[transcribe] Request body keys:', Object.keys(req.body || {}));
      console.log('[transcribe] Has audio data:', !!req.body?.audio);
      console.log('[transcribe] Audio data type:', typeof req.body?.audio);
      if (req.body?.audio) {
        console.log('[transcribe] Audio data length (chars):', req.body.audio.length);
        console.log('[transcribe] Audio data prefix (first 100):', req.body.audio.substring(0, 100));
      }
      console.log('[transcribe] MIME type from request:', req.body?.mimeType);

      // Check if request has audio data
      if (!req.body || !req.body.audio) {
        console.error('[transcribe] No audio data in request body');
        return res.status(400).json({ error: 'No audio data provided' });
      }

      // Get Azure OpenAI configuration
      const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
      const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
      // Whisper API may use a different API version than the chat API
      const whisperApiVersion = process.env.AZURE_OPENAI_WHISPER_API_VERSION || process.env.AZURE_OPENAI_API_VERSION || '2024-06-01';
      const whisperDeployment = process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT || 'whisper';

      // Validate configuration
      if (!azureEndpoint || !azureApiKey) {
        console.error('[transcribe] Azure OpenAI not configured');
        return res.status(500).json({ 
          error: 'Azure OpenAI not configured. Please set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY' 
        });
      }

      if (!whisperDeployment) {
        console.error('[transcribe] Whisper deployment not configured');
        return res.status(500).json({ 
          error: 'Whisper deployment not configured. Please set AZURE_OPENAI_WHISPER_DEPLOYMENT' 
        });
      }

      // Normalize endpoint URL (ensure it doesn't end with /)
      const normalizedEndpoint = azureEndpoint.endsWith('/') 
        ? azureEndpoint.slice(0, -1) 
        : azureEndpoint;

      // Construct the Azure OpenAI Whisper endpoint URL
      // Format: {endpoint}/openai/deployments/{deployment}/audio/transcriptions?api-version={version}
      const whisperUrl = `${normalizedEndpoint}/openai/deployments/${whisperDeployment}/audio/transcriptions?api-version=${whisperApiVersion}`;

      console.log('[transcribe] Using Whisper configuration:', {
        endpoint: normalizedEndpoint,
        deployment: whisperDeployment,
        apiVersion: whisperApiVersion,
        url: whisperUrl
      });

      // Extract audio data (expecting base64 encoded audio)
      console.log('[transcribe] ===== EXTRACTING AUDIO DATA =====');
      const audioData = req.body.audio;
      console.log('[transcribe] audioData type:', typeof audioData);
      console.log('[transcribe] audioData length:', audioData?.length);

      let audioBuffer: Buffer;

      if (typeof audioData === 'string') {
        console.log('[transcribe] Audio data is string, converting from base64...');
        console.log('[transcribe] Has comma separator:', audioData.includes(','));

        // Remove data URL prefix if present (e.g., "data:audio/webm;base64,")
        const base64Data = audioData.includes(',') ? audioData.split(',')[1] : audioData;
        console.log('[transcribe] Base64 data length after prefix removal:', base64Data.length);
        console.log('[transcribe] Base64 first 50 chars:', base64Data.substring(0, 50));

        audioBuffer = Buffer.from(base64Data, 'base64');
        console.log('[transcribe] Buffer created from base64');
      } else if (Buffer.isBuffer(audioData)) {
        console.log('[transcribe] Audio data is already a Buffer');
        audioBuffer = audioData;
      } else {
        console.error('[transcribe] Invalid audio format, type:', typeof audioData);
        return res.status(400).json({ error: 'Invalid audio format. Expected base64 string or buffer' });
      }

      console.log('[transcribe] Audio buffer created, length:', audioBuffer.length, 'bytes');

      if (audioBuffer.length === 0) {
        console.error('[transcribe] Audio buffer is empty (0 bytes)');
        return res.status(400).json({ error: 'Audio buffer is empty' });
      }

      console.log('[transcribe] Audio buffer first 20 bytes:', audioBuffer.slice(0, 20));

      // Determine file extension and MIME type
      const mimeType = req.body.mimeType || 'audio/webm';
      let fileExtension = 'webm';
      if (mimeType.includes('wav')) fileExtension = 'wav';
      else if (mimeType.includes('mp3')) fileExtension = 'mp3';
      else if (mimeType.includes('m4a')) fileExtension = 'm4a';
      else if (mimeType.includes('ogg')) fileExtension = 'ogg';
      else if (mimeType.includes('mp4')) fileExtension = 'mp4';

      // Create FormData for multipart/form-data request
      // Node.js 18+ has native FormData support
      console.log('[transcribe] ===== CREATING FORMDATA =====');
      const filename = `audio.${fileExtension}`;
      console.log('[transcribe] Filename:', filename);
      console.log('[transcribe] File extension:', fileExtension);
      console.log('[transcribe] MIME type:', mimeType);

      // Convert Buffer to Uint8Array for Blob compatibility
      console.log('[transcribe] Converting Buffer to Uint8Array...');
      const uint8Array = new Uint8Array(audioBuffer);
      console.log('[transcribe] Uint8Array created, length:', uint8Array.length);
      console.log('[transcribe] Uint8Array first 20 bytes:', Array.from(uint8Array.slice(0, 20)));

      // Create a Blob from the buffer for FormData
      console.log('[transcribe] Creating Blob for FormData...');
      const audioBlob = new Blob([uint8Array], { type: mimeType });
      console.log('[transcribe] Blob created, size:', audioBlob.size, 'bytes');
      console.log('[transcribe] Blob type:', audioBlob.type);

      // Create FormData
      console.log('[transcribe] Creating FormData...');
      const formData = new FormData();
      formData.append('file', audioBlob, filename);
      formData.append('language', 'en');
      formData.append('response_format', 'text');
      console.log('[transcribe] FormData created with fields: file, language, response_format');

      console.log('[transcribe] ===== CALLING AZURE OPENAI WHISPER API =====');
      console.log('[transcribe] Request details:', {
        url: whisperUrl,
        method: 'POST',
        filename: filename,
        mimeType: mimeType,
        audioSize: audioBuffer.length,
        blobSize: audioBlob.size,
        language: 'en',
        responseFormat: 'text'
      });

      // Make direct HTTP request to Azure OpenAI Whisper API
      // Use native fetch (Node.js 18+) which has better FormData support
      // Note: FormData will set Content-Type with boundary automatically
      const response = await fetch(whisperUrl, {
        method: 'POST',
        headers: {
          'api-key': azureApiKey,
          // Don't set Content-Type - FormData will set it with boundary automatically
        },
        body: formData,
      });

      console.log('[transcribe] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData: any;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        console.error('[transcribe] Azure OpenAI API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });

        return res.status(response.status).json({
          error: errorData.error?.message || errorData.error || `Azure OpenAI API error: ${response.status} ${response.statusText}`,
          details: errorData,
          status: response.status
        });
      }

      // Get transcription text (response_format=text returns plain text)
      const transcriptText = await response.text();
      
      if (!transcriptText || transcriptText.trim().length === 0) {
        console.warn('[transcribe] Empty transcription received');
        return res.status(500).json({ error: 'Received empty transcription from Azure OpenAI' });
      }

      console.log('[transcribe] Transcription successful:', transcriptText.trim());

      res.json({ 
        transcript: transcriptText.trim(),
        language: 'en'
      });
    } catch (error: any) {
      console.error('[transcribe] Transcription error:', error);
      console.error('[transcribe] Error stack:', error.stack);
      
      // Provide more detailed error information
      let errorMessage = error.message || 'Failed to transcribe audio';
      let errorDetails: any = error.message;
      
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        errorMessage = 'Failed to connect to Azure OpenAI endpoint. Please check your endpoint URL.';
        errorDetails = error.message;
      } else if (error.response) {
        errorDetails = error.response.data || error.response.statusText;
      }

      res.status(500).json({ 
        error: errorMessage,
        details: errorDetails,
        code: error.code
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
