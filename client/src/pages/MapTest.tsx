import { useState } from 'react';
import MapView from '@/components/MapView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function MapTest() {
  const [origin, setOrigin] = useState('San Francisco, CA');
  const [destination, setDestination] = useState('Los Angeles, CA');
  const [route, setRoute] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testRoute = async () => {
    setLoading(true);
    setError(null);

    try {
      // Call the test endpoint to get route directly
      const response = await fetch('/api/test-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination,
          preferences: {
            scenic: false,
            fast: true,
            avoidTolls: false,
          },
        }),
      });

      // Get the raw response text first
      const text = await response.text();
      console.log('Raw response:', text);

      // Try to parse it
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        throw new Error(`Server returned invalid JSON: ${text.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get route');
      }

      console.log('Route data:', data);

      // Set the first route
      if (data.routes && data.routes.length > 0) {
        setRoute(data.routes[0]);
      }
    } catch (err: any) {
      setError(err.message);
      console.error('Route error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Left Panel - Controls */}
      <div className="w-96 border-r border-border p-6 flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Mapbox Directions Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Origin</label>
              <Input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="Enter origin..."
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Destination</label>
              <Input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Enter destination..."
              />
            </div>

            <Button
              onClick={testRoute}
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Getting Route...' : 'Get Route'}
            </Button>

            {error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                Error: {error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Route Info */}
        {route && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Route Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Distance:</span>
                <span className="font-medium">
                  {route.legs[0]?.distance?.text || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration:</span>
                <span className="font-medium">
                  {route.legs[0]?.duration?.text || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Steps:</span>
                <span className="font-medium">
                  {route.legs[0]?.steps?.length || 0}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Test Buttons */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Tests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setOrigin('San Francisco, CA');
                setDestination('Los Angeles, CA');
              }}
            >
              SF → LA
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setOrigin('New York, NY');
                setDestination('Boston, MA');
              }}
            >
              NYC → Boston
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setOrigin('Seattle, WA');
                setDestination('Portland, OR');
              }}
            >
              Seattle → Portland
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - Map */}
      <div className="flex-1">
        <MapView route={route} stops={[]} />
      </div>
    </div>
  );
}
