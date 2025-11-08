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
  const markersRef = useRef<google.maps.Marker[]>([]);
  const waypointMarkersRef = useRef<google.maps.Marker[]>([]);
  const userLocationMarkerRef = useRef<google.maps.Marker | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
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
      if (mapRef.current) {
        mapRef.current = null;
      }
    };
  }, [initialUserLocation]);

  // Handle route rendering
  useEffect(() => {
    if (!mapRef.current || !route || !mapLoaded) return;

    const map = mapRef.current;
    console.log('[MapView] Rendering route on Google Maps');

    // Clear existing route markers (start/end) but preserve waypoint markers and user location
    const routeMarkers = markersRef.current.filter(marker => 
      marker !== userLocationMarkerRef.current &&
      !waypointMarkersRef.current.includes(marker)
    );
    routeMarkers.forEach(marker => marker.setMap(null));
    markersRef.current = markersRef.current.filter(marker => 
      marker === userLocationMarkerRef.current || waypointMarkersRef.current.includes(marker)
    );

    // Remove existing route polyline if it exists
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
    }

    // Decode and render polyline
    if (route.overview_polyline?.points) {
      const decodedPath = google.maps.geometry.encoding.decodePath(route.overview_polyline.points);

      const routePolyline = new google.maps.Polyline({
        path: decodedPath,
        strokeColor: '#3B82F6',
        strokeOpacity: 0.85,
        strokeWeight: 6,
        map: map,
        zIndex: 5, // Lower than waypoint markers
      });

      routePolylineRef.current = routePolyline;

      // Fit map to route bounds including waypoints (only when NOT navigating)
      if (!isNavigating) {
        const bounds = new google.maps.LatLngBounds();
        decodedPath.forEach((point) => {
          bounds.extend(point);
        });
        
        // Also include waypoints in bounds
        if (addedStops && addedStops.length > 0) {
          addedStops.forEach(stop => {
            if (stop.location) {
              bounds.extend({ lat: stop.location.lat, lng: stop.location.lng });
            }
          });
        }
        
        map.fitBounds(bounds, { padding: 80 });
      }
    }

    // Add start and end markers (only when NOT navigating and no waypoints)
    // When waypoints exist, they serve as the route markers
    if (route.legs && route.legs[0] && !isNavigating && (!addedStops || addedStops.length === 0)) {
      const startLoc = route.legs[0].start_location;

      // Start marker (green)
      const startMarker = new google.maps.Marker({
        position: { lat: startLoc.lat, lng: startLoc.lng },
        map: map,
        title: 'Start',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#10B981',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 3,
        },
        zIndex: 5,
      });

      markersRef.current.push(startMarker);

      // End marker (red)
      const endLoc = route.legs[route.legs.length - 1].end_location;
      const endMarker = new google.maps.Marker({
        position: { lat: endLoc.lat, lng: endLoc.lng },
        map: map,
        title: 'Destination',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#EF4444',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 3,
        },
        zIndex: 5,
      });

      markersRef.current.push(endMarker);
    } else if (route.legs && route.legs[0] && !isNavigating && addedStops && addedStops.length > 0) {
      // When waypoints exist, still show start and destination markers
      const startLoc = route.legs[0].start_location;
      const endLoc = route.legs[route.legs.length - 1].end_location;

      // Start marker (green) - smaller since waypoints are more prominent
      const startMarker = new google.maps.Marker({
        position: { lat: startLoc.lat, lng: startLoc.lng },
        map: map,
        title: 'Start',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#10B981',
          fillOpacity: 0.9,
          strokeColor: 'white',
          strokeWeight: 2,
        },
        zIndex: 5,
      });

      markersRef.current.push(startMarker);

      // End marker (red) - smaller since waypoints are more prominent
      const endMarker = new google.maps.Marker({
        position: { lat: endLoc.lat, lng: endLoc.lng },
        map: map,
        title: 'Destination',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#EF4444',
          fillOpacity: 0.9,
          strokeColor: 'white',
          strokeWeight: 2,
        },
        zIndex: 5,
      });

      markersRef.current.push(endMarker);
    }
  }, [route, isNavigating, mapLoaded, addedStops]);

  // Handle added stops rendering (waypoints - shown as prominent numbered markers)
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    // Clear existing waypoint markers
    waypointMarkersRef.current.forEach(marker => {
      marker.setMap(null);
    });
    waypointMarkersRef.current = [];

    if (addedStops.length === 0) return;

    console.log('[MapView] Rendering waypoint markers for added stops:', addedStops.length);

    const colorMap: Record<string, string> = {
      gas: '#2563EB',
      restaurant: '#EA580C',
      scenic: '#9333EA',
    };

    // Render added stops as waypoint markers (larger, more prominent, numbered)
    addedStops.forEach((stop, index) => {
      if (!stop.location || !mapRef.current) return;

      const marker = new google.maps.Marker({
        position: { lat: stop.location.lat, lng: stop.location.lng },
        map: mapRef.current,
        title: `Waypoint ${index + 1}: ${stop.name}`,
        label: {
          text: `${index + 1}`,
          fontSize: '12px',
          fontWeight: 'bold',
          color: 'white',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 18,
          fillColor: colorMap[stop.type] || '#3B82F6',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 3,
        },
        zIndex: 100, // Highest z-index for waypoint markers
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="padding: 8px;">
          <strong>Waypoint ${index + 1}: ${stop.name}</strong><br>
          <span style="text-transform: capitalize; color: ${colorMap[stop.type] || '#3B82F6'};">${stop.category || stop.type}</span><br>
          <small style="color: #10B981; font-weight: bold;">✓ Added to route</small>
        </div>`,
      });

      marker.addListener('click', () => {
        infoWindow.open(mapRef.current!, marker);
      });

      waypointMarkersRef.current.push(marker);
    });

    // Note: Bounds fitting is handled in route rendering effect to include route polyline
  }, [addedStops, mapLoaded]);

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

      if (route) {
        // If there's a route, fit to route bounds
        const decodedPath = google.maps.geometry.encoding.decodePath(route.overview_polyline.points);
        const bounds = new google.maps.LatLngBounds();
        decodedPath.forEach((point) => {
          bounds.extend(point);
        });
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
