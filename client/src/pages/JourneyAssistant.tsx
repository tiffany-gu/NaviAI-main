import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import AppHeader from "@/components/AppHeader";
import ChatMessage from "@/components/ChatMessage";
import MessageInput from "@/components/MessageInput";
import RouteComparisonCard from "@/components/RouteComparisonCard";
import StopCard from "@/components/StopCard";
import MapView from "@/components/MapView";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useMicrophone } from "@/hooks/useMicrophone";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: string;
}

interface Stop {
  type: 'gas' | 'restaurant' | 'scenic';
  name: string;
  category: string;
  rating?: number;
  priceLevel?: string;
  hours?: string;
  distanceOffRoute: string;
  reason: string;
  location?: any;
  verifiedAttributes?: string[]; // Grounded attributes verified from Google Maps
}

export default function JourneyAssistant() {
  const [isNavigating, setIsNavigating] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Hi! I'm your Journey Assistant. Tell me where you're headed and I'll help you plan the perfect route with gas stops, restaurants, and scenic viewpoints along the way. You can say something like 'to Boston' and I'll use your current location as the starting point!",
      isUser: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [tripRequestId, setTripRequestId] = useState<string | null>(null);
  const [routeData, setRouteData] = useState<any>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [addedStops, setAddedStops] = useState<Array<{ type: string; name: string; location: { lat: number; lng: number }; category?: string }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Enhanced voice input with wake word detection and silence monitoring
  const {
    isListening,
    isRecording,
    transcription,
    error: micError,
    toggleListening,
    clearTranscription,
  } = useMicrophone({
    enableWakeWord: true, // Set to true to enable "Hey Journey" wake word
    onTranscript: (text) => {
      console.log('[JourneyAssistant] Voice transcript received:', text);
      handleSendMessage(text);
      clearTranscription();
    },
  });

  // Get user location on app load
  useEffect(() => {
    if ('geolocation' in navigator) {
      console.log('[JourneyAssistant] Requesting user location on app load');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(location);
          console.log('[JourneyAssistant] User location detected:', location);
        },
        (error) => {
          console.error('[JourneyAssistant] Error getting user location:', error);
          // Don't show toast on initial load to avoid annoying users
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // Cache for 5 minutes
        }
      );
    } else {
      console.warn('[JourneyAssistant] Geolocation not supported in this browser');
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, stops]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      // Check if message is asking for route to a destination (uses current location)
      const toPattern = /(?:plan\s+(?:a\s+)?(?:trip|route)\s+)?to\s+[a-zA-Z\s,]+/i;
      const fromPattern = /from\s+[a-zA-Z\s,]+\s+to\s+[a-zA-Z\s,]+/i;
      const myLocationPattern = /(my\s+(current\s+)?location|current\s+location|from\s+here|start\s+here|starting\s+from\s+here)/i;

      // Determine if we should use current location as the starting point
      // Use current location when:
      // 1. User explicitly mentions "my location", "current location", etc.
      // 2. User asks for route "to X" without specifying "from"
      // 3. No "from" pattern is detected at all
      const shouldUseCurrentLocation =
        (toPattern.test(message) && !fromPattern.test(message)) ||
        myLocationPattern.test(message) ||
        !fromPattern.test(message); // Always try to use current location if no "from" is specified

      let locationToSend = null;
      if (shouldUseCurrentLocation) {
        if (userLocation) {
          locationToSend = userLocation;
          console.log('[chatMutation] Using stored user location as starting point:', locationToSend);
        } else if ('geolocation' in navigator) {
          // Fallback: try to get location if not already stored
          try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
              });
            });
            locationToSend = {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            };
            setUserLocation(locationToSend); // Store for future use
            console.log('[chatMutation] Got fresh user location as starting point:', locationToSend);
          } catch (error) {
            console.error('[chatMutation] Could not get user location:', error);
            // If we can't get location and user didn't specify "from", show a helpful message
            if (!fromPattern.test(message)) {
              toast({
                title: "Location Access Needed",
                description: "Please allow location access or specify a starting location (e.g., 'from Atlanta to...')",
                variant: "destructive",
              });
            }
          }
        }
      }

      const res = await apiRequest('POST', '/api/chat', { message, tripRequestId, userLocation: locationToSend });
      return await res.json();
    },
    onSuccess: (data: any) => {
      const aiMessage: Message = {
        id: Date.now().toString(),
        text: data.response,
        isUser: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMessage]);

      if (data.tripRequestId) {
        setTripRequestId(data.tripRequestId);
      }

      if (!data.hasMissingInfo && data.tripRequestId) {
        planRouteMutation.mutate(data.tripRequestId);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const planRouteMutation = useMutation({
    mutationFn: async (tripId: string) => {
      const res = await apiRequest('POST', '/api/plan-route', { tripRequestId: tripId });
      return await res.json();
    },
    onSuccess: (data: any, variables: string) => {
      console.log('[planRouteMutation] Route data received, legs:', data.selectedRoute?.legs?.length || 0);
      setRouteData(data.selectedRoute);
      
      const routeMessage: Message = {
        id: Date.now().toString(),
        text: "I've found your route! Let me find some great stops along the way...",
        isUser: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, routeMessage]);

      findStopsMutation.mutate(variables);
    },
    onError: (error: Error) => {
      toast({
        title: "Route Planning Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const findStopsMutation = useMutation({
    mutationFn: async (tripId: string) => {
      const res = await apiRequest('POST', '/api/find-stops', { tripRequestId: tripId });
      return await res.json();
    },
    onSuccess: (data: any) => {
      setStops(data.stops || []);
      
      // Update route if a new route with waypoints was returned
      // When stops are found, they're automatically added to the route by the backend
      // So we should track which stops were automatically added
      if (data.route) {
        console.log('[JourneyAssistant] Updating route with waypoints from find-stops');
        console.log('[JourneyAssistant] Route legs:', data.route.legs?.length || 0);
        data.route.legs?.forEach((leg: any, i: number) => {
          console.log(`[JourneyAssistant] Leg ${i + 1}: ${leg.start_address} → ${leg.end_address}`);
        });
        setRouteData(data.route);
        
        // If the backend automatically recalculated the route with stops,
        // we should mark those stops as "added" so they show as waypoints
        // However, for now, we'll let users manually add stops via the UI
        // The route already includes them as waypoints in the backend response
        
        const routeMessage: Message = {
          id: Date.now().toString(),
          text: `Route recalculated to include ${data.stops?.length || 0} stop${data.stops?.length !== 1 ? 's' : ''}. The directions now go through each stop in order.`,
          isUser: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, routeMessage]);
      }
      
      if (data.stops && data.stops.length > 0) {
        const stopsMessage: Message = {
          id: Date.now().toString(),
          text: `Found ${data.stops.length} recommended stop${data.stops.length > 1 ? 's' : ''} along your route! Click "Add to Route" to include them in your directions.`,
          isUser: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, stopsMessage]);
      } else {
        const noStopsMessage: Message = {
          id: Date.now().toString(),
          text: "I couldn't find any stops along this route. Try adding preferences like restaurant types or scenic views to get better recommendations.",
          isUser: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, noStopsMessage]);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error Finding Stops",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = (text: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      isUser: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMessage]);
    chatMutation.mutate(text);
  };

  const handleVoiceClick = async () => {
    await toggleListening();
  };

  // Show error toast when microphone error occurs
  useEffect(() => {
    if (micError) {
      toast({
        title: "Voice Input Error",
        description: micError,
        variant: "destructive",
      });
    }
  }, [micError, toast]);

  const calculateRouteComparison = () => {
    if (!routeData || !routeData.legs) return null;

    // Calculate total duration from all legs (route already includes waypoints)
    const totalDuration = routeData.legs.reduce(
      (sum: number, leg: any) => sum + (leg.duration?.value || 0),
      0
    );

    // Add estimated time for stops (10 minutes per added stop for actual stops)
    const totalWithStops = totalDuration + (addedStops.length * 600); // 600 seconds = 10 minutes per stop

    const hours = Math.floor(totalWithStops / 3600);
    const minutes = Math.floor((totalWithStops % 3600) / 60);

    let eta = '';
    if (hours > 0) {
      eta = `${hours}h ${minutes}m`;
    } else {
      eta = `${minutes}m`;
    }

    // Calculate total distance
    const totalDistance = routeData.legs.reduce(
      (sum: number, leg: any) => sum + (leg.distance?.value || 0),
      0
    );
    const distanceMiles = (totalDistance / 1609.34).toFixed(1);

    return {
      eta,
      stops: addedStops.length,
      distance: distanceMiles,
      totalDuration: totalWithStops,
    };
  };

  const handleStartNavigation = () => {
    setIsNavigating(true);
    toast({
      title: "Navigation Started",
      description: "Follow the route on the map. Drive safely!",
    });
  };

  const handleAddStopToRoute = (stop: { type: string; name: string; location: { lat: number; lng: number } }) => {
    console.log('[handleAddStopToRoute] Adding stop to route:', stop);

    // Find the full stop details to preserve type and category
    const fullStop = stops.find(s => s.name === stop.name);
    const stopToAdd = {
      type: stop.type,
      name: stop.name,
      location: stop.location,
      category: fullStop?.category || stop.type,
    };

    // Add the stop to addedStops (this will be used to show waypoint markers)
    const updatedAddedStops = [...addedStops, stopToAdd];
    setAddedStops(updatedAddedStops);

    // Remove the stop from the available stops list
    setStops(prev => prev.filter(s => s.name !== stop.name));

    // Show toast
    toast({
      title: "Stop Added",
      description: `${stop.name} has been added to your route. Recalculating directions...`,
    });

    // Trigger route recalculation with waypoints (include all previously added stops + new one)
    if (tripRequestId) {
      recalculateRouteMutation.mutate({
        tripRequestId,
        waypoints: updatedAddedStops.map(s => ({
          name: s.name,
          location: s.location,
        })),
      });
    }
  };

  const handleSkipStop = (stop: { type: string; name: string; location?: { lat: number; lng: number } }) => {
    console.log('[handleSkipStop] Skipping stop:', stop);

    // Check if this stop was already added to the route
    const isInRoute = addedStops.some(s => s.name === stop.name);

    if (isInRoute) {
      // Remove from addedStops and recalculate route
      const updatedAddedStops = addedStops.filter(s => s.name !== stop.name);
      setAddedStops(updatedAddedStops);

      toast({
        title: "Stop Removed",
        description: `${stop.name} has been removed from your route. Recalculating directions...`,
      });

      // Recalculate route without this stop
      if (tripRequestId) {
        if (updatedAddedStops.length > 0) {
          // Still have stops, recalculate with remaining stops
          recalculateRouteMutation.mutate({
            tripRequestId,
            waypoints: updatedAddedStops.map(s => ({
              name: s.name,
              location: s.location,
            })),
          });
        } else {
          // No more stops, re-plan the basic route
          planRouteMutation.mutate(tripRequestId);
        }
      }
    } else {
      // Just remove from available stops list
      setStops(prev => prev.filter(s => s.name !== stop.name));
      
      toast({
        title: "Stop Skipped",
        description: `${stop.name} has been removed from suggestions.`,
      });
    }
  };

  const recalculateRouteMutation = useMutation({
    mutationFn: async ({ tripRequestId, waypoints }: { tripRequestId: string; waypoints: Array<{ name: string; location: { lat: number; lng: number } }> }) => {
      console.log('[recalculateRoute] Making request with:', { tripRequestId, waypoints });

      try {
        const res = await apiRequest('POST', '/api/recalculate-route', { tripRequestId, waypoints });

        console.log('[recalculateRoute] Response status:', res.status);
        console.log('[recalculateRoute] Response headers:', res.headers);

        if (!res.ok) {
          const errorText = await res.text();
          console.error('[recalculateRoute] Error response:', errorText);
          throw new Error(`Server returned ${res.status}: ${errorText}`);
        }

        const data = await res.json();
        console.log('[recalculateRoute] Success response:', data);
        return data;
      } catch (error) {
        console.error('[recalculateRoute] Request failed:', error);
        throw error;
      }
    },
    onSuccess: (data: any, variables: { tripRequestId: string; waypoints: Array<{ name: string; location: { lat: number; lng: number } }> }) => {
      console.log('[recalculateRoute] Route updated with waypoints');
      console.log('[recalculateRoute] Route legs:', data.route?.legs?.length || 0);
      console.log('[recalculateRoute] Optimized waypoint_order:', data.route?.waypoint_order);
      data.route?.legs?.forEach((leg: any, i: number) => {
        console.log(`[recalculateRoute] Leg ${i + 1}: ${leg.start_address} → ${leg.end_address}`);
      });
      setRouteData(data.route);
      
      // Update addedStops with optimized order from backend
      if (data.waypoints && data.waypoints.length > 0) {
        const reorderedStops = data.waypoints.map((wp: any) => {
          const existingStop = addedStops.find(s => s.name === wp.name);
          return existingStop || {
            type: 'waypoint',
            name: wp.name,
            location: wp.location,
            category: 'stop',
          };
        });
        setAddedStops(reorderedStops);
        console.log('[recalculateRoute] Stops reordered per Google optimization');
      }
      
      // Use the waypoints from response (already reordered)
      const stopCount = data.waypoints?.length || variables.waypoints.length;
      
      // Calculate updated travel time
      const totalDuration = data.route?.legs?.reduce((sum: number, leg: any) => sum + (leg.duration?.value || 0), 0) || 0;
      const hours = Math.floor(totalDuration / 3600);
      const minutes = Math.floor((totalDuration % 3600) / 60);
      const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      
      const totalDistance = data.route?.legs?.reduce((sum: number, leg: any) => sum + (leg.distance?.value || 0), 0) || 0;
      const distanceMiles = (totalDistance / 1609.34).toFixed(1);
      
      // Add 10 minutes per stop for stop time
      const totalTimeWithStops = totalDuration + (stopCount * 600);
      const hoursWithStops = Math.floor(totalTimeWithStops / 3600);
      const minutesWithStops = Math.floor((totalTimeWithStops % 3600) / 60);
      const durationWithStopsText = hoursWithStops > 0 ? `${hoursWithStops}h ${minutesWithStops}m` : `${minutesWithStops}m`;
      
      toast({
        title: "Route Updated",
        description: `Route recalculated! ${distanceMiles} miles, ${durationWithStopsText} total (${stopCount} stop${stopCount !== 1 ? 's' : ''})`,
      });
      
      // Add message to chat about the route update
      const routeUpdateMessage: Message = {
        id: Date.now().toString(),
        text: `Route updated! Your journey now includes ${stopCount} stop${stopCount !== 1 ? 's' : ''}. Estimated travel time: ${durationWithStopsText} (including ${stopCount * 10} minutes for stops), Total distance: ${distanceMiles} miles.`,
        isUser: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, routeUpdateMessage]);
    },
    onError: (error: Error) => {
      console.error('[recalculateRoute] Mutation error:', error);
      toast({
        title: "Route Recalculation Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const comparison = calculateRouteComparison();

  return (
    <div className="flex flex-col h-screen bg-background">
      <AppHeader isListening={isListening} isRecording={isRecording} />

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[40%] border-r border-border flex flex-col">
          <ScrollArea className="flex-1 p-6">
            <div ref={scrollRef} className="space-y-4">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message.text}
                  isUser={message.isUser}
                  timestamp={message.timestamp}
                />
              ))}

              {comparison && (
                <div className="py-2" data-testid="container-route-comparison">
                  <RouteComparisonCard
                    eta={comparison.eta}
                    stops={comparison.stops}
                    distance={comparison.distance}
                    addedStops={addedStops}
                    onStartNavigation={handleStartNavigation}
                    onRemoveStop={handleSkipStop}
                  />
                </div>
              )}
              
              {stops.length > 0 && (
                <div className="space-y-3" data-testid="container-stops">
                  {stops.map((stop, index) => (
                    <StopCard
                      key={index}
                      {...stop}
                      onAddToRoute={handleAddStopToRoute}
                      onSkip={() => handleSkipStop(stop)}
                    />
                  ))}
                </div>
              )}

              {(chatMutation.isPending || planRouteMutation.isPending || findStopsMutation.isPending) && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-sm">
                    {chatMutation.isPending && "Thinking..."}
                    {planRouteMutation.isPending && "Planning route..."}
                    {findStopsMutation.isPending && "Finding stops..."}
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>
          
          <div className="p-6 border-t border-border bg-background">
            <MessageInput
              onSendMessage={handleSendMessage}
              onVoiceClick={handleVoiceClick}
              isRecording={isRecording}
            />
          </div>
        </div>
        
        <div className="flex-1 p-6 flex flex-col">
              <MapView
                route={routeData}
                stops={stops}
                addedStops={addedStops}
                isNavigating={isNavigating}
                userLocation={userLocation}
              />
        </div>
      </div>
    </div>
  );
}
