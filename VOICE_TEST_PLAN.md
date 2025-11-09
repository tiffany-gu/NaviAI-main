# NaviAI Voice Test Plan - Multi-Stop Flow

**Purpose**: Test the complete voice interaction flow for planning a route with multiple stops (restaurant + gas station).

**Date Created**: January 9, 2025
**Prerequisites**:
- Server running with debug logs enabled
- Browser console open to view client logs
- Terminal visible to view server logs
- Microphone enabled and working
- ElevenLabs TTS configured

---

## Test Scenario

### Step 1: Plan Initial Route to Emory University

**Voice Command**: "Hey Journey, take me to Emory University"

**Expected Backend Logs**:
```
[chat] Message received: take me to Emory University
[chat] Extracted trip parameters: {
  "origin": "266 Ferst Dr, Atlanta, GA 30332",
  "destination": "Emory University, Atlanta, GA"
}
[chat] 🔍 PREFERENCE MERGE DEBUG:
[chat] Existing preferences: null
[chat] New preferences from user: {}
```

**Expected Frontend Logs**:
```
[JourneyAssistant] New trip detected, clearing old route and stops
[JourneyAssistant] Updating route
[JourneyAssistant] Route legs: 1
[JourneyAssistant] Leg 1: 266 Ferst Dr NW → Emory University
```

**Expected UI Behavior**:
- Route line appears on map (blue)
- AI responds: "Route planned!" or similar (3-5 words)
- Route comparison shows: "5.2 mi, 15 min" (example)
- Stop counter shows: "0 stops"

**Success Criteria**: ✅ Route planned without errors

---

### Step 2: Request Restaurant Stop

**Voice Command**: "add a restaurant"

**Expected Backend Logs**:
```
[chat] Message received: add a restaurant
[chat] Extracted trip parameters: {
  "preferences": {"requestedStops": {"restaurant": true}}
}
[chat] 🔍 PREFERENCE MERGE DEBUG:
[chat] Existing preferences: {}
[chat] New preferences from user: {"requestedStops":{"restaurant":true}}
[chat] 🔀 Merging requestedStops:
[chat]   Old stops: {}
[chat]   New stops: {"restaurant":true}
[chat]   Merged stops: {"restaurant":true}
[chat] ✅ Final merged preferences saved to DB: {"requestedStops":{"restaurant":true}}

[find-stops] Trip request received: [tripRequestId]
[find-stops] Requested stops from DB: {"restaurant":true}
[find-stops] Stop suggestions: {
  userRequested: { gas: false, restaurant: true, scenic: false }
}
[find-stops] Searching for restaurant stops...
[find-stops] ✅ Found 3 restaurant stops
[find-stops] Returning 3 stops to client
```

**Expected Frontend Logs**:
```
[findStopsMutation] 🔍 STOP FILTERING DEBUG:
[findStopsMutation]   Received stops from backend: 3
[findStopsMutation]   Stop types received: restaurant, restaurant, restaurant
[findStopsMutation]   Already presented types: none
[findStopsMutation]   Stop "The Varsity" (restaurant): ✅ SHOW
[findStopsMutation]   Stop "Papi's Cuban & Caribbean Grill" (restaurant): ✅ SHOW
[findStopsMutation]   Stop "Rocky Mountain Pizza" (restaurant): ✅ SHOW
[findStopsMutation] 🔀 After filtering: 3 new stops to display
[findStopsMutation] ✅ Marking as presented: restaurant
[findStopsMutation]   Updated presentedStopTypes: restaurant
[findStopsMutation] 📍 Total stops now: 3 (previous: 0 + new: 3)
```

**Expected UI Behavior**:
- AI responds: "Looking for restaurants!" (3-5 words, NOT verbose)
- Message appears: "Found 3 recommended restaurant stops along your route!"
- 3 restaurant cards appear in sidebar
- Each card shows: name, rating, address, "Add to Route" button

**Success Criteria**:
- ✅ Only 1 "Found X stops" message (no duplicates)
- ✅ AI response is concise (not verbose)
- ✅ 3 restaurant recommendations shown

---

### Step 3: Add Restaurant to Route

**User Action**: Click "Add to Route" on one of the restaurant cards (e.g., "The Varsity")

**Expected Backend Logs**:
```
[add-stop] Adding stop to trip: [tripRequestId]
[add-stop] Stop: The Varsity (restaurant)
[add-stop] Recalculating route with waypoint...
[add-stop] Route updated with 2 legs
```

**Expected Frontend Logs**:
```
[addStopMutation] Adding stop to route
[JourneyAssistant] Route updated with waypoint
[JourneyAssistant] Route legs: 2
[JourneyAssistant] Leg 1: 266 Ferst Dr NW → The Varsity
[JourneyAssistant] Leg 2: The Varsity → Emory University
```

**Expected UI Behavior**:
- Route line updates on map (now has waypoint at The Varsity)
- Route comparison shows: "6.8 mi, 22 min" (example, increased from original)
- Stop counter shows: "1 stop"
- Message appears: "Route updated! Added The Varsity as stop 1."

**Success Criteria**: ✅ Route recalculated with waypoint, stop counter incremented

---

### Step 4: Request Gas Station Stop

**Voice Command**: "add a gas station"

**Expected Backend Logs**:
```
[chat] Message received: add a gas station
[chat] Extracted trip parameters: {
  "preferences": {"requestedStops": {"gas": true}}
}
[chat] 🔍 PREFERENCE MERGE DEBUG:
[chat] Existing preferences: {"requestedStops":{"restaurant":true}}
[chat] New preferences from user: {"requestedStops":{"gas":true}}
[chat] 🔀 Merging requestedStops:
[chat]   Old stops: {"restaurant":true}
[chat]   New stops: {"gas":true}
[chat]   Merged stops: {"restaurant":true,"gas":true}
[chat] ✅ Final merged preferences saved to DB: {"requestedStops":{"restaurant":true,"gas":true}}

[find-stops] Trip request received: [tripRequestId]
[find-stops] Requested stops from DB: {"restaurant":true,"gas":true}
[find-stops] Stop suggestions: {
  userRequested: { gas: true, restaurant: true, scenic: false }
}
[find-stops] Searching for gas stops...
[find-stops] ✅ Found 2 gas stops
[find-stops] Returning 2 stops to client (gas only, restaurant already presented)
```

**Expected Frontend Logs**:
```
[findStopsMutation] 🔍 STOP FILTERING DEBUG:
[findStopsMutation]   Received stops from backend: 2
[findStopsMutation]   Stop types received: gas, gas
[findStopsMutation]   Already presented types: restaurant
[findStopsMutation]   Stop "Shell Station" (gas): ✅ SHOW
[findStopsMutation]   Stop "BP Gas Station" (gas): ✅ SHOW
[findStopsMutation] 🔀 After filtering: 2 new stops to display
[findStopsMutation] ✅ Marking as presented: gas
[findStopsMutation]   Updated presentedStopTypes: restaurant, gas
[findStopsMutation] 📍 Total stops now: 5 (previous: 3 + new: 2)
```

**Expected UI Behavior**:
- AI responds: "Looking for gas stations!" (3-5 words)
- Message appears: "Found 2 recommended gas stops along your route!"
- 2 gas station cards appear in sidebar (below the 3 restaurant cards)
- Sidebar now shows 5 total stop cards (3 restaurants + 2 gas stations)

**Success Criteria**:
- ✅ Gas stops appear (NOT skipped due to short distance)
- ✅ Only 1 "Found X stops" message (no duplicates)
- ✅ Preferences properly merged (gas + restaurant both in DB)
- ✅ No duplicate restaurant cards shown

---

### Step 5: Add Gas Station to Route

**User Action**: Click "Add to Route" on one of the gas station cards (e.g., "Shell Station")

**Expected Backend Logs**:
```
[add-stop] Adding stop to trip: [tripRequestId]
[add-stop] Stop: Shell Station (gas)
[add-stop] Recalculating route with 2 waypoints...
[add-stop] Route updated with 3 legs
```

**Expected Frontend Logs**:
```
[addStopMutation] Adding stop to route
[JourneyAssistant] Route updated with waypoints
[JourneyAssistant] Route legs: 3
[JourneyAssistant] Leg 1: 266 Ferst Dr NW → The Varsity
[JourneyAssistant] Leg 2: The Varsity → Shell Station
[JourneyAssistant] Leg 3: Shell Station → Emory University
```

**Expected UI Behavior**:
- Route line updates on map (now has 2 waypoints)
- Route comparison shows: "8.1 mi, 28 min" (example)
- Stop counter shows: "2 stops"
- Message appears: "Route updated! Added Shell Station as stop 2."

**Success Criteria**: ✅ Route recalculated with 2 waypoints, stop counter shows 2

---

## Common Issues and Debugging

### Issue 1: Gas Stops Not Appearing

**Symptom**: Backend logs show:
```
[find-stops] Skipping gas stop search - not needed based on route distance
```

**Root Cause**: Preferences not properly merged, or DB read before merge saved.

**Debug Steps**:
1. Check if merge logs show both `restaurant` and `gas` in merged preferences
2. Check if `[find-stops] Requested stops from DB:` shows `{"restaurant":true,"gas":true}`
3. If not, the database refresh in `/api/find-stops` isn't working

**Fix**: Verify `refreshedTripRequest` is properly reading from DB (line 305 in `routes.ts`)

---

### Issue 2: Duplicate "Found X stops" Messages

**Symptom**: Two identical messages appear after requesting second stop type.

**Root Cause**: `findStopsMutation` called twice (once directly, once via `planRouteMutation`).

**Debug Steps**:
1. Check if early return is working (line 203 in `JourneyAssistant.tsx`)
2. Look for `[JourneyAssistant] Skipping planRouteMutation` log

**Fix**: Ensure early return executes when route exists.

---

### Issue 3: Wrong Stop Types Shown

**Symptom**: Asked for gas, got restaurant recommendations.

**Root Cause**: Client-side filtering not working, or backend returning wrong types.

**Debug Steps**:
1. Check frontend logs for "Already presented types"
2. Check if `presentedStopTypes` Set is properly updated
3. Check backend logs for "Stop types received"

**Fix**: Verify `presentedStopTypes` Set tracks correctly and filter logic works.

---

### Issue 4: GPT Parsing Errors

**Symptom**: Backend logs show:
```
[parseUserRequest] OpenAI extraction failed: TypeError: parsed.origin.trim is not a function
```

**Root Cause**: GPT returns non-string values for origin/destination.

**Debug Steps**:
1. Check GPT response in logs
2. Look for type guard warnings: "Invalid origin type"

**Fix**: Type guards should catch and handle non-string values (lines 848-860 in `gpt.ts`)

---

## Success Criteria Summary

| Step | Criteria | Status |
|------|----------|--------|
| 1. Plan route | Route planned without errors | ⏳ To Test |
| 2. Add restaurant | 3 restaurants shown, no duplicates, concise response | ⏳ To Test |
| 3. Add to route | Route updated, 1 stop shown | ⏳ To Test |
| 4. Add gas station | **2 gas stations shown**, no duplicates, preferences merged | ⏳ To Test |
| 5. Add to route | Route updated, 2 stops shown | ⏳ To Test |

**Overall Success**: All steps pass without errors or duplicate messages.

---

## Quick Test Commands

For manual testing via chat interface (instead of voice):

```
1. "take me to Emory University"
2. "add a restaurant"
3. [Click "Add to Route" on restaurant]
4. "add a gas station"
5. [Click "Add to Route" on gas station]
```

---

## Automated Test Script (Optional)

Location: `/Users/raj/Desktop/NaviAI-main-1/test-multi-stop.sh`

```bash
#!/bin/bash
# Automated voice test for multi-stop flow
# Usage: ./test-multi-stop.sh

echo "🚀 Starting NaviAI multi-stop test..."
echo ""

echo "Step 1: Planning route to Emory University"
# Trigger voice command via API
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "take me to Emory University"}'
echo ""
sleep 2

echo "Step 2: Requesting restaurant stop"
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "add a restaurant", "tripRequestId": "[INSERT_TRIP_ID]"}'
echo ""
sleep 2

echo "Step 3: Requesting gas station stop"
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "add a gas station", "tripRequestId": "[INSERT_TRIP_ID]"}'
echo ""

echo "✅ Test commands sent. Check browser and server logs."
```

---

**Last Updated**: January 9, 2025 1:30 AM
**Next Action**: Execute voice test and verify all success criteria pass
