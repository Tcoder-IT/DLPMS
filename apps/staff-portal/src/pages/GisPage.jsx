// GIS page — list parcels with boundary metadata + a Leaflet map showing
// all parcel boundaries. Lets a GIS Officer:
//   - Select a parcel
//   - Upload a GeoJSON Polygon file (or paste it) as the new boundary
//   - Draw a polygon directly on the map (click to add points; double-click
//     to close)
//   - Verify the boundary against all other parcels (calls
//     POST /gis/parcels/{id}/verify and highlights any overlapping parcels)
//
// Per ARCHITECTURE.md the GIS Web Interface is "a Leaflet.js-based map
// application" and per WORKFLOWS.md §5 the GIS Officer can "upload or draw
// the digital boundary of a land parcel". This page implements both paths.

import { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '../lib/apiClient.js';
import { Card, Spinner, EmptyState, Badge, Button, ErrorBanner } from '../components/ui.jsx';
import { boundaryStatus } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';

// Dire Dawa approx center
const DIRE_DAWA_CENTER = [9.5915, 41.8629];

export default function GisPage() {
  const { user } = useAuth();
  const [parcels, setParcels] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState([]);
  const [geojsonInput, setGeojsonInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const d = await api.get('/gis/parcels?pageSize=200');
      setParcels(d);
      setError(null);
    } catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, []);

  const selected = parcels?.items?.find((p) => p.id === selectedId) ?? null;

  // Convert stored boundaryJson (GeoJSON Polygon) into a react-leaflet
  // positions array [ [lat, lng], ... ].
  const toPositions = useCallback((geojson) => {
    if (!geojson || geojson.type !== 'Polygon' || !Array.isArray(geojson.coordinates)) return [];
    const ring = geojson.coordinates[0] ?? [];
    return ring.map(([lng, lat]) => [lat, lng]);
  }, []);

  async function handleUploadGeojson(e) {
    e.preventDefault();
    setActionError(null);
    if (!selected) return;
    let geom;
    try {
      geom = JSON.parse(geojsonInput);
    } catch {
      setActionError(new Error('GeoJSON is not valid JSON.'));
      return;
    }
    if (geom.type !== 'Polygon' || !Array.isArray(geom.coordinates)) {
      setActionError(new Error('GeoJSON must be a Polygon with coordinates.'));
      return;
    }
    setSubmitting(true);
    try {
      await api.put(`/gis/parcels/${selected.id}/boundary`, {
        geometry: geom,
        expectedVersion: selected.version
      });
      setGeojsonInput('');
      await load();
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUseDrawn() {
    setActionError(null);
    if (!selected) return;
    if (drawPoints.length < 4) {
      setActionError(new Error('Draw at least 4 points (a closed polygon needs the same first and last point).'));
      return;
    }
    // Convert [lat,lng] points to GeoJSON Polygon coordinates [lng,lat].
    const ring = drawPoints.map(([lat, lng]) => [lng, lat]);
    // Close the ring if not already closed.
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([...first]);
    }
    const geom = { type: 'Polygon', coordinates: [ring] };
    setSubmitting(true);
    try {
      await api.put(`/gis/parcels/${selected.id}/boundary`, {
        geometry: geom,
        expectedVersion: selected.version
      });
      setDrawing(false);
      setDrawPoints([]);
      await load();
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify() {
    setActionError(null);
    setVerifyResult(null);
    if (!selected) return;
    setSubmitting(true);
    try {
      const result = await api.post(`/gis/parcels/${selected.id}/verify`);
      setVerifyResult(result);
    } catch (err) {
      setActionError(err);
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setGeojsonInput(typeof ev.target.result === 'string' ? ev.target.result : '');
    };
    reader.readAsText(file);
  }

  if (!user || !['GISOfficer', 'SystemAdmin'].includes(user.role)) {
    return <Card><p className="text-sm text-red-700">Only GIS Officers and Administrators can use this page.</p></Card>;
  }
  if (error) return <Card><p className="text-sm text-red-700">{error.message}</p></Card>;
  if (!parcels) return <div className="flex justify-center py-16"><Spinner size={32} /></div>;

  const positions = selected ? toPositions(selected.boundaryJson) : [];
  const drawnPositions = drawPoints.length >= 2 ? drawPoints : [];
  const overlappingIds = new Set(verifyResult?.overlaps?.map((o) => o.parcelId) ?? []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">GIS — Boundary management</h1>
      <p className="text-sm text-slate-600">
        Select a parcel to view or update its boundary. Upload a GeoJSON
        Polygon file or draw points directly on the map. Verify against all
        other parcels to detect overlaps.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left: parcel list */}
        <Card className="lg:col-span-1">
          <h2 className="font-semibold text-slate-900">Parcels ({parcels.items.length})</h2>
          {parcels.items.length === 0 ? (
            <EmptyState title="No parcels" />
          ) : (
            <ul className="mt-3 max-h-[500px] divide-y divide-slate-100 overflow-y-auto">
              {parcels.items.map((p) => {
                const isSelected = p.id === selectedId;
                const pos = toPositions(p.boundaryJson);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => { setSelectedId(p.id); setVerifyResult(null); setDrawing(false); setDrawPoints([]); }}
                      className={`w-full py-2 px-1 text-left ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono text-sm text-slate-900">{p.parcelNumber}</p>
                          <p className="text-xs text-slate-500">{p.subCity}, {p.kebele}</p>
                        </div>
                        <Badge tone={
                          p.boundaryStatus === 'Verified' ? 'green' :
                          p.boundaryStatus === 'OverlapConflict' ? 'red' :
                          'amber'
                        }>
                          {boundaryStatus(p.boundaryStatus)}
                        </Badge>
                      </div>
                      {pos.length > 0 && (
                        <p className="mt-1 text-xs text-slate-400">
                          {pos.length} vertices
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Right: map + tools */}
        <div className="lg:col-span-2 space-y-4">
          {selected ? (
            <>
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm text-slate-900">{selected.parcelNumber}</p>
                    <p className="text-xs text-slate-500">{selected.subCity}/{selected.kebele} · v{selected.version}</p>
                  </div>
                  <Badge tone={
                    selected.boundaryStatus === 'Verified' ? 'green' :
                    selected.boundaryStatus === 'OverlapConflict' ? 'red' : 'amber'
                  }>
                    {boundaryStatus(selected.boundaryStatus)}
                  </Badge>
                </div>
              </Card>

              <div className="relative h-[400px] overflow-hidden rounded-lg border border-slate-200">
                <MapContainer
                  center={positions.length > 0 ? positions[0] : DIRE_DAWA_CENTER}
                  zoom={13}
                  className="h-full w-full"
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />
                  {/* Render every parcel's boundary. Highlight the selected and overlaps. */}
                  {parcels.items.map((p) => {
                    const pos = toPositions(p.boundaryJson);
                    if (pos.length < 3) return null;
                    const isSel = p.id === selected.id;
                    const isOverlap = overlappingIds.has(p.id);
                    return (
                      <Polygon
                        key={p.id}
                        positions={pos}
                        pathOptions={{
                          color: isSel ? '#1d4ed8' : isOverlap ? '#dc2626' : '#475569',
                          weight: isSel ? 3 : 1,
                          fillOpacity: isSel ? 0.15 : isOverlap ? 0.25 : 0.08
                        }}
                      />
                    );
                  })}
                  {/* Render the in-progress drawing */}
                  {drawing && drawnPositions.length > 0 && (
                    <Polygon
                      positions={drawnPositions}
                      pathOptions={{ color: '#16a34a', weight: 2, dashArray: '4 4', fillOpacity: 0.1 }}
                    />
                  )}
                  {/* Click handler when in drawing mode */}
                  {drawing && <ClickHandler onClick={(latlng) => setDrawPoints((prev) => [...prev, [latlng.lat, latlng.lng]])} />}
                  {/* Re-center when selection changes */}
                  <Recenter positions={positions} />
                </MapContainer>
              </div>

              {actionError && <ErrorBanner error={actionError} onDismiss={() => setActionError(null)} />}

              {/* Verify panel */}
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">Boundary verification</h3>
                    <p className="text-xs text-slate-500">
                      Checks this parcel's boundary against all other parcel boundaries for overlaps.
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" disabled={submitting || !selected.boundaryJson} onClick={handleVerify}>
                    <CheckCircle2 size={14} /> Verify
                  </Button>
                </div>
                {verifyResult && (
                  <div className="mt-3">
                    {verifyResult.boundaryStatus === 'Verified' ? (
                      <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                        <CheckCircle2 size={16} /> No overlaps detected; status set to <strong>Verified</strong>.
                      </div>
                    ) : (
                      <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={16} />
                          <span>Found <strong>{verifyResult.overlapsDetected}</strong> overlapping parcel(s). Status set to <strong>OverlapConflict</strong>.</span>
                        </div>
                        <ul className="mt-2 space-y-1 text-xs">
                          {verifyResult.overlaps.map((o) => (
                            <li key={o.parcelId}>
                              {o.parcelNumber} — {o.subCity}/{o.kebele}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* Boundary tools — upload GeoJSON or draw on map */}
              <Card>
                <h3 className="font-semibold text-slate-900">Update boundary</h3>
                <div className="mt-3 space-y-4">
                  {/* Draw-on-map */}
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-600">Draw on map</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant={drawing ? 'danger' : 'secondary'} onClick={() => { setDrawing((s) => !s); setDrawPoints([]); }}>
                          {drawing ? 'Cancel draw' : 'Start drawing'}
                        </Button>
                        <Button size="sm" disabled={!drawing || drawPoints.length < 4 || submitting} onClick={handleUseDrawn}>
                          Save drawn ({drawPoints.length} pts)
                        </Button>
                      </div>
                    </div>
                    {drawing && (
                      <p className="mt-1 text-xs text-slate-500">
                        Click on the map to add points. When you have 4+ points, click "Save drawn".
                      </p>
                    )}
                  </div>

                  {/* GeoJSON upload */}
                  <div>
                    <p className="text-xs font-medium text-slate-600">Upload GeoJSON Polygon</p>
                    <form onSubmit={handleUploadGeojson} className="mt-2 space-y-2">
                      <input
                        type="file"
                        accept=".json,.geojson,application/json"
                        onChange={handleFileUpload}
                        className="block w-full text-xs text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-blue-700 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-blue-800"
                      />
                      <textarea
                        placeholder='{"type":"Polygon","coordinates":[[[lng,lat],...]]}'
                        value={geojsonInput}
                        onChange={(e) => setGeojsonInput(e.target.value)}
                        rows={4}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <Button type="submit" size="sm" disabled={submitting || !geojsonInput}>
                        <Upload size={14} /> Upload boundary
                      </Button>
                    </form>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <EmptyState title="Select a parcel"
                description="Click any parcel on the left to view, draw, upload, or verify its boundary." />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper component: re-center the map when the selected parcel changes.
function Recenter({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds.pad(0.2));
    }
  }, [map, positions]);
  return null;
}

// Helper component: capture map clicks when drawing mode is active.
function ClickHandler({ onClick }) {
  useMapEvents({
    click(e) { onClick(e.latlng); }
  });
  return null;
}
