# AlertMap Ukraine

Responsive air-alert dashboard with a Leaflet map, region list, filters, and a server-side API proxy.

## Requirements
- Node.js 18 or newer
- A valid Ukraine Alert API key
- GeoJSON containing Ukraine's oblast boundaries

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Set the API key as a server environment variable. Never put it in browser JavaScript.
   - macOS/Linux:
     ```bash
     export UKRAINEALARM_API_KEY="YOUR_KEY"
     ```
   - Windows PowerShell:
     ```powershell
     $env:UKRAINEALARM_API_KEY="YOUR_KEY"
     ```
3. Put your oblast GeoJSON at `data/regions.geojson`. Each feature should have `properties.regionId` matching the API's `regionId`.
4. Start:
   ```bash
   npm start
   ```
5. Open http://localhost:3000

## API endpoints used
- `GET /api/v3/regions`: initial region list.
- `GET /api/v3/alerts/status`: polled every 5 seconds.
- `GET /api/v3/alerts`: fetched on first check and only when `lastActionIndex` changes.

## Alert parsing
The code follows the supplied nested structure:
`region.activeAlerts[] -> alert.activeAlertLevels[] -> level.alertLevel`.
Any level other than `None` or `Green` is treated as active.

## GeoJSON matching
The map matches `feature.properties.regionId` (also accepts `region_id`, `id`, or `feature.id`) with the API's `regionId`.

## Important
This is an informational interface, not an official warning channel. Follow official alerts and instructions from emergency services.
Verify the current API response and access rules before production deployment.
