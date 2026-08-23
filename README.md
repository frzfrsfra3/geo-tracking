# 🗺️ Real-Time Driver Location Tracking System

> A full-stack mini system that receives geographic coordinates from drivers, persists them to a PostGIS-enabled PostgreSQL database, and broadcasts location updates in real-time via WebSockets to a live-updating Mapbox map.

---

## 📐 System Architecture

```
┌─────────────┐     HTTP POST        ┌─────────────────┐     WebSocket      ┌─────────────────┐
│   fake.js   │ ─────────────────>   │  Laravel API    │ ─────────────────> │  Next.js Client │
│  (Simulator)│  /api/driver-location│  (Reverb WS)    │  driver-locations  │  (Mapbox Map)   │
└─────────────┘                      └─────────────────┘                    └─────────────────┘
                                         │
                                         │ INSERT
                                         ▼
                              ┌ ───────────────────── ┐
                              │  PostgreSQL + PostGIS │
                              │   driver_reports      │
                              └ ───────────────────── ┘
```

---

## 🧰 Tech Stack

| Layer        | Technology                                                                 |
|--------------|----------------------------------------------------------------------------|
| **Backend**  | Laravel 12, Reverb (WebSockets), PostgreSQL 16, PostGIS                    |
| **Frontend** | Next.js 14 (App Router), React, Mapbox GL JS, react-map-gl, Laravel Echo   |
| **DevOps**   | Docker, Docker Compose                                                     |
| **Data Sim** | Node.js (native `fetch`)                                                   |

---

## 📁 Project Structure

```
geo-tracking/
├── geo-backend/          # Laravel API + Reverb WebSocket server
│   ├── app/
│   │   ├── Events/
│   │   ├── Http/Controllers/
│   │   ├── Models/
│   │   └── Providers/
│   ├── config/
│   ├── database/migrations/
│   ├── routes/
│   └── .env
├── geo-frontend/         # Next.js SPA with live Mapbox map
│   ├── app/
│   ├── components/
│   └── lib/
└── fake.js               # Standalone Node.js simulator script
```

---

## ⚙️ Prerequisites

- Docker & Docker Compose
- Node.js ≥ 18 (for the fake-data simulator only)
- Mapbox public access token

---

## 🚀 Quick Start

### 1. Clone & Environment

```bash
git clone https://github.com/frzfrsfra3/geo-tracking.git
cd geo-tracking
```
### 2. Add MAPBOX TOKEN SECRET TO docker-compose file   NEXT_PUBLIC_MAPBOX_TOKEN: yourmapboxsecret

### 3. Start Infrastructure (Docker)

```bash
docker-compose up -d --build
```

> This spins up: `postgres`, `redis`, `laravel-app`, `reverb-server`, and `nextjs-app`.

### 4. Open the Map

Navigate to `http://localhost:3001` — markers will appear and move in real-time.

---

## 🔧 Backend (`geo-backend/`)

### `app/Events/DriverLocationUpdated.php`

```php
<?php
namespace App\Events;

use App\Models\DriverReport;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;  // <-- Sync broadcast (no queue delay)
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * BroadcastEvent: Fired immediately after a driver report is stored.
 * Implements ShouldBroadcastNow so the event is pushed synchronously
 * to Reverb without waiting on a queue worker.
 */
class DriverLocationUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $driverReport;   // Public property is auto-serialized into the payload

    public function __construct(DriverReport $driverReport)
    {
        $this->driverReport = $driverReport;
    }

    /**
     * Define the WebSocket channel clients must subscribe to.
     * Using a public Channel (no auth required) for this demo.
     */
    public function broadcastOn(): array
    {
        return [new Channel('driver-locations')];
    }

    /**
     * Custom event name seen by the frontend.
     * Laravel Echo prepends a dot, so the client listens to ".DriverLocationUpdated".
     */
    public function broadcastAs(): string
    {
        return 'DriverLocationUpdated';
    }

    /**
     * Explicit payload shape sent over the wire.
     * Casts latitude/longitude to float and ISO-8601 timestamp for JS compatibility.
     */
    public function broadcastWith(): array
    {
        return [
            'id'          => $this->driverReport->id,
            'driver_id'   => $this->driverReport->driver_id,
            'latitude'    => (float) $this->driverReport->latitude,
            'longitude'   => (float) $this->driverReport->longitude,
            'type'        => $this->driverReport->type,
            'created_at'  => $this->driverReport->created_at->toISOString(),
        ];
    }
}
```

---

### `app/Http/Controllers/DriverLocationController.php`

```php
<?php
namespace App\Http\Controllers;

use App\Events\DriverLocationUpdated;
use App\Models\DriverReport;
use Illuminate\Http\Request;

/**
 * REST controller handling inbound driver telemetry.
 */
class DriverLocationController extends Controller
{
    /**
     * POST /api/driver-location
     * Validates incoming coordinates, persists to DB, then broadcasts
     * the new report over the Reverb WebSocket channel.
     */
    public function store(Request $request)
    {
        // Strict validation: lat/lng must be numeric and within valid ranges
        $validated = $request->validate([
            'driver_id' => 'required|integer',
            'latitude'  => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'type'      => 'sometimes|in:location,accident,traffic,breakdown',
        ]);

        // Persist; defaults to 'location' if type is omitted
        $report = DriverReport::create([
            'driver_id' => $validated['driver_id'],
            'latitude'  => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'type'      => $validated['type'] ?? 'location',
        ]);

        // Fire the broadcast event → pushes to all connected WebSocket clients instantly
        broadcast(new DriverLocationUpdated($report));

        return response()->json($report, 201);
    }

    /**
     * GET /api/driver-reports
     * Returns the 100 most recent reports for initial map hydration.
     */
    public function index()
    {
        return DriverReport::latest()->take(100)->get();
    }
}
```

---

### `app/Models/DriverReport.php`

```php
<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Eloquent model for the driver_reports table.
 * Automatically generates a PostGIS POINT geometry on creation.
 */
class DriverReport extends Model
{
    protected $fillable = [
        'driver_id',
        'latitude',
        'longitude',
        'type',
        'location',   // PostGIS geography column
    ];

    /**
     * Booted hook: runs before every insert.
     * Converts raw lat/lng into a proper PostGIS POINT(4326) so spatial
     * indexes (GIST) and geo-queries can be used later.
     */
    protected static function booted()
    {
        static::creating(function (DriverReport $report) {
            if ($report->latitude && $report->longitude) {
                $lng = (float) $report->longitude;
                $lat = (float) $report->latitude;
                // ST_MakePoint(x, y) → ST_SetSRID(..., 4326) sets WGS-84 coordinate system
                $report->location = DB::raw("ST_SetSRID(ST_MakePoint($lng, $lat), 4326)");
            }
        });
    }
}
```

---

### `database/migrations/2026_08_23_081821_create_driver_reports_table.php`

```php
<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // Enable the PostGIS extension (required for geography columns)
        DB::statement('CREATE EXTENSION IF NOT EXISTS postgis;');

        Schema::create('driver_reports', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('driver_id');
            $table->decimal('latitude', 10, 7);   // Precision: 10 digits, 7 after decimal
            $table->decimal('longitude', 10, 7);
            $table->string('type')->default('location');
            // PostGIS geography POINT with SRID 4326 (WGS-84)
            $table->geography('location', 'POINT', 4326)->nullable();
            $table->timestamps();

            $table->index('driver_id');  // Fast lookups by driver
        });

        // GIST spatial index for efficient geo-radius / bounding-box queries
        DB::statement('CREATE INDEX driver_reports_location_gix ON driver_reports USING GIST (location);');
    }

    public function down(): void
    {
        Schema::dropIfExists('driver_reports');
    }
};
```

---

### `routes/api.php`

```php
<?php
use App\Http\Controllers\DriverLocationController;
use App\Models\DriverReport;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Sanctum auth placeholder (not enforced in this demo)
Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

// Core API: receive a new driver location/report
Route::post('/driver-location', [DriverLocationController::class, 'store']);

// Core API: fetch the latest 100 reports for initial map state
Route::get('/driver-reports', function () {
    return DriverReport::latest()->take(100)->get();
});
```

---

### `config/reverb.php` (Key Snippet)

```php
// Reverb is Laravel's first-party WebSocket server (replaces Pusher self-hosted).
// The apps[] array defines credentials the frontend Echo client must match.
'apps' => [
    'provider' => 'config',
    'apps' => [
        [
            'key'    => env('REVERB_APP_KEY'),
            'secret' => env('REVERB_APP_SECRET'),
            'app_id' => env('REVERB_APP_ID'),
            'options' => [
                'host'   => env('REVERB_HOST'),
                'port'   => env('REVERB_PORT', 443),
                'scheme' => env('REVERB_SCHEME', 'https'),
            ],
            'allowed_origins' => ['*'],  // CORS: allow Next.js dev server
        ],
    ],
],
```

---

### `.env` (Backend Essentials)

```ini
# Database: PostgreSQL with PostGIS
DB_CONNECTION=pgsql
DB_HOST=postgres
DB_PORT=5432
DB_DATABASE=task
DB_USERNAME=postgres
DB_PASSWORD=P@ssw0rd

# Broadcasting: Reverb (WebSocket server)
BROADCAST_CONNECTION=reverb
REVERB_APP_ID=953344
REVERB_APP_KEY=aubsfb2oasbmgcwk5bse
REVERB_APP_SECRET=vtccszuswnuxgbwyflqk
REVERB_HOST=localhost
REVERB_PORT=8080
REVERB_SCHEME=http
```

---

## 🎨 Frontend (`geo-frontend/`)

### `app/layout.tsx`

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Real‑time Driver Map',
  description: 'Live driver location tracking',
};

/**
 * RootLayout: wraps every page.
 * - Applies Geist font CSS variables
 * - suppressHydrationWarning prevents Next.js warnings when client-only libs (Mapbox) hydrate
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
```

---

### `app/page.tsx`

```tsx
'use client';

import dynamic from 'next/dynamic';

/**
 * Home page dynamically imports the map component with SSR disabled.
 * Mapbox GL JS requires the `window` object, so it can only render on the client.
 * Using dynamic() with ssr: false avoids "window is not defined" build errors.
 */
const LiveMap = dynamic(() => import('@/components/LiveMap'), {
  ssr: false,
});

export default function Home() {
  return <LiveMap />;
}
```

---

### `components/LiveMap.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Map, Marker, Popup } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getEcho } from '@/lib/echo';

/** Shape of a single driver report as received from the API / WebSocket */
interface DriverReport {
  id: number;
  driver_id: number;
  latitude: number;
  longitude: number;
  type: 'location' | 'accident' | 'traffic' | 'breakdown';
  created_at: string;
}

/** Emoji icons keyed by report type */
const typeIcons: Record<string, string> = {
  location:  '📍',
  accident:  '⚠️',
  traffic:   '🚦',
  breakdown: '🔧',
};

export default function LiveMap() {
  /**
   * State holds a map of driver_id → latest report.
   * Using a Record (object) instead of an array allows O(1) updates
   * when a new WebSocket message arrives for an existing driver.
   */
  const [reports, setReports] = useState<Record<number, DriverReport>>({});

  useEffect(() => {
    // ── 1. Hydrate: fetch the last 100 reports so the map isn't empty on load ──
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/driver-reports`)
      .then((res) => res.json())
      .then((data: DriverReport[]) => {
        const map: Record<number, DriverReport> = {};
        data.forEach((r) => {
          map[r.driver_id] = r;   // keep only the latest per driver
        });
        setReports(map);
      })
      .catch((err) => console.error('Failed to fetch initial reports', err));

    // ── 2. Real-time: subscribe to the Reverb WebSocket channel ──
    const echo = getEcho();
    if (echo) {
      echo
        .channel('driver-locations')                     // public channel name
        .listen('.DriverLocationUpdated', (e: DriverReport) => {
          // Merge the incoming report into state by driver_id
          setReports((prev) => ({ ...prev, [e.driver_id]: e }));
        });
    }

    // ── 3. Cleanup: leave the channel on unmount to prevent memory leaks ──
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
        longitude: -74.006,   // Default: NYC area
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
          {/* Emoji marker with drop-shadow for visibility */}
          <div
            style={{
              fontSize: '24px',
              cursor: 'pointer',
              filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.5))',
            }}
          >
            {typeIcons[report.type] || '📍'}
          </div>

          {/* Popup showing metadata on hover/click */}
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
```

---

### `lib/echo.ts`

```ts
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

/**
 * Type declarations so TypeScript knows window.Pusher / window.Echo exist.
 */
declare global {
  interface Window {
    Pusher: typeof Pusher;
    Echo: Echo;
  }
}

let echo: Echo | null = null;

/**
 * Singleton factory for the Laravel Echo client.
 * - Guards against SSR (typeof window === 'undefined')
 * - Uses the 'reverb' broadcaster to connect to the self-hosted Reverb server
 * - Reads connection params from env vars so the same build works in any environment
 */
export const getEcho = () => {
  if (typeof window === 'undefined') return null;   // SSR safety
  if (echo) return echo;                              // Return existing instance

  window.Pusher = Pusher;

  echo = new Echo({
    broadcaster: 'reverb',
    key: process.env.NEXT_PUBLIC_REVERB_APP_KEY!,
    wsHost: process.env.NEXT_PUBLIC_REVERB_HOST,
    wsPort: Number(process.env.NEXT_PUBLIC_REVERB_PORT) || 8080,
    wssPort: Number(process.env.NEXT_PUBLIC_REVERB_PORT) || 8080,
    forceTLS: process.env.NEXT_PUBLIC_REVERB_SCHEME === 'https',
    enabledTransports: ['ws', 'wss'],   // Allow both plain & TLS WebSockets
  });

  return echo;
};
```

---

### `.env.local` (Frontend)

```ini
# Public API base URL (Laravel backend)
NEXT_PUBLIC_API_URL=http://localhost:8000/api

# Mapbox token (required for Map tiles & geocoding)
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyYOUR_TOKEN_HERE

# Reverb WebSocket credentials (must match backend .env)
NEXT_PUBLIC_REVERB_APP_KEY=aubsfb2oasbmgcwk5bse
NEXT_PUBLIC_REVERB_HOST=localhost
NEXT_PUBLIC_REVERB_PORT=8080
NEXT_PUBLIC_REVERB_SCHEME=http
```

---

## 🤖 Fake Data Simulator (`fake.js`)

```javascript
// Standalone Node.js script — no external dependencies needed.
// Simulates 3 drivers sending telemetry every 2 seconds.

const API_URL = 'http://localhost:8000/api/driver-location';

// Base coordinates (NYC area)
const drivers = [
  { driver_id: 1, lat: 40.7128, lng: -74.0060 },
  { driver_id: 2, lat: 40.7300, lng: -73.9950 },
  { driver_id: 3, lat: 40.7200, lng: -74.0100 },
];

const reportTypes = ['location', 'accident', 'traffic', 'breakdown'];

/**
 * Returns a small random offset (~ ±0.005°) so markers drift realistically.
 * 0.01° ≈ 1.1 km at the equator — small enough to look like city driving.
 */
function getRandomOffset() {
  return (Math.random() - 0.5) * 0.01;
}

/**
 * Weighted random type:
 *  70% location   (normal driving)
 *  10% accident
 *  10% traffic
 *  10% breakdown
 */
function getRandomType() {
  const r = Math.random();
  if (r < 0.7) return 'location';
  if (r < 0.8) return 'accident';
  if (r < 0.9) return 'traffic';
  return 'breakdown';
}

/**
 * POSTs a single driver update to the Laravel API.
 */
async function sendUpdate(driver) {
  const body = {
    driver_id: driver.driver_id,
    latitude:  driver.lat + getRandomOffset(),
    longitude: driver.lng + getRandomOffset(),
    type:      getRandomType(),
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`Failed for driver ${driver.driver_id}:`, res.status);
    } else {
      console.log(`Updated driver ${driver.driver_id} (${body.type})`);
    }
  } catch (err) {
    console.error('Network error:', err.message);
  }
}

// Fire for all drivers every 2 000 ms
setInterval(() => {
  drivers.forEach(sendUpdate);
}, 2000);
```

---

## 🐳 Docker Compose (Suggested)

```yaml
services:
  # ── PostgreSQL + PostGIS ─────────────────────────────
  postgres:
    image: postgis/postgis:15-3.4
    environment:
      POSTGRES_DB: task
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: P@ssw0rd
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  # ── Laravel Backend ──────────────────────────────────
  laravel-app:
    build:
      context: ./geo-backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    env_file:
      - ./geo-backend/.env
    depends_on:
      - postgres
      - redis

  # ── Reverb WebSocket Server ──────────────────────────
  reverb-server:
    build:
      context: ./geo-backend
      dockerfile: Dockerfile
    command: php artisan reverb:start --host=0.0.0.0 --port=8080
    ports:
      - "8080:8080"
    env_file:
      - ./geo-backend/.env
    depends_on:
      - redis

  # ── Redis (for Reverb scaling & Laravel cache) ───────
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # ── Next.js Frontend ─────────────────────────────────
  nextjs-app:
    build:
      context: ./geo-frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - ./geo-frontend/.env.local
    depends_on:
      - laravel-app
      - reverb-server

volumes:
  pgdata:
```

---

## 📡 API Reference

| Method | Endpoint                | Body / Query                              | Response              |
|--------|-------------------------|-------------------------------------------|-----------------------|
| POST   | `/api/driver-location`  | `{driver_id, latitude, longitude, type}`  | `201 Created` + JSON  |
| GET    | `/api/driver-reports`   | —                                         | Array of 100 reports  |

---

## 🔌 WebSocket Events

| Channel             | Event Name                | Payload Shape                          |
|---------------------|---------------------------|----------------------------------------|
| `driver-locations`  | `DriverLocationUpdated`   | `{id, driver_id, latitude, longitude, type, created_at}` |

> **Frontend listener:** `echo.channel('driver-locations').listen('.DriverLocationUpdated', callback)`

---

## ✅ Verification Checklist

- [ ] `docker-compose up` starts all services without errors.
- [ ] `php artisan migrate` creates `driver_reports` with PostGIS column.
- [ ] `node fake.js` prints `Updated driver X (location)` every 2 s.
- [ ] Browser Network tab shows WebSocket connection to `ws://localhost:8080`.
- [ ] Map markers appear and move smoothly without page refresh.
- [ ] PostgreSQL `SELECT * FROM driver_reports;` shows growing rows.

---

## 📝 Notes & Trade-offs

1. **Public Channel:** `driver-locations` is public for demo simplicity. Production should use `PrivateChannel` + Laravel Sanctum auth.
2. **No Queue Worker:** `ShouldBroadcastNow` broadcasts synchronously. For high throughput, switch to `ShouldBroadcast` + `QUEUE_CONNECTION=redis` and run `php artisan queue:work`.
3. **State Shape:** Frontend stores only the latest report per `driver_id`. If full history is needed, switch to an array and deduplicate by `id`.
4. **Mapbox Token:** The token is exposed in the browser (required by Mapbox GL JS). Restrict it by HTTP referrer in Mapbox dashboard.

---

**Built for a real-time geo-tracking take-home assignment.**
