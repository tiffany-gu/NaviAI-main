import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Navigation, MapPin } from "lucide-react";

interface RouteComparisonCardProps {
  eta: string;
  stops: number;
  distance?: string;
  addedStops?: Array<{
    type: string;
    name: string;
    location: { lat: number; lng: number };
    category?: string;
  }>;
  onStartNavigation?: () => void;
}

export default function RouteComparisonCard({
  eta,
  stops,
  distance,
  addedStops,
  onStartNavigation,
}: RouteComparisonCardProps) {
  return (
    <Card className="p-4 space-y-3" data-testid="card-route-comparison">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Estimated Travel Time
        </p>
        <div className="flex items-baseline gap-2">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <p className="text-3xl font-semibold tabular-nums">{eta}</p>
        </div>
        {distance && (
          <p className="text-sm text-muted-foreground ml-7">
            {distance} miles total
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm pt-2 border-t border-border">
        <MapPin className="w-4 h-4 text-muted-foreground" />
        <span className="text-foreground font-medium">{stops} {stops === 1 ? 'stop' : 'stops'} along the way</span>
      </div>
      {addedStops && addedStops.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            Route Stops
          </p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {addedStops.map((stop, index) => (
              <div key={index} className="flex items-center gap-2 text-xs">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="text-foreground truncate">{stop.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {onStartNavigation && (
        <div className="pt-2">
          <Button
            onClick={onStartNavigation}
            className="w-full"
            size="lg"
          >
            <Navigation className="w-4 h-4 mr-2" />
            Start Navigation
          </Button>
        </div>
      )}
    </Card>
  );
}
