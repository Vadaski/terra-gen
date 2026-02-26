import { Matrix4, Vector3 } from "three";
import { TerrainField } from "./terrainField";
import {
  terrainFragmentShader,
  terrainVertexShader,
  waterFragmentShader,
  waterVertexShader
} from "./shaders";

export type NavigationMode = "orbit" | "firstPerson";

export interface TerrainParams {
  seed: string;
  elevation: number;
  humidity: number;
  temperature: number;
  dayNightEnabled: boolean;
  mode: NavigationMode;
}

export interface TerrainStats {
  fps: number;
  chunkCount: number;
  mode: NavigationMode;
}

interface ProgramInfo {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

interface Chunk {
  key: string;
  chunkX: number;
  chunkZ: number;
  lod: number;
  vao: WebGLVertexArrayObject;
  vertexBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  indexCount: number;
}

interface WaterMesh {
  vao: WebGLVertexArrayObject;
  vertexBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  indexCount: number;
}

interface ChunkRequest {
  key: string;
  chunkX: number;
  chunkZ: number;
  lod: number;
  distance: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const normalized = clamp((value - edge0) / Math.max(edge1 - edge0, 0.00001), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown shader error";
    gl.deleteShader(shader);
    throw new Error(log);
  }

  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  uniformNames: string[]
): ProgramInfo {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (!program) {
    throw new Error("Failed to create shader program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "unknown link error";
    gl.deleteProgram(program);
    throw new Error(log);
  }

  const uniforms: ProgramInfo["uniforms"] = {};
  for (const name of uniformNames) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  return { program, uniforms };
}

export class TerrainEngine {
  private readonly canvas: HTMLCanvasElement;

  private readonly gl: WebGL2RenderingContext;

  private readonly terrainProgram: ProgramInfo;

  private readonly waterProgram: ProgramInfo;

  private readonly onStats?: (stats: TerrainStats) => void;

  private params: TerrainParams;

  private terrainField: TerrainField;

  private readonly chunkSize = 96;

  private readonly chunkRadius = 3;

  private readonly waterLevel = 0;

  private chunks = new Map<string, Chunk>();

  private chunkQueue: ChunkRequest[] = [];

  private pendingChunkKeys = new Set<string>();

  private waterMesh: WaterMesh;

  private readonly upVector = new Vector3(0, 1, 0);

  private readonly projection = new Matrix4();

  private readonly view = new Matrix4();

  private readonly viewProj = new Matrix4();

  private readonly cameraPosition = new Vector3();

  private readonly cameraTarget = new Vector3();

  private readonly orbitTarget = new Vector3(-46, 32, 28);

  private orbitDistance = 295;

  private orbitYaw = -2.32;

  private orbitPitch = 0.52;

  private readonly firstPersonPosition = new Vector3(-12, 44, 126);

  private readonly firstPersonVelocity = new Vector3();

  private firstPersonYaw = -1.58;

  private firstPersonPitch = -0.25;

  private readonly keyState = new Set<string>();

  private dragging = false;

  private lastPointerX = 0;

  private lastPointerY = 0;

  private frameHandle: number | null = null;

  private lastFrameTime = 0;

  private elapsedTime = 0;

  private dayPhase = 0.22;

  private sunDirection = new Vector3(0.6, 0.8, 0.2);

  private dayAmount = 1;

  private readonly skyColor = new Vector3(0.28, 0.44, 0.67);

  private readonly fogColor = new Vector3(0.23, 0.35, 0.50);

  private statsTimer = 0;

  private fpsFrames = 0;

  private fpsValue = 0;

  private currentChunkX = Number.NaN;

  private currentChunkZ = Number.NaN;

  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    glContext: WebGL2RenderingContext | WebGLRenderingContext,
    initialParams: TerrainParams,
    onStats?: (stats: TerrainStats) => void
  ) {
    if (!(glContext instanceof WebGL2RenderingContext)) {
      throw new Error("TerraGen requires WebGL2 support.");
    }

    this.canvas = canvas;
    this.gl = glContext;
    this.params = { ...initialParams };
    this.terrainField = new TerrainField(initialParams.seed);
    this.onStats = onStats;

    this.terrainProgram = createProgram(this.gl, terrainVertexShader, terrainFragmentShader, [
      "uViewProj",
      "uElevation",
      "uCameraPos",
      "uSunDir",
      "uWaterLevel",
      "uHumidityBias",
      "uTemperatureBias",
      "uDayAmount",
      "uFogColor"
    ]);

    this.waterProgram = createProgram(this.gl, waterVertexShader, waterFragmentShader, [
      "uViewProj",
      "uWaterOffset",
      "uCameraPos",
      "uSunDir",
      "uDayAmount",
      "uTime",
      "uSkyColor",
      "uFogColor"
    ]);

    this.waterMesh = this.createWaterMesh();

    this.setupGlState();
    this.attachEvents();
    this.resize();

    this.updateCamera(0);
    this.syncChunks(true);

    this.lastFrameTime = performance.now();
    this.frameHandle = requestAnimationFrame(this.animate);
  }

  updateParams(nextParams: TerrainParams): void {
    if (this.disposed) {
      return;
    }

    const previousSeed = this.params.seed;
    const previousMode = this.params.mode;

    this.params = { ...nextParams };

    if (previousSeed !== this.params.seed) {
      this.terrainField = new TerrainField(this.params.seed);
      this.resetChunks();
    }

    if (previousMode !== this.params.mode) {
      if (this.params.mode === "firstPerson") {
        this.firstPersonPosition.copy(this.cameraPosition);
        this.firstPersonVelocity.set(0, 0, 0);
      } else {
        this.orbitTarget.copy(this.cameraPosition);
        this.orbitDistance = clamp(this.orbitDistance, 120, 420);
      }
    }
  }

  captureScreenshot(): void {
    const link = document.createElement("a");
    link.download = `terragen-${Date.now()}.png`;
    link.href = this.canvas.toDataURL("image/png");
    link.click();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }

    this.detachEvents();

    for (const chunk of this.chunks.values()) {
      this.disposeChunk(chunk);
    }
    this.chunks.clear();

    this.disposeWaterMesh(this.waterMesh);

    this.gl.deleteProgram(this.terrainProgram.program);
    this.gl.deleteProgram(this.waterProgram.program);
  }

  private readonly animate = (timestamp: number): void => {
    if (this.disposed) {
      return;
    }

    const deltaSeconds = Math.min(0.1, (timestamp - this.lastFrameTime) / 1000);
    this.lastFrameTime = timestamp;

    this.elapsedTime += deltaSeconds;

    if (this.params.dayNightEnabled) {
      this.dayPhase = (this.dayPhase + deltaSeconds * 0.02) % 1;
    }

    this.updateSun();
    this.updateCamera(deltaSeconds);
    this.syncChunks(false);
    this.processChunkQueue(3);

    this.renderFrame();
    this.reportStats(deltaSeconds);

    this.frameHandle = requestAnimationFrame(this.animate);
  };

  private updateSun(): void {
    const angle = this.dayPhase * Math.PI * 2;
    this.sunDirection
      .set(Math.cos(angle), Math.sin(angle), Math.sin(angle * 0.7) * 0.3)
      .normalize();

    const rawDayAmount = clamp(this.sunDirection.y * 0.5 + 0.5, 0, 1);
    const smoothedDayAmount = smoothstep(0.02, 0.98, rawDayAmount);
    this.dayAmount = lerp(this.dayAmount, smoothedDayAmount, 0.08);

    const twilight = 1 - smoothstep(0.07, 0.42, Math.abs(this.sunDirection.y));
    const horizonWarmth = twilight * (0.65 + (1 - this.dayAmount) * 0.35);

    const skyR = clamp(lerp(0.02, 0.42, this.dayAmount) + horizonWarmth * 0.18, 0, 1);
    const skyG = clamp(lerp(0.03, 0.66, this.dayAmount) + horizonWarmth * 0.08, 0, 1);
    const skyB = clamp(lerp(0.08, 0.95, this.dayAmount) + horizonWarmth * 0.02, 0, 1);
    this.skyColor.set(skyR, skyG, skyB);

    const fogMix = lerp(0.32, 0.74, this.dayAmount);
    this.fogColor.set(
      lerp(0.03, skyR, fogMix),
      lerp(0.04, skyG, fogMix),
      lerp(0.07, skyB, fogMix)
    );
  }

  private updateCamera(deltaSeconds: number): void {
    if (this.params.mode === "orbit") {
      const cosPitch = Math.cos(this.orbitPitch);
      this.cameraPosition.set(
        this.orbitTarget.x + Math.cos(this.orbitYaw) * cosPitch * this.orbitDistance,
        this.orbitTarget.y + Math.sin(this.orbitPitch) * this.orbitDistance,
        this.orbitTarget.z + Math.sin(this.orbitYaw) * cosPitch * this.orbitDistance
      );
      this.cameraTarget.copy(this.orbitTarget);
      return;
    }

    const lookForward = new Vector3(
      Math.cos(this.firstPersonPitch) * Math.cos(this.firstPersonYaw),
      Math.sin(this.firstPersonPitch),
      Math.cos(this.firstPersonPitch) * Math.sin(this.firstPersonYaw)
    ).normalize();

    const moveForward = new Vector3(Math.cos(this.firstPersonYaw), 0, Math.sin(this.firstPersonYaw)).normalize();
    const right = new Vector3(moveForward.z, 0, -moveForward.x).normalize();
    const desiredVelocity = new Vector3();

    if (this.keyState.has("w")) {
      desiredVelocity.add(moveForward);
    }
    if (this.keyState.has("s")) {
      desiredVelocity.sub(moveForward);
    }
    if (this.keyState.has("a")) {
      desiredVelocity.sub(right);
    }
    if (this.keyState.has("d")) {
      desiredVelocity.add(right);
    }
    if (this.keyState.has(" ")) {
      desiredVelocity.y += 1;
    }
    if (this.keyState.has("shift")) {
      desiredVelocity.y -= 1;
    }

    const horizontalLength = Math.hypot(desiredVelocity.x, desiredVelocity.z);
    if (horizontalLength > 0) {
      const speed = 68;
      desiredVelocity.x = (desiredVelocity.x / horizontalLength) * speed;
      desiredVelocity.z = (desiredVelocity.z / horizontalLength) * speed;
    }
    desiredVelocity.y *= 30;

    const horizontalResponse =
      horizontalLength > 0 ? 1 - Math.exp(-deltaSeconds * 10.5) : 1 - Math.exp(-deltaSeconds * 7.4);
    this.firstPersonVelocity.x = lerp(this.firstPersonVelocity.x, desiredVelocity.x, horizontalResponse);
    this.firstPersonVelocity.z = lerp(this.firstPersonVelocity.z, desiredVelocity.z, horizontalResponse);

    const verticalResponse =
      desiredVelocity.y !== 0 ? 1 - Math.exp(-deltaSeconds * 9.8) : 1 - Math.exp(-deltaSeconds * 7.8);
    this.firstPersonVelocity.y = lerp(this.firstPersonVelocity.y, desiredVelocity.y, verticalResponse);

    this.firstPersonPosition.add(this.firstPersonVelocity.clone().multiplyScalar(deltaSeconds));

    const ground = this.terrainField.sampleHeight(
      this.firstPersonPosition.x,
      this.firstPersonPosition.z
    ) * this.params.elevation;
    if (this.firstPersonPosition.y < ground + 8) {
      this.firstPersonPosition.y = ground + 8;
      this.firstPersonVelocity.y = Math.max(0, this.firstPersonVelocity.y);
    }

    this.cameraPosition.copy(this.firstPersonPosition);
    this.cameraTarget.copy(this.firstPersonPosition.clone().add(lookForward));
  }

  private renderFrame(): void {
    this.resize();

    const gl = this.gl;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const aspect = width / Math.max(1, height);

    this.projection.makePerspective((58 * Math.PI) / 180, aspect, 0.1, 2600);
    this.view.lookAt(this.cameraPosition, this.cameraTarget, this.upVector);
    this.viewProj.multiplyMatrices(this.projection, this.view);

    gl.viewport(0, 0, width, height);
    gl.clearColor(this.skyColor.x, this.skyColor.y, this.skyColor.z, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.renderTerrain();
    this.renderWater();
  }

  private renderTerrain(): void {
    const gl = this.gl;
    const program = this.terrainProgram;
    gl.useProgram(program.program);

    gl.uniformMatrix4fv(program.uniforms.uViewProj, false, this.viewProj.elements);
    gl.uniform1f(program.uniforms.uElevation, this.params.elevation);
    gl.uniform3f(
      program.uniforms.uCameraPos,
      this.cameraPosition.x,
      this.cameraPosition.y,
      this.cameraPosition.z
    );
    gl.uniform3f(
      program.uniforms.uSunDir,
      this.sunDirection.x,
      this.sunDirection.y,
      this.sunDirection.z
    );
    gl.uniform1f(program.uniforms.uWaterLevel, this.waterLevel);
    gl.uniform1f(program.uniforms.uHumidityBias, this.params.humidity);
    gl.uniform1f(program.uniforms.uTemperatureBias, this.params.temperature);
    gl.uniform1f(program.uniforms.uDayAmount, this.dayAmount);
    gl.uniform3f(
      program.uniforms.uFogColor,
      this.fogColor.x,
      this.fogColor.y,
      this.fogColor.z
    );

    for (const chunk of this.chunks.values()) {
      gl.bindVertexArray(chunk.vao);
      gl.drawElements(gl.TRIANGLES, chunk.indexCount, gl.UNSIGNED_SHORT, 0);
    }

    gl.bindVertexArray(null);
  }

  private renderWater(): void {
    const gl = this.gl;
    const program = this.waterProgram;

    const repeat = this.chunkSize * 2;
    const offsetX = Math.floor(this.cameraPosition.x / repeat) * repeat;
    const offsetZ = Math.floor(this.cameraPosition.z / repeat) * repeat;

    gl.useProgram(program.program);
    gl.uniformMatrix4fv(program.uniforms.uViewProj, false, this.viewProj.elements);
    gl.uniform3f(program.uniforms.uWaterOffset, offsetX, this.waterLevel, offsetZ);
    gl.uniform3f(
      program.uniforms.uCameraPos,
      this.cameraPosition.x,
      this.cameraPosition.y,
      this.cameraPosition.z
    );
    gl.uniform3f(
      program.uniforms.uSunDir,
      this.sunDirection.x,
      this.sunDirection.y,
      this.sunDirection.z
    );
    gl.uniform1f(program.uniforms.uDayAmount, this.dayAmount);
    gl.uniform1f(program.uniforms.uTime, this.elapsedTime);
    gl.uniform3f(program.uniforms.uSkyColor, this.skyColor.x, this.skyColor.y, this.skyColor.z);
    gl.uniform3f(
      program.uniforms.uFogColor,
      this.fogColor.x,
      this.fogColor.y,
      this.fogColor.z
    );

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    gl.bindVertexArray(this.waterMesh.vao);
    gl.drawElements(gl.TRIANGLES, this.waterMesh.indexCount, gl.UNSIGNED_SHORT, 0);

    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  private setupGlState(): void {
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  private syncChunks(generateImmediate: boolean): void {
    const focus = this.params.mode === "orbit" ? this.orbitTarget : this.firstPersonPosition;
    const chunkX = Math.floor(focus.x / this.chunkSize);
    const chunkZ = Math.floor(focus.z / this.chunkSize);

    if (!generateImmediate && chunkX === this.currentChunkX && chunkZ === this.currentChunkZ) {
      return;
    }

    this.currentChunkX = chunkX;
    this.currentChunkZ = chunkZ;

    const desired = new Map<string, ChunkRequest>();

    for (let dz = -this.chunkRadius; dz <= this.chunkRadius; dz += 1) {
      for (let dx = -this.chunkRadius; dx <= this.chunkRadius; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dz));
        const lod = this.lodForDistance(distance);

        const request: ChunkRequest = {
          key: `${chunkX + dx},${chunkZ + dz}`,
          chunkX: chunkX + dx,
          chunkZ: chunkZ + dz,
          lod,
          distance
        };

        desired.set(request.key, request);
      }
    }

    for (const existing of this.chunks.values()) {
      const wanted = desired.get(existing.key);
      if (!wanted || wanted.lod !== existing.lod) {
        this.disposeChunk(existing);
        this.chunks.delete(existing.key);
      }
    }

    for (const request of desired.values()) {
      const existing = this.chunks.get(request.key);
      if (existing && existing.lod === request.lod) {
        continue;
      }
      if (this.pendingChunkKeys.has(request.key)) {
        continue;
      }
      this.pendingChunkKeys.add(request.key);

      if (generateImmediate && request.distance <= 1) {
        const chunk = this.createChunk(request);
        this.chunks.set(request.key, chunk);
        this.pendingChunkKeys.delete(request.key);
      } else {
        this.chunkQueue.push(request);
      }
    }

    this.chunkQueue.sort((a, b) => a.distance - b.distance);
  }

  private processChunkQueue(maxPerFrame: number): void {
    let generated = 0;

    while (generated < maxPerFrame && this.chunkQueue.length > 0) {
      const request = this.chunkQueue.shift();
      if (!request) {
        break;
      }

      const dx = Math.abs(request.chunkX - this.currentChunkX);
      const dz = Math.abs(request.chunkZ - this.currentChunkZ);
      const distance = Math.max(dx, dz);
      if (distance > this.chunkRadius || this.lodForDistance(distance) !== request.lod) {
        this.pendingChunkKeys.delete(request.key);
        continue;
      }

      if (this.chunks.has(request.key)) {
        this.pendingChunkKeys.delete(request.key);
        continue;
      }

      const chunk = this.createChunk(request);
      this.chunks.set(request.key, chunk);
      this.pendingChunkKeys.delete(request.key);
      generated += 1;
    }
  }

  private lodForDistance(distance: number): number {
    if (distance <= 1) {
      return 52;
    }
    if (distance === 2) {
      return 30;
    }
    return 18;
  }

  private createChunk(request: ChunkRequest): Chunk {
    const gl = this.gl;
    const lod = request.lod;
    const vertexCount = (lod + 1) * (lod + 1);
    const stride = 8;

    const vertices = new Float32Array(vertexCount * stride);
    const step = this.chunkSize / lod;
    const baseX = request.chunkX * this.chunkSize - this.chunkSize * 0.5;
    const baseZ = request.chunkZ * this.chunkSize - this.chunkSize * 0.5;
    const normalStep = step * 0.5;

    let cursor = 0;
    for (let z = 0; z <= lod; z += 1) {
      for (let x = 0; x <= lod; x += 1) {
        const worldX = baseX + x * step;
        const worldZ = baseZ + z * step;

        const height = this.terrainField.sampleHeight(worldX, worldZ);
        const humidity = this.terrainField.sampleHumidity(worldX, worldZ);
        const temperature = this.terrainField.sampleTemperature(worldX, worldZ, height);

        const hL = this.terrainField.sampleHeight(worldX - normalStep, worldZ);
        const hR = this.terrainField.sampleHeight(worldX + normalStep, worldZ);
        const hD = this.terrainField.sampleHeight(worldX, worldZ - normalStep);
        const hU = this.terrainField.sampleHeight(worldX, worldZ + normalStep);

        const nx = hL - hR;
        const ny = 2 * normalStep;
        const nz = hD - hU;
        const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);

        vertices[cursor + 0] = worldX;
        vertices[cursor + 1] = height;
        vertices[cursor + 2] = worldZ;
        vertices[cursor + 3] = nx * invLen;
        vertices[cursor + 4] = ny * invLen;
        vertices[cursor + 5] = nz * invLen;
        vertices[cursor + 6] = humidity;
        vertices[cursor + 7] = temperature;

        cursor += stride;
      }
    }

    const indices = new Uint16Array(lod * lod * 6);
    let indexCursor = 0;

    for (let z = 0; z < lod; z += 1) {
      for (let x = 0; x < lod; x += 1) {
        const row = z * (lod + 1);
        const i0 = row + x;
        const i1 = i0 + 1;
        const i2 = i0 + (lod + 1);
        const i3 = i2 + 1;

        indices[indexCursor + 0] = i0;
        indices[indexCursor + 1] = i2;
        indices[indexCursor + 2] = i1;
        indices[indexCursor + 3] = i1;
        indices[indexCursor + 4] = i2;
        indices[indexCursor + 5] = i3;

        indexCursor += 6;
      }
    }

    const vao = gl.createVertexArray();
    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();

    if (!vao || !vertexBuffer || !indexBuffer) {
      throw new Error("Failed to create GPU chunk buffers.");
    }

    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride * 4, 3 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride * 4, 6 * 4);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride * 4, 7 * 4);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    return {
      key: request.key,
      chunkX: request.chunkX,
      chunkZ: request.chunkZ,
      lod,
      vao,
      vertexBuffer,
      indexBuffer,
      indexCount: indices.length
    };
  }

  private disposeChunk(chunk: Chunk): void {
    this.gl.deleteVertexArray(chunk.vao);
    this.gl.deleteBuffer(chunk.vertexBuffer);
    this.gl.deleteBuffer(chunk.indexBuffer);
  }

  private resetChunks(): void {
    for (const chunk of this.chunks.values()) {
      this.disposeChunk(chunk);
    }

    this.chunks.clear();
    this.chunkQueue.length = 0;
    this.pendingChunkKeys.clear();
    this.currentChunkX = Number.NaN;
    this.currentChunkZ = Number.NaN;

    this.syncChunks(true);
  }

  private createWaterMesh(): WaterMesh {
    const gl = this.gl;
    const subdivisions = 120;
    const size = this.chunkSize * (this.chunkRadius * 2 + 2);
    const half = size * 0.5;

    const vertices = new Float32Array((subdivisions + 1) * (subdivisions + 1) * 3);
    let cursor = 0;

    for (let z = 0; z <= subdivisions; z += 1) {
      const vz = -half + (z / subdivisions) * size;
      for (let x = 0; x <= subdivisions; x += 1) {
        const vx = -half + (x / subdivisions) * size;
        vertices[cursor + 0] = vx;
        vertices[cursor + 1] = 0;
        vertices[cursor + 2] = vz;
        cursor += 3;
      }
    }

    const indices = new Uint16Array(subdivisions * subdivisions * 6);
    let indexCursor = 0;

    for (let z = 0; z < subdivisions; z += 1) {
      for (let x = 0; x < subdivisions; x += 1) {
        const row = z * (subdivisions + 1);
        const i0 = row + x;
        const i1 = i0 + 1;
        const i2 = i0 + subdivisions + 1;
        const i3 = i2 + 1;

        indices[indexCursor + 0] = i0;
        indices[indexCursor + 1] = i2;
        indices[indexCursor + 2] = i1;
        indices[indexCursor + 3] = i1;
        indices[indexCursor + 4] = i2;
        indices[indexCursor + 5] = i3;

        indexCursor += 6;
      }
    }

    const vao = gl.createVertexArray();
    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();

    if (!vao || !vertexBuffer || !indexBuffer) {
      throw new Error("Failed to create water mesh.");
    }

    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 3 * 4, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    return {
      vao,
      vertexBuffer,
      indexBuffer,
      indexCount: indices.length
    };
  }

  private disposeWaterMesh(mesh: WaterMesh): void {
    this.gl.deleteVertexArray(mesh.vao);
    this.gl.deleteBuffer(mesh.vertexBuffer);
    this.gl.deleteBuffer(mesh.indexBuffer);
  }

  private reportStats(deltaSeconds: number): void {
    if (!this.onStats) {
      return;
    }

    this.fpsFrames += 1;
    this.statsTimer += deltaSeconds;

    if (this.statsTimer >= 0.4) {
      this.fpsValue = this.fpsFrames / this.statsTimer;
      this.fpsFrames = 0;
      this.statsTimer = 0;

      this.onStats({
        fps: this.fpsValue,
        chunkCount: this.chunks.size,
        mode: this.params.mode
      });
    }
  }

  private resize = (): void => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const targetWidth = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const targetHeight = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));

    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }
  };

  private attachEvents(): void {
    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("resize", this.resize);
    this.canvas.addEventListener("contextmenu", this.preventContextMenu);
  }

  private detachEvents(): void {
    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("resize", this.resize);
    this.canvas.removeEventListener("contextmenu", this.preventContextMenu);
  }

  private preventContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) {
      return;
    }

    this.dragging = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
  };

  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.dragging) {
      return;
    }

    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;

    if (this.params.mode === "orbit") {
      this.orbitYaw -= deltaX * 0.0044;
      this.orbitPitch = clamp(this.orbitPitch - deltaY * 0.0044, -1.45, 1.45);
      return;
    }

    this.firstPersonYaw -= deltaX * 0.0032;
    this.firstPersonPitch = clamp(this.firstPersonPitch - deltaY * 0.0032, -1.45, 1.45);
  };

  private handleMouseUp = (): void => {
    this.dragging = false;
  };

  private handleWheel = (event: WheelEvent): void => {
    if (this.params.mode !== "orbit") {
      return;
    }

    event.preventDefault();
    this.orbitDistance = clamp(this.orbitDistance + event.deltaY * 0.2, 45, 500);
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    this.keyState.add(event.key.toLowerCase());
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keyState.delete(event.key.toLowerCase());
  };
}
