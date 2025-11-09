/**
 * Utility functions for time-constrained route planning
 */

export interface TimeCalculationResult {
  totalTravelTimeMinutes: number;
  availableTimeForStopsMinutes: number;
  recommendedStopDurations: Map<string, number>; // stop name -> recommended minutes
  maxStopDurations: Map<string, number>; // stop name -> max minutes
  isFeasible: boolean;
  warning?: string;
}

/**
 * Calculate how much time can be spent at each stop given an arrival deadline
 */
export function calculateTimeAllocations(
  arrivalDeadline: Date,
  departureTime: Date | null,
  routeDurationMinutes: number,
  stops: Array<{
    name: string;
    type: string;
    travelTimeFromPreviousMinutes: number;
    travelTimeToNextMinutes: number;
  }>,
  bufferMinutes: number = 10 // Safety buffer for arrival
): TimeCalculationResult {
  const now = new Date();
  const startTime = departureTime || now;
  
  // Calculate total available time
  const totalAvailableMinutes = Math.max(0, (arrivalDeadline.getTime() - startTime.getTime()) / (1000 * 60));
  
  // Calculate total travel time (route duration + time to/from stops)
  let totalTravelTimeMinutes = routeDurationMinutes;
  stops.forEach((stop, index) => {
    if (index === 0) {
      // First stop: add time to get to it
      totalTravelTimeMinutes += stop.travelTimeFromPreviousMinutes;
    }
    if (index === stops.length - 1) {
      // Last stop: add time to get to destination
      totalTravelTimeMinutes += stop.travelTimeToNextMinutes;
    } else {
      // Intermediate stops: add time between stops
      totalTravelTimeMinutes += stop.travelTimeFromPreviousMinutes + stop.travelTimeToNextMinutes;
    }
  });
  
  // Calculate available time for stops (total time - travel time - buffer)
  const availableTimeForStopsMinutes = Math.max(0, totalAvailableMinutes - totalTravelTimeMinutes - bufferMinutes);
  
  // Check if route is feasible
  const isFeasible = totalTravelTimeMinutes + bufferMinutes <= totalAvailableMinutes;
  
  let warning: string | undefined;
  if (!isFeasible) {
    const shortageMinutes = (totalTravelTimeMinutes + bufferMinutes) - totalAvailableMinutes;
    warning = `Route may not be feasible. Travel time (${Math.round(totalTravelTimeMinutes)} min) exceeds available time by ${Math.round(shortageMinutes)} minutes.`;
  } else if (availableTimeForStopsMinutes < 5) {
    warning = `Very little time available for stops (${Math.round(availableTimeForStopsMinutes)} min). Consider leaving earlier or arriving later.`;
  }
  
  // Allocate time to stops based on type
  const recommendedStopDurations = new Map<string, number>();
  const maxStopDurations = new Map<string, number>();
  
  if (stops.length === 0) {
    return {
      totalTravelTimeMinutes,
      availableTimeForStopsMinutes,
      recommendedStopDurations,
      maxStopDurations,
      isFeasible,
      warning,
    };
  }
  
  // Default time allocations by stop type (in minutes)
  const defaultDurations: Record<string, { recommended: number; max: number }> = {
    gas: { recommended: 10, max: 20 },
    grocery: { recommended: 30, max: 60 },
    restaurant: { recommended: 45, max: 90 },
    scenic: { recommended: 15, max: 30 },
    coffee: { recommended: 15, max: 25 },
    tea: { recommended: 15, max: 25 },
    dessert: { recommended: 20, max: 40 },
    bubbleTea: { recommended: 15, max: 25 },
  };
  
  // Calculate total recommended and max durations
  let totalRecommended = 0;
  let totalMax = 0;
  stops.forEach(stop => {
    const durations = defaultDurations[stop.type] || { recommended: 20, max: 40 };
    totalRecommended += durations.recommended;
    totalMax += durations.max;
    recommendedStopDurations.set(stop.name, durations.recommended);
    maxStopDurations.set(stop.name, durations.max);
  });
  
  // If available time is less than recommended, scale down proportionally
  if (availableTimeForStopsMinutes < totalRecommended && totalRecommended > 0) {
    const scaleFactor = availableTimeForStopsMinutes / totalRecommended;
    stops.forEach(stop => {
      const currentRecommended = recommendedStopDurations.get(stop.name) || 20;
      const newRecommended = Math.max(5, Math.round(currentRecommended * scaleFactor));
      recommendedStopDurations.set(stop.name, newRecommended);
    });
  }
  
  // If available time is more than recommended but less than max, increase proportionally up to max
  if (availableTimeForStopsMinutes > totalRecommended && availableTimeForStopsMinutes < totalMax && totalRecommended > 0) {
    const extraTime = availableTimeForStopsMinutes - totalRecommended;
    const maxExtra = totalMax - totalRecommended;
    if (maxExtra > 0) {
      const extraScaleFactor = extraTime / maxExtra;
      stops.forEach(stop => {
        const currentRecommended = recommendedStopDurations.get(stop.name) || 20;
        const currentMax = maxStopDurations.get(stop.name) || 40;
        const extra = (currentMax - currentRecommended) * extraScaleFactor;
        recommendedStopDurations.set(stop.name, Math.round(currentRecommended + extra));
      });
    }
  }
  
  // Ensure max durations don't exceed available time
  if (availableTimeForStopsMinutes < totalMax) {
    const scaleFactor = availableTimeForStopsMinutes / totalMax;
    stops.forEach(stop => {
      const currentMax = maxStopDurations.get(stop.name) || 40;
      const newMax = Math.max(5, Math.round(currentMax * scaleFactor));
      maxStopDurations.set(stop.name, newMax);
    });
  }
  
  return {
    totalTravelTimeMinutes,
    availableTimeForStopsMinutes,
    recommendedStopDurations,
    maxStopDurations,
    isFeasible,
    warning,
  };
}

/**
 * Parse a time string like "5:00 PM" or "17:00" into a Date object for today
 */
export function parseTimeString(timeString: string, referenceDate: Date = new Date()): Date | null {
  // Handle "5:00 PM" format
  const pmAmMatch = timeString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (pmAmMatch) {
    let hour = parseInt(pmAmMatch[1]);
    const minute = parseInt(pmAmMatch[2]);
    const ampm = pmAmMatch[3].toUpperCase();
    
    if (ampm === 'PM' && hour !== 12) {
      hour += 12;
    } else if (ampm === 'AM' && hour === 12) {
      hour = 0;
    }
    
    const date = new Date(referenceDate);
    date.setHours(hour, minute, 0, 0);
    return date;
  }
  
  // Handle "17:00" format (24-hour)
  const hour24Match = timeString.match(/(\d{1,2}):(\d{2})/);
  if (hour24Match) {
    const hour = parseInt(hour24Match[1]);
    const minute = parseInt(hour24Match[2]);
    
    const date = new Date(referenceDate);
    date.setHours(hour, minute, 0, 0);
    return date;
  }
  
  // Handle "5pm" format (without colon)
  const simpleMatch = timeString.match(/(\d{1,2})\s*(AM|PM)/i);
  if (simpleMatch) {
    let hour = parseInt(simpleMatch[1]);
    const ampm = simpleMatch[2].toUpperCase();
    
    if (ampm === 'PM' && hour !== 12) {
      hour += 12;
    } else if (ampm === 'AM' && hour === 12) {
      hour = 0;
    }
    
    const date = new Date(referenceDate);
    date.setHours(hour, 0, 0, 0);
    return date;
  }
  
  return null;
}

/**
 * Calculate arrival deadline from "arrive in X hours" or time string
 */
export function calculateArrivalDeadline(
  timeConstraint: {
    arrivalTime?: string;
    arrivalTimeHours?: number;
    departureTime?: string;
  },
  referenceDate: Date = new Date()
): { deadline: Date | null; departure: Date | null } {
  let deadline: Date | null = null;
  let departure: Date | null = null;
  
  // Parse departure time if provided
  if (timeConstraint.departureTime) {
    departure = parseTimeString(timeConstraint.departureTime, referenceDate);
    // If departure time is in the past, assume it's for tomorrow
    if (departure && departure < referenceDate) {
      departure.setDate(departure.getDate() + 1);
    }
  }
  
  // Calculate deadline from arrival time string
  if (timeConstraint.arrivalTime) {
    deadline = parseTimeString(timeConstraint.arrivalTime, referenceDate);
    // If deadline is in the past, assume it's for tomorrow
    if (deadline && deadline < referenceDate) {
      deadline.setDate(deadline.getDate() + 1);
    }
  }
  
  // Calculate deadline from "arrive in X hours"
  if (timeConstraint.arrivalTimeHours !== undefined) {
    const startTime = departure || referenceDate;
    deadline = new Date(startTime.getTime() + timeConstraint.arrivalTimeHours * 60 * 60 * 1000);
  }
  
  return { deadline, departure };
}

/**
 * Format minutes as a human-readable string
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  return `${hours} hour${hours !== 1 ? 's' : ''} ${mins} min`;
}

