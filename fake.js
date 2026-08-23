// API endpoint inside Docker network (service name 'backend')
const API_URL = 'http://backend:8000/api/driver-location';

// Initial driver positions (New York City area)
const drivers = [
  { driver_id: 1, lat: 40.7128, lng: -74.0060 },
  { driver_id: 2, lat: 40.7300, lng: -73.9950 },
  { driver_id: 3, lat: 40.7200, lng: -74.0100 },
];

// Types of reports
const reportTypes = ['location', 'accident', 'traffic', 'breakdown'];

// Random offset to simulate movement
function getRandomOffset() {
  return (Math.random() - 0.5) * 0.01;
}

// Random type with weighted probability:
// 70% location, 10% accident, 10% traffic, 10% breakdown
function getRandomType() {
  const r = Math.random();
  if (r < 0.7) return 'location';
  if (r < 0.8) return 'accident';
  if (r < 0.9) return 'traffic';
  return 'breakdown';
}

// Send update for a single driver
async function sendUpdate(driver) {
  const body = {
    driver_id: driver.driver_id,
    latitude: driver.lat + getRandomOffset(),
    longitude: driver.lng + getRandomOffset(),
    type: getRandomType(),
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

// Send updates every 2 seconds
setInterval(() => {
  drivers.forEach(sendUpdate);
}, 2000);