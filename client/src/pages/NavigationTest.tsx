import { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

export default function NavigationTest() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const [currentPosition, setCurrentPosition] = useState(0);

  // Sample route: Atlanta to Nashville (simplified coordinates along I-24)
  const routeCoordinates: [number, number][] = [
    [-84.3880, 33.7490], // Atlanta start
    [-84.5, 33.95],
    [-84.7, 34.2],
    [-85.0, 34.5],
    [-85.3, 34.8],
    [-85.6, 35.1],
    [-85.9, 35.4],
    [-86.2, 35.7],
    [-86.5, 36.0],
    [-86.7816, 36.1627], // Nashville end
  ];

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize map
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: routeCoordinates[0],
      zoom: 17,
      pitch: 75,
      bearing: 0,
    });

    mapRef.current = map;

    map.on('load', () => {
      // Add 3D terrain
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      });

      map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

      // Add sky layer
      map.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 90.0],
          'sky-atmosphere-sun-intensity': 15,
        },
      });

      // Add 3D buildings
      const layers = map.getStyle().layers;
      const labelLayerId = layers?.find(
        (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
      )?.id;

      map.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 15,
          paint: {
            'fill-extrusion-color': '#aaa',
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              15,
              0,
              15.05,
              ['get', 'height'],
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              15,
              0,
              15.05,
              ['get', 'min_height'],
            ],
            'fill-extrusion-opacity': 0.6,
          },
        },
        labelLayerId
      );

      // Add route line
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: routeCoordinates,
          },
        },
      });

      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#3B82F6',
          'line-width': 6,
          'line-opacity': 0.85,
        },
      });

      // Create navigation arrow marker
      const el = document.createElement('div');
      el.innerHTML = `
        <svg width="40" height="40" viewBox="0 0 40 40" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
          <circle cx="20" cy="20" r="18" fill="#3B82F6" opacity="0.3"/>
          <circle cx="20" cy="20" r="12" fill="#3B82F6" stroke="white" stroke-width="3"/>
          <path d="M 20 8 L 26 20 L 20 17 L 14 20 Z" fill="white"/>
        </svg>
      `;
      el.style.width = '40px';
      el.style.height = '40px';

      const marker = new mapboxgl.Marker({
        element: el,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat(routeCoordinates[0])
        .addTo(map);

      markerRef.current = marker;
    });

    return () => {
      map.remove();
    };
  }, []);

  // Simulate driving along the route
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;

    const interval = setInterval(() => {
      setCurrentPosition((prev) => {
        const nextPos = prev + 1;
        if (nextPos >= routeCoordinates.length) {
          clearInterval(interval);
          return prev;
        }

        const [lng, lat] = routeCoordinates[nextPos];
        const map = mapRef.current!;
        const marker = markerRef.current!;

        // Update marker position
        marker.setLngLat([lng, lat]);

        // Calculate bearing to next point
        let bearing = 0;
        if (nextPos < routeCoordinates.length - 1) {
          const [nextLng, nextLat] = routeCoordinates[nextPos + 1];
          bearing = calculateBearing(lat, lng, nextLat, nextLng);
        }

        // Calculate camera offset to show road ahead
        const offsetDistance = 0.0008;
        const bearingRad = (bearing * Math.PI) / 180;
        const offsetLat = lat + offsetDistance * Math.cos(bearingRad);
        const offsetLng = lng + offsetDistance * Math.sin(bearingRad);

        // Update camera to follow with forward-facing view
        map.easeTo({
          center: [offsetLng, offsetLat],
          zoom: 17,
          pitch: 75,
          bearing: bearing,
          duration: 2000,
          easing: (t) => t,
        });

        return nextPos;
      });
    }, 2000); // Move every 2 seconds

    return () => clearInterval(interval);
  }, []);

  // Calculate bearing between two points
  function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    const bearing = Math.atan2(y, x);

    return ((bearing * 180) / Math.PI + 360) % 360;
  }

  return (
    <div className="relative w-screen h-screen">
      {/* Navigation Instructions Banner */}
      <div className="absolute top-6 left-6 right-6 z-10">
        <div className="bg-blue-500 text-white rounded-lg shadow-xl p-4 flex items-center gap-4">
          <div className="text-3xl">↑</div>
          <div>
            <div className="text-sm opacity-90">In 1.5 miles</div>
            <div className="text-lg font-semibold">Continue on I-24 West</div>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Bottom Info Card */}
      <div className="absolute bottom-6 left-6 right-6 z-10">
        <div className="bg-white rounded-lg shadow-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">3h 45m</div>
              <div className="text-sm text-gray-600">234 mi • Arrive 2:15 PM</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold">67°</div>
              <div className="text-sm text-gray-600">Clear</div>
            </div>
          </div>
        </div>
      </div>

      {/* Test Info */}
      <div className="absolute top-6 right-6 z-20 bg-black bg-opacity-75 text-white p-3 rounded-lg text-sm">
        <div>🚗 Simulated Navigation Test</div>
        <div>Position: {currentPosition + 1}/{routeCoordinates.length}</div>
      </div>
    </div>
  );
}
