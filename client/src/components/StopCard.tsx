import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Fuel, Utensils, Mountain, Star, Clock, MapPin, ShoppingCart, Phone, Globe, DollarSign, Users, ExternalLink } from "lucide-react";
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
  // Enhanced Google Places details
  address?: string;
  phone?: string;
  website?: string;
  priceLevel?: number; // 1-4 ($, $$, $$$, $$$$)
  userRatingsTotal?: number;
  photoUrl?: string; // First photo from Google Places
  openNow?: boolean;
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
  address,
  phone,
  website,
  priceLevel,
  userRatingsTotal,
  photoUrl,
  openNow,
  onAddToRoute,
  onSkip,
}: StopCardProps) {
  const [isOpen, setIsOpen] = useState(true); // Default to open to showcase grounded justifications
  // Normalize type to lowercase and ensure we have a valid icon
  const normalizedType = type.toLowerCase() as StopType;
  const Icon = iconMap[normalizedType] || iconMap.gas; // Fallback to gas icon if type is invalid
  const displayType = normalizedType;

  // Format price level as $ symbols
  const getPriceDisplay = (level?: number) => {
    if (!level) return null;
    return '$'.repeat(level);
  };

  return (
    <Card className="overflow-visible border-l-4 border-l-primary/30" data-testid={`card-stop-${displayType}`}>
      <div className="p-4 space-y-3">
        {/* Photo Header (if available) */}
        {photoUrl && (
          <div className="relative h-32 -mx-4 -mt-4 mb-3 rounded-t-lg overflow-hidden">
            <img
              src={photoUrl}
              alt={name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-full bg-white/90 backdrop-blur-sm ${colorMap[displayType] || colorMap.gas}`}>
                  <Icon className="w-4 h-4" />
                </div>
                {openNow !== undefined && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${openNow ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                    {openNow ? 'Open now' : 'Closed'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-white backdrop-blur-sm bg-black/30 px-2 py-1 rounded-full">
                <MapPin className="w-3 h-3" />
                <span>{distanceOffRoute}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          {!photoUrl && (
            <div className={`mt-0.5 ${colorMap[displayType] || colorMap.gas}`}>
              <Icon className="w-5 h-5" />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="text-sm font-semibold truncate" data-testid={`text-stop-name-${displayType}`}>{name}</h3>
            <p className="text-sm text-muted-foreground">{category}</p>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {rating && (
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span className="font-medium">{rating}</span>
                  {userRatingsTotal && (
                    <span className="text-muted-foreground">({userRatingsTotal.toLocaleString()})</span>
                  )}
                </div>
              )}
              {priceLevel && (
                <div className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-green-600 dark:text-green-400">{getPriceDisplay(priceLevel)}</span>
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
          {!photoUrl && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <MapPin className="w-3 h-3" />
              <span>{distanceOffRoute}</span>
            </div>
          )}
        </div>

        {/* Additional Details Section */}
        {(address || phone || website) && (
          <div className="border-t pt-3 space-y-2">
            {address && (
              <div className="flex items-start gap-2 text-xs">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-muted-foreground">{address}</span>
              </div>
            )}
            {phone && (
              <a
                href={`tel:${phone}`}
                className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Phone className="w-3.5 h-3.5 shrink-0" />
                <span>{phone}</span>
              </a>
            )}
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Website</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            )}
          </div>
        )}

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
