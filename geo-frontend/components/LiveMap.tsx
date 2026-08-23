'use client';

import { useEffect, useState } from 'react';
import { Map, Marker, Popup } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getEcho } from '@/lib/echo';

interface DriverReport {
  id: number;
  driver_id: number;
  latitude: number;
  longitude: number;
  type: 'location' | 'accident' | 'traffic' | 'breakdown';
  created_at: string;
}

const typeIcons: Record<string, string> = {
  location: '📍',
  accident: '⚠️',
  traffic: '🚦',
  breakdown: '🔧',
};

export default function LiveMap() {
  const [reports, setReports] = useState<Record<number, DriverReport>>({});

  useEffect(() => {
    // Fetch existing reports
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/driver-reports`)
      .then((res) => res.json())
      .then((data: DriverReport[]) => {
        const map: Record<number, DriverReport> = {};
        data.forEach((r) => {
          map[r.driver_id] = r;
        });
        setReports(map);
      })
      .catch((err) => console.error('Failed to fetch initial reports', err));

    // Listen for real-time updates via Laravel Echo
    const echo = getEcho();
    if (echo) {
      echo
        .channel('driver-locations')
        .listen('.DriverLocationUpdated', (e: DriverReport) => {
          setReports((prev) => ({ ...prev, [e.driver_id]: e }));
        });
    }

    return () => {
      if (echo) {
        echo.leaveChannel('driver-locations');
      }
    };
  }, []);

  const markers = Object.values(reports);

  return (
    <Map
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{
        longitude: -74.006,
        latitude: 40.7128,
        zoom: 12,
      }}
      style={{ width: '100vw', height: '100vh' }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
    >
      {markers.map((report) => (
        <Marker
          key={report.driver_id}
          longitude={report.longitude}
          latitude={report.latitude}
          anchor="center"
        >
          <div
            style={{
              fontSize: '24px',
              cursor: 'pointer',
              filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.5))',
            }}
          >
            {typeIcons[report.type] || '📍'}
          </div>
          <Popup
            longitude={report.longitude}
            latitude={report.latitude}
            closeButton={false}
            offset={20}
          >
            <div style={{ color: '#333' }}>
              <strong>Driver {report.driver_id}</strong>
              <br />
              Type: {report.type}
              <br />
              Updated: {new Date(report.created_at).toLocaleTimeString()}
            </div>
          </Popup>
        </Marker>
      ))}
    </Map>
  );
}