import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";

export interface CanvasContext {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext | WebGLRenderingContext;
}

interface CanvasProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  onCreated?: (context: CanvasContext) => void;
}

export function Canvas({ className, style, children, onCreated }: CanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onCreated) {
      return;
    }

    const gl =
      canvas.getContext("webgl2", {
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true
      }) ||
      canvas.getContext("webgl", {
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true
      });

    if (!gl) {
      return;
    }

    onCreated({ canvas, gl });
  }, [onCreated]);

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%", ...style }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {children}
    </div>
  );
}

export function useFrame(): never {
  throw new Error("useFrame is unavailable in this lightweight @react-three/fiber shim.");
}
