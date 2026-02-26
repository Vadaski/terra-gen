import { Canvas } from "@react-three/fiber";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from "react";
import {
  TerrainEngine,
  type TerrainParams,
  type TerrainStats
} from "../engine/terrainEngine";

export interface TerrainViewportHandle {
  captureScreenshot: () => void;
}

interface TerrainViewportProps {
  params: TerrainParams;
  onStats: (stats: TerrainStats) => void;
}

export const TerrainViewport = forwardRef<TerrainViewportHandle, TerrainViewportProps>(
  function TerrainViewport({ params, onStats }, ref) {
    const engineRef = useRef<TerrainEngine | null>(null);

    const handleCanvasCreated = useCallback(
      ({ canvas, gl }: { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext | WebGLRenderingContext }) => {
        if (engineRef.current) {
          return;
        }
        engineRef.current = new TerrainEngine(canvas, gl, params, onStats);
      },
      [onStats, params]
    );

    useEffect(() => {
      engineRef.current?.updateParams(params);
    }, [params]);

    useImperativeHandle(
      ref,
      () => ({
        captureScreenshot: () => {
          engineRef.current?.captureScreenshot();
        }
      }),
      []
    );

    useEffect(() => {
      return () => {
        engineRef.current?.dispose();
        engineRef.current = null;
      };
    }, []);

    return <Canvas className="terrain-canvas" onCreated={handleCanvasCreated} />;
  }
);
