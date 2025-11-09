import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Navigation, MapPin, X } from "lucide-react";

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
  onRemoveStop?: (stop: { type: string; name: string; location: { lat: number; lng: number }; category?: string }) => void;
}

export default function RouteComparisonCard({
  eta,
  stops,
  distance,
  addedStops,
  onStartNavigation,
  onRemoveStop,
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
            {addedStops.map((stop, index) => {
              // Get category emoji
              const getCategoryEmoji = (cat: string | undefined) => {
                if (!cat) return '📍';
                const category = cat.toLowerCase();
                if (category.includes('chinese') || category.includes('noodle')) return '🍜';
                if (category.includes('boba') || category.includes('bubble') || category.includes('tea')) return '🧋';
                if (category.includes('sushi') || category.includes('japanese')) return '🍣';
                if (category.includes('gas') || category.includes('fuel')) return '⛽';
                if (category.includes('coffee')) return '☕';
                if (category.includes('restaurant') || category.includes('food')) return '🍽️';
                if (category.includes('scenic') || category.includes('viewpoint')) return '📸';
                return '📍';
              };

              return (
                <div key={index} className="flex items-center gap-2 text-xs group">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex-shrink-0">
                    {index + 1}
                  </span>
                  <span className="text-base flex-shrink-0">{getCategoryEmoji(stop.category || stop.type)}</span>
                  <span className="text-foreground truncate flex-1">{stop.name}</span>
                  {onRemoveStop && (
                    <button
                      onClick={() => onRemoveStop(stop)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
                      title="Remove from route"
                    >
                      <X className="w-3 h-3 text-destructive" />
                    </button>
                  )}
                </div>
              );
            })}
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
