import { MapPin, Navigation, Map as MapIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface MapViewProps {
  route?: any;
  stops?: Array<{
    type: 'gas' | 'restaurant' | 'scenic';
    name: string;
    location?: any;
  }>;
  addedStops?: Array<{
    type: string;
    name: string;
    location: { lat: number; lng: number };
    category?: string;
  }>;
  isNavigating?: boolean;
  userLocation?: { lat: number; lng: number } | null;
}

export default function MapView({ route, stops = [], addedStops = [], isNavigating = false, userLocation: initialUserLocation }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const waypointMarkersRef = useRef<google.maps.Marker[]>([]);
  const userLocationMarkerRef = useRef<google.maps.Marker | null>(null);
  const [isNavigationView, setIsNavigationView] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(initialUserLocation || null);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [nextInstruction, setNextInstruction] = useState<string>("");
  const watchIdRef = useRef<number | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Update userLocation when prop changes
  useEffect(() => {
    if (initialUserLocation && !isNavigating) {
      setUserLocation(initialUserLocation);
    }
  }, [initialUserLocation, isNavigating]);

  // Initialize Google Maps
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.error('[MapView] Google Maps API key is missing');
      return;
    }

    if (mapRef.current || !mapContainerRef.current) return;

    console.log('[MapView] Initializing Google Maps');

    // Load Google Maps script dynamically
    const loadGoogleMaps = async () => {
      // Check if Google Maps is already loaded
      if (window.google?.maps) {
        initializeMap();
        return;
      }

      // Check if script is already loading
      const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
      if (existingScript) {
        existingScript.addEventListener('load', initializeMap);
        return;
      }

      // Create and load the script
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&v=weekly`;
      script.async = true;
      script.defer = true;

      script.onload = () => {
        console.log('[MapView] Google Maps script loaded');
        initializeMap();
      };

      script.onerror = (error) => {
        console.error('[MapView] Error loading Google Maps script:', error);
      };

      document.head.appendChild(script);
    };

    const initializeMap = () => {
      if (!mapContainerRef.current || !window.google?.maps) return;

      try {
        // Center on user location if available, otherwise default to San Francisco
        const initialCenter = initialUserLocation
          ? { lat: initialUserLocation.lat, lng: initialUserLocation.lng }
          : { lat: 37.7749, lng: -122.4194 };

        const map = new google.maps.Map(mapContainerRef.current, {
          center: initialCenter,
          zoom: 15,
          mapTypeControl: true,
          fullscreenControl: true,
          streetViewControl: true,
          zoomControl: true,
          mapTypeId: google.maps.MapTypeId.ROADMAP,
        });

        mapRef.current = map;
        setMapLoaded(true);
        console.log('[MapView] Google Maps initialized successfully');
      } catch (error) {
        console.error('[MapView] Error initializing map:', error);
      }
    };

    loadGoogleMaps();

    return () => {
      // Cleanup
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
        directionsRendererRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current = null;
      }
    };
  }, [initialUserLocation]);

  // Handle route rendering using DirectionsService (fetches route from Google and renders with DirectionsRenderer)
  useEffect(() => {
    if (!mapRef.current || !route || !mapLoaded) return;

    const map = mapRef.current;
    console.log('[MapView] Rendering route with DirectionsService + DirectionsRenderer');

    // Clear existing DirectionsRenderer and polyline
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = null;
    }
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }

    // Get origin, destination, and waypoints from route
    const origin = route.legs?.[0]?.start_location;
    const destination = route.legs?.[route.legs.length - 1]?.end_location;
    
    if (!origin || !destination) {
      console.error('[MapView] Missing origin or destination in route');
      return;
    }

    // Build waypoints array from addedStops
    const waypoints: google.maps.DirectionsWaypoint[] = [];
    if (addedStops && addedStops.length > 0) {
      // Use optimized order from route if available
      if (route.waypoint_order && route.waypoint_order.length > 0) {
        route.waypoint_order.forEach((idx: number) => {
          const stop = addedStops[idx];
          if (stop && stop.location) {
            waypoints.push({
              location: new google.maps.LatLng(stop.location.lat, stop.location.lng),
              stopover: true,
            });
          }
        });
      } else {
        // Fallback to original order
        addedStops.forEach((stop) => {
          if (stop.location) {
            waypoints.push({
              location: new google.maps.LatLng(stop.location.lat, stop.location.lng),
              stopover: true,
            });
          }
        });
      }
    }

    // Create DirectionsService to fetch route from Google
    const directionsService = new google.maps.DirectionsService();
    const directionsRenderer = new google.maps.DirectionsRenderer({
      map: map,
      suppressMarkers: true, // We'll add custom numbered markers
      preserveViewport: isNavigating,
    });

    directionsRendererRef.current = directionsRenderer;

    // Request route from Google Maps DirectionsService
    const request: google.maps.DirectionsRequest = {
      origin: new google.maps.LatLng(origin.lat, origin.lng),
      destination: new google.maps.LatLng(destination.lat, destination.lng),
      waypoints: waypoints.length > 0 ? waypoints : undefined,
      optimizeWaypoints: waypoints.length > 1, // Optimize if multiple waypoints
      travelMode: google.maps.TravelMode.DRIVING,
      avoidTolls: false,
    };

    console.log('[MapView] Requesting route from DirectionsService with', waypoints.length, 'waypoints');

    directionsService.route(request, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK && result) {
        console.log('[MapView] Route received from DirectionsService, waypoint_order:', result.routes[0]?.waypoint_order);
        directionsRenderer.setDirections(result);
        
        // Update route with optimized waypoint order if available
        if (result.routes[0]?.waypoint_order && result.routes[0].waypoint_order.length > 0) {
          console.log('[MapView] Optimized waypoint order:', result.routes[0].waypoint_order);
        }

        // Fit bounds if not navigating
        if (!isNavigating && result.routes[0]?.bounds) {
          map.fitBounds(result.routes[0].bounds, { padding: 80 });
        }
      } else {
        console.error('[MapView] DirectionsService failed:', status);
        // Fallback: decode and render polyline directly from server response
        if (route.overview_polyline?.points && (google.maps as any)?.geometry?.encoding?.decodePath) {
          const decodedPath = (google.maps as any).geometry.encoding.decodePath(route.overview_polyline.points);
          routePolylineRef.current = new google.maps.Polyline({
            path: decodedPath,
            strokeColor: '#4285F4', // Google's blue
            strokeOpacity: 0.8,
            strokeWeight: 5,
            map: map,
            zIndex: 1,
          });
          console.log('[MapView] Fallback: Rendered polyline path with', decodedPath.length, 'points');
          
          // Fit bounds
          if (!isNavigating) {
            const bounds = new google.maps.LatLngBounds();
            decodedPath.forEach((point: google.maps.LatLng) => bounds.extend(point));
            if (addedStops && addedStops.length > 0) {
              addedStops.forEach(stop => {
                if (stop.location) bounds.extend(new google.maps.LatLng(stop.location.lat, stop.location.lng));
              });
            }
            map.fitBounds(bounds, { padding: 80 });
          }
        }
      }
    });
  }, [route, isNavigating, mapLoaded, addedStops]);

  // Render custom numbered markers with category-specific icons for stops
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    // Clear existing waypoint markers
    waypointMarkersRef.current.forEach(marker => marker.setMap(null));
    waypointMarkersRef.current = [];
    
    // Clear start/end markers
    markersRef.current.forEach(marker => {
      if (marker !== userLocationMarkerRef.current) marker.setMap(null);
    });
    markersRef.current = userLocationMarkerRef.current ? [userLocationMarkerRef.current] : [];

    if (addedStops.length === 0 || !route?.legs?.[0]) return;

    const map = mapRef.current;

    // Add start marker
    const startLoc = route.legs[0].start_location;
    const startMarker = new google.maps.Marker({
      position: { lat: startLoc.lat, lng: startLoc.lng },
      map,
      title: 'Start',
      icon: {
        url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
        scaledSize: new google.maps.Size(32, 32),
      },
      zIndex: 50,
    });
    markersRef.current.push(startMarker);

    // Add destination marker
    const endLoc = route.legs[route.legs.length - 1].end_location;
    const endMarker = new google.maps.Marker({
      position: { lat: endLoc.lat, lng: endLoc.lng },
      map,
      title: 'Destination',
      icon: {
        url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
        scaledSize: new google.maps.Size(32, 32),
      },
      zIndex: 50,
    });
    markersRef.current.push(endMarker);

    // Category-specific icon URLs
    const getCategoryIcon = (category: string | undefined, type: string): string => {
      const cat = ((category || type) || '').toLowerCase();
      if (!cat) return 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png';
      if (cat.includes('chinese') || cat.includes('noodle')) return 'https://maps.google.com/mapfiles/ms/icons/restaurant.png';
      if (cat.includes('boba') || cat.includes('bubble') || cat.includes('tea')) return 'https://maps.google.com/mapfiles/ms/icons/coffeehouse.png';
      if (cat.includes('sushi') || cat.includes('japanese')) return 'https://maps.google.com/mapfiles/ms/icons/restaurant.png';
      if (cat.includes('gas') || cat.includes('fuel')) return 'https://maps.google.com/mapfiles/ms/icons/gas.png';
      if (cat.includes('coffee')) return 'https://maps.google.com/mapfiles/ms/icons/coffeehouse.png';
      if (cat.includes('restaurant') || cat.includes('food')) return 'https://maps.google.com/mapfiles/ms/icons/restaurant.png';
      if (cat.includes('scenic') || cat.includes('viewpoint')) return 'https://maps.google.com/mapfiles/ms/icons/camera.png';
      return 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png';
    };

    // Render numbered waypoint markers with category icons
    addedStops.forEach((stop, index) => {
      if (!stop.location) return;

      const marker = new google.maps.Marker({
        position: { lat: stop.location.lat, lng: stop.location.lng },
        map,
        title: `${index + 1}. ${stop.name}`,
        icon: {
          url: getCategoryIcon(stop.category || '', stop.type),
          scaledSize: new google.maps.Size(32, 32),
        },
        label: {
          text: `${index + 1}`,
          color: 'white',
          fontSize: '14px',
          fontWeight: 'bold',
        },
        zIndex: 100 + index,
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="padding:8px;">
          <strong>${index + 1}. ${stop.name}</strong><br>
          <span style="text-transform:capitalize;">${stop.category || stop.type}</span>
        </div>`,
      });

      marker.addListener('click', () => infoWindow.open(map, marker));
      waypointMarkersRef.current.push(marker);
    });

    console.log('[MapView] Rendered', addedStops.length, 'numbered waypoint markers');
  }, [addedStops, route, mapLoaded]);

  // Handle stops rendering (available stops - shown as smaller markers)
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    // Clear existing available stop markers (but keep waypoints)
    // We'll filter out waypoint markers
    const availableStopMarkers = markersRef.current.filter(marker => 
      marker !== userLocationMarkerRef.current &&
      !waypointMarkersRef.current.includes(marker)
    );
    availableStopMarkers.forEach(marker => marker.setMap(null));
    markersRef.current = markersRef.current.filter(marker => 
      marker === userLocationMarkerRef.current || waypointMarkersRef.current.includes(marker)
    );

    const colorMap = {
      gas: '#3B82F6',
      restaurant: '#F97316',
      scenic: '#A855F7',
    };

    const iconMap = {
      gas: '⛽',
      restaurant: '🍴',
      scenic: '🏞️',
    };

    // Render available stops (smaller, lighter markers)
    // Skip stops that are already added as waypoints
    const availableStops = stops.filter(stop => 
      !addedStops.some(added => added.name === stop.name)
    );

    availableStops.forEach((stop) => {
      if (!stop.location || !mapRef.current) return;

      const marker = new google.maps.Marker({
        position: { lat: stop.location.lat, lng: stop.location.lng },
        map: mapRef.current,
        title: stop.name,
        label: {
          text: iconMap[stop.type],
          fontSize: '14px',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: colorMap[stop.type],
          fillOpacity: 0.6,
          strokeColor: 'white',
          strokeWeight: 2,
        },
        zIndex: 1, // Lower z-index for available stops
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="padding: 8px;">
          <strong>${stop.name}</strong><br>
          <span style="text-transform: capitalize; color: ${colorMap[stop.type]};">${stop.type}</span><br>
          <small>Click "Add to Route" to include this stop</small>
        </div>`,
      });

      marker.addListener('click', () => {
        infoWindow.open(mapRef.current!, marker);
      });

      markersRef.current.push(marker);
    });
  }, [stops, addedStops, mapLoaded]);

  // Handle real-time location tracking during navigation
  useEffect(() => {
    if (!isNavigating || !mapRef.current || !mapLoaded) return;

    console.log('[MapView] Starting navigation mode with location tracking');

    // Request geolocation permission and start watching position
    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const newLocation = { lat: latitude, lng: longitude };

          console.log('[MapView] User location updated:', newLocation);
          setUserLocation(newLocation);

          if (!mapRef.current) return;
          const map = mapRef.current;

          // Create or update user location marker
          if (!userLocationMarkerRef.current) {
            userLocationMarkerRef.current = new google.maps.Marker({
              position: newLocation,
              map: map,
              title: 'Your Location',
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: '#3B82F6',
                fillOpacity: 1,
                strokeColor: 'white',
                strokeWeight: 3,
              },
            });
          } else {
            userLocationMarkerRef.current.setPosition(newLocation);
          }

          // Center map on user location
          map.panTo(newLocation);
          map.setZoom(18);

          // Calculate distance to next step and update instruction
          if (route?.legs?.[0]?.steps) {
            const steps = route.legs[0].steps;
            if (currentStep < steps.length) {
              const step = steps[currentStep];
              const stepLocation = step.start_location;
              const distance = calculateDistance(
                newLocation.lat,
                newLocation.lng,
                stepLocation.lat,
                stepLocation.lng
              );

              // If within 50 meters of next step, move to next instruction
              if (distance < 0.05) { // 50 meters
                const nextStepIndex = currentStep + 1;
                if (nextStepIndex < steps.length) {
                  setCurrentStep(nextStepIndex);
                  setNextInstruction(steps[nextStepIndex].html_instructions || "Continue on route");
                } else {
                  setNextInstruction("You have arrived at your destination");
                }
              } else {
                setNextInstruction(step.html_instructions || "Continue on route");
              }
            }
          }
        },
        (error) => {
          console.error('[MapView] Geolocation error:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );

      watchIdRef.current = watchId;

      // Cleanup function
      return () => {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        if (userLocationMarkerRef.current) {
          userLocationMarkerRef.current.setMap(null);
          userLocationMarkerRef.current = null;
        }
      };
    } else {
      console.error('[MapView] Geolocation not supported');
    }
  }, [isNavigating, route, currentStep, mapLoaded]);

  // Show user location marker when not navigating
  useEffect(() => {
    if (!mapRef.current || isNavigating || !userLocation || !mapLoaded) return;

    const map = mapRef.current;

    // Create or update user location marker
    if (!userLocationMarkerRef.current) {
      console.log('[MapView] Adding user location marker at:', userLocation);

      userLocationMarkerRef.current = new google.maps.Marker({
        position: userLocation,
        map: map,
        title: 'Your Location',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#3B82F6',
          fillOpacity: 0.8,
          strokeColor: 'white',
          strokeWeight: 2,
        },
      });
    } else {
      userLocationMarkerRef.current.setPosition(userLocation);
    }

    return () => {
      // Don't remove the marker here - only remove when component unmounts or enters navigation mode
    };
  }, [userLocation, isNavigating, mapLoaded]);

  // Toggle between overview and navigation view (like Google Maps)
  const toggleNavigationView = () => {
    if (!mapRef.current || !mapLoaded) return;

    const map = mapRef.current;

    if (!isNavigationView) {
      // Switch to navigation mode - tilted view following user location
      const centerLocation = userLocation || (route?.legs?.[0]?.start_location
        ? { lat: route.legs[0].start_location.lat, lng: route.legs[0].start_location.lng }
        : null);

      if (centerLocation) {
        // Navigation mode: tilted camera, higher zoom, centered on user
        map.setTilt(45); // Tilt map for 3D perspective
        map.setZoom(18); // Close-up zoom for navigation
        map.panTo(centerLocation);

        // Set map type to hybrid for better navigation context
        map.setMapTypeId(google.maps.MapTypeId.ROADMAP);
      }
      setIsNavigationView(true);
    } else {
      // Switch back to overview mode
      map.setTilt(0); // Flat map view

      if (route && route.bounds) {
        // If there's a route, fit to route bounds
        const bounds = new google.maps.LatLngBounds(
          new google.maps.LatLng(route.bounds.southwest.lat, route.bounds.southwest.lng),
          new google.maps.LatLng(route.bounds.northeast.lat, route.bounds.northeast.lng)
        );
        
        // Include waypoints in bounds
        if (addedStops && addedStops.length > 0) {
          addedStops.forEach(stop => {
            if (stop.location) {
              bounds.extend({ lat: stop.location.lat, lng: stop.location.lng });
            }
          });
        }
        
        map.fitBounds(bounds, { padding: 50 });
      } else {
        // Otherwise, zoom out to standard view
        map.setZoom(15);
      }
      setIsNavigationView(false);
    }
  };

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="relative w-full h-full bg-muted/30 rounded-md overflow-hidden border border-border flex items-center justify-center">
        <div className="text-center space-y-4 p-6">
          <Navigation className="w-12 h-12 mx-auto text-muted-foreground" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Google Maps API Key Required</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Add VITE_GOOGLE_MAPS_API_KEY to your environment variables
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full rounded-md overflow-hidden border border-border" style={{ minHeight: '500px' }}>
      <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: '500px' }} />

      {/* Navigation Instructions Overlay */}
      {isNavigating && nextInstruction && (
        <div className="absolute top-6 left-6 right-6 z-10">
          <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-xl p-4">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <Navigation className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <div
                  className="text-base font-medium text-foreground"
                  dangerouslySetInnerHTML={{ __html: nextInstruction }}
                />
                {route?.legs?.[0]?.steps?.[currentStep]?.distance?.text && (
                  <p className="text-sm text-muted-foreground mt-1">
                    In {route.legs[0].steps[currentStep].distance.text}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Mode Toggle Button */}
      <div className="absolute bottom-6 right-6 z-10">
        <Button
          onClick={toggleNavigationView}
          size="lg"
          className="shadow-lg"
          variant={isNavigationView ? "default" : "secondary"}
          disabled={!mapLoaded}
        >
          {isNavigationView ? (
            <>
              <MapIcon className="w-5 h-5 mr-2" />
              Overview
            </>
          ) : (
            <>
              <Navigation className="w-5 h-5 mr-2" />
              Navigation
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Calculate distance between two points in kilometers using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}
