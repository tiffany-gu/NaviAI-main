import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Fuel, Utensils, Mountain, Star, Clock, MapPin, ShoppingCart } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

type StopType = "gas" | "restaurant" | "scenic" | "grocery" | "coffee" | "tea" | "dessert" | "bubbleTea";

interface StopCardProps {
  type: StopType;
  name: string;
  category: string;
  rating?: number;
  hours?: string;
  distanceOffRoute: string;
  reason: string;
  location?: { lat: number; lng: number };
  verifiedAttributes?: string[]; // Grounded attributes verified from Google Maps
  recommendedDuration?: string; // e.g., "30 min"
  maxDuration?: string; // e.g., "60 min"
  onAddToRoute?: (stop: { type: StopType; name: string; location: { lat: number; lng: number } }) => void;
  onSkip?: () => void;
}

const iconMap = {
  gas: Fuel,
  restaurant: Utensils,
  scenic: Mountain,
  grocery: ShoppingCart,
  coffee: Utensils, // Use Utensils as fallback for coffee
  tea: Utensils, // Use Utensils as fallback for tea
  dessert: Utensils, // Use Utensils as fallback for dessert
  bubbleTea: Utensils, // Use Utensils as fallback for bubbleTea
};

const colorMap = {
  gas: "text-blue-600 dark:text-blue-400",
  restaurant: "text-orange-600 dark:text-orange-400",
  scenic: "text-purple-600 dark:text-purple-400",
  grocery: "text-green-600 dark:text-green-400",
  coffee: "text-amber-600 dark:text-amber-400",
  tea: "text-emerald-600 dark:text-emerald-400",
  dessert: "text-pink-600 dark:text-pink-400",
  bubbleTea: "text-rose-600 dark:text-rose-400",
};

export default function StopCard({
  type,
  name,
  category,
  rating,
  hours,
  distanceOffRoute,
  reason,
  location,
  verifiedAttributes,
  recommendedDuration,
  maxDuration,
  onAddToRoute,
  onSkip,
}: StopCardProps) {
  const [isOpen, setIsOpen] = useState(true); // Default to open to showcase grounded justifications
  // Normalize type to lowercase and ensure we have a valid icon
  const normalizedType = type.toLowerCase() as StopType;
  const Icon = iconMap[normalizedType] || iconMap.gas; // Fallback to gas icon if type is invalid
  const displayType = normalizedType;

  return (
    <Card className="overflow-visible border-l-4 border-l-primary/30" data-testid={`card-stop-${displayType}`}>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${colorMap[displayType] || colorMap.gas}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="text-sm font-semibold truncate" data-testid={`text-stop-name-${displayType}`}>{name}</h3>
            <p className="text-sm text-muted-foreground">{category}</p>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {rating && (
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span className="font-medium">{rating}</span>
                </div>
              )}
              {hours && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-muted-foreground">{hours}</span>
                </div>
              )}
              {/* Display time allocation if available */}
              {recommendedDuration && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  <Clock className="w-3 h-3" />
                  <span className="font-medium">Recommended: {recommendedDuration}</span>
                  {maxDuration && (
                    <span className="text-blue-600 dark:text-blue-400"> (max: {maxDuration})</span>
                  )}
                </div>
              )}
            </div>
            {/* Display verified attributes prominently */}
            {verifiedAttributes && verifiedAttributes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {verifiedAttributes.map((attr, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    title="Verified from Google Maps data"
                  >
                    ✓ {attr}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <MapPin className="w-3 h-3" />
            <span>{distanceOffRoute}</span>
          </div>
        </div>

        {/* Grounded Justification - Prominently displayed by default */}
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between h-8 font-semibold"
              data-testid={`button-toggle-reason-${displayType}`}
            >
              <span className="text-xs font-semibold text-primary">Why this stop?</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="bg-primary/5 border border-primary/10 rounded-md p-3">
              <p className="text-sm leading-relaxed">
                {reason}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => {
              if (onAddToRoute && location) {
                onAddToRoute({ type: displayType, name, location });
              }
            }}
            disabled={!location || !onAddToRoute}
            data-testid={`button-add-stop-${displayType}`}
          >
            Add to Route
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (onSkip) {
                onSkip();
              }
            }}
            data-testid={`button-skip-stop-${displayType}`}
          >
            Skip
          </Button>
        </div>
      </div>
    </Card>
  );
}
