import { useMemo, useRef, useState } from "react";
import {
  TerrainViewport,
  type TerrainViewportHandle
} from "./components/TerrainViewport";
import type { NavigationMode, TerrainParams, TerrainStats } from "./engine/terrainEngine";

const initialParams: TerrainParams = {
  seed: "terra-core-001",
  elevation: 1.1,
  humidity: 1,
  temperature: 1,
  dayNightEnabled: true,
  mode: "orbit"
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toPercent(value: number, min: number, max: number): number {
  return ((clamp(value, min, max) - min) / (max - min)) * 100;
}

export default function App(): JSX.Element {
  const viewportRef = useRef<TerrainViewportHandle>(null);
  const [params, setParams] = useState<TerrainParams>(initialParams);
  const [seedDraft, setSeedDraft] = useState(initialParams.seed);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [stats, setStats] = useState<TerrainStats>({
    fps: 0,
    chunkCount: 0,
    mode: initialParams.mode
  });

  const instructions = useMemo(() => {
    if (params.mode === "firstPerson") {
      return "Drag mouse to look around. Move with WASD, Space/Shift for up/down.";
    }
    return "Orbit mode: drag to rotate camera, scroll to zoom.";
  }, [params.mode]);

  const previewMetrics = useMemo(
    () => [
      {
        label: "Elevation",
        value: `${params.elevation.toFixed(2)}x`,
        percent: toPercent(params.elevation, 0.4, 2.6)
      },
      {
        label: "Humidity",
        value: `${params.humidity.toFixed(2)}x`,
        percent: toPercent(params.humidity, 0.3, 1.8)
      },
      {
        label: "Temperature",
        value: `${params.temperature.toFixed(2)}x`,
        percent: toPercent(params.temperature, 0.3, 1.8)
      }
    ],
    [params.elevation, params.humidity, params.temperature]
  );

  const setNumericParam = (key: "elevation" | "humidity" | "temperature", value: number) => {
    setParams((current) => ({ ...current, [key]: value }));
  };

  const setMode = (mode: NavigationMode) => {
    setParams((current) => ({ ...current, mode }));
  };

  const applySeed = () => {
    const normalized = seedDraft.trim();
    if (!normalized) {
      return;
    }
    setParams((current) => ({ ...current, seed: normalized }));
  };

  const randomizeSeed = () => {
    const next = `terra-${Math.random().toString(36).slice(2, 10)}`;
    setSeedDraft(next);
    setParams((current) => ({ ...current, seed: next }));
  };

  return (
    <div className="app-shell">
      <div className="viewport-wrap">
        <TerrainViewport ref={viewportRef} params={params} onStats={setStats} />
        <div className="cinematic-vignette" aria-hidden="true" />
      </div>

      <button
        type="button"
        className={`panel-toggle ${panelCollapsed ? "collapsed" : ""}`}
        onClick={() => setPanelCollapsed((collapsed) => !collapsed)}
        aria-expanded={!panelCollapsed}
        aria-controls="terrain-controls"
      >
        {panelCollapsed ? "Show Controls" : "Hide Controls"}
      </button>

      <aside id="terrain-controls" className={`control-panel ${panelCollapsed ? "collapsed" : ""}`}>
        <h1>TerraGen</h1>
        <p className="subtitle">Real-time procedural terrain lab</p>

        <div className="live-preview">
          {previewMetrics.map((metric) => (
            <div className="preview-row" key={metric.label}>
              <div className="preview-header">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
              <div className="preview-track">
                <i style={{ width: `${metric.percent}%` }} />
              </div>
            </div>
          ))}

          <div className="preview-meta">
            <span>{params.mode === "firstPerson" ? "First Person" : "Orbit"} mode</span>
            <span>{params.dayNightEnabled ? "Cycle On" : "Cycle Off"}</span>
            <span>{stats.chunkCount} chunks</span>
          </div>
        </div>

        {!panelCollapsed && (
          <>
            <label className="field">
              <span>Seed</span>
              <div className="inline-row">
                <input
                  type="text"
                  value={seedDraft}
                  onChange={(event: { target: HTMLInputElement }) => setSeedDraft(event.target.value)}
                  placeholder="Enter deterministic seed"
                />
                <button type="button" onClick={applySeed}>
                  Apply
                </button>
              </div>
              <div className="inline-row">
                <button type="button" onClick={randomizeSeed}>
                  Random Seed
                </button>
                <button type="button" onClick={() => viewportRef.current?.captureScreenshot()}>
                  Screenshot PNG
                </button>
              </div>
            </label>

            <label className="field">
              <span>Elevation {params.elevation.toFixed(2)}x</span>
              <input
                type="range"
                min={0.4}
                max={2.6}
                step={0.01}
                value={params.elevation}
                onChange={(event: { target: HTMLInputElement }) =>
                  setNumericParam("elevation", clamp(Number(event.target.value), 0.4, 2.6))
                }
              />
            </label>

            <label className="field">
              <span>Humidity {params.humidity.toFixed(2)}x</span>
              <input
                type="range"
                min={0.3}
                max={1.8}
                step={0.01}
                value={params.humidity}
                onChange={(event: { target: HTMLInputElement }) =>
                  setNumericParam("humidity", clamp(Number(event.target.value), 0.3, 1.8))
                }
              />
            </label>

            <label className="field">
              <span>Temperature {params.temperature.toFixed(2)}x</span>
              <input
                type="range"
                min={0.3}
                max={1.8}
                step={0.01}
                value={params.temperature}
                onChange={(event: { target: HTMLInputElement }) =>
                  setNumericParam("temperature", clamp(Number(event.target.value), 0.3, 1.8))
                }
              />
            </label>

            <label className="toggle">
              <input
                type="checkbox"
                checked={params.dayNightEnabled}
                onChange={(event: { target: HTMLInputElement }) =>
                  setParams((current) => ({ ...current, dayNightEnabled: event.target.checked }))
                }
              />
              <span>Day/Night Cycle Animation</span>
            </label>

            <div className="mode-selector">
              <button
                type="button"
                className={params.mode === "orbit" ? "active" : ""}
                onClick={() => setMode("orbit")}
              >
                Third Person Orbit
              </button>
              <button
                type="button"
                className={params.mode === "firstPerson" ? "active" : ""}
                onClick={() => setMode("firstPerson")}
              >
                First Person (WASD)
              </button>
            </div>

            <div className="stats">
              <div>FPS: {stats.fps.toFixed(0)}</div>
              <div>Loaded Chunks: {stats.chunkCount}</div>
              <div>Mode: {stats.mode}</div>
              <div className="instructions">{instructions}</div>
            </div>

            <div className="legend">
              <span>Biomes</span>
              <div className="chips">
                <em className="chip ocean">Ocean</em>
                <em className="chip beach">Beach</em>
                <em className="chip grass">Grassland</em>
                <em className="chip forest">Forest</em>
                <em className="chip snow">Snow Mountain</em>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
