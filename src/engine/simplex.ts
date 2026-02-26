const GRADIENTS: ReadonlyArray<[number, number]> = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0, 1],
  [0, -1]
];

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SimplexNoise2D {
  private readonly perm: Uint8Array;

  private readonly permMod12: Uint8Array;

  constructor(seed: string) {
    const random = mulberry32(hashSeed(seed));
    const p = new Uint8Array(256);

    for (let i = 0; i < 256; i += 1) {
      p[i] = i;
    }

    for (let i = 255; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const swap = p[i];
      p[i] = p[j];
      p[j] = swap;
    }

    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);

    for (let i = 0; i < 512; i += 1) {
      const value = p[i & 255];
      this.perm[i] = value;
      this.permMod12[i] = value % 12;
    }
  }

  noise2D(xin: number, yin: number): number {
    const skew = (xin + yin) * F2;
    const i = Math.floor(xin + skew);
    const j = Math.floor(yin + skew);

    const unskew = (i + j) * G2;
    const x0 = xin - (i - unskew);
    const y0 = yin - (j - unskew);

    let i1 = 0;
    let j1 = 0;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    const gi0 = this.permMod12[ii + this.perm[jj]];
    const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
    const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];

    const n0 = this.cornerContribution(gi0, x0, y0);
    const n1 = this.cornerContribution(gi1, x1, y1);
    const n2 = this.cornerContribution(gi2, x2, y2);

    return 70 * (n0 + n1 + n2);
  }

  fractal2D(
    x: number,
    y: number,
    octaves: number,
    lacunarity = 2,
    gain = 0.5
  ): number {
    let amplitude = 1;
    let frequency = 1;
    let value = 0;
    let maxAmplitude = 0;

    for (let octave = 0; octave < octaves; octave += 1) {
      value += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxAmplitude += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return maxAmplitude > 0 ? value / maxAmplitude : 0;
  }

  private cornerContribution(gradientIndex: number, x: number, y: number): number {
    let t = 0.5 - x * x - y * y;
    if (t < 0) {
      return 0;
    }
    t *= t;
    const gradient = GRADIENTS[gradientIndex];
    return t * t * (gradient[0] * x + gradient[1] * y);
  }
}
