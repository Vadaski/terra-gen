import { SimplexNoise2D } from "./simplex";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class TerrainField {
  private readonly continentalNoise: SimplexNoise2D;

  private readonly mountainNoise: SimplexNoise2D;

  private readonly detailNoise: SimplexNoise2D;

  private readonly humidityNoise: SimplexNoise2D;

  private readonly temperatureNoise: SimplexNoise2D;

  constructor(seed: string) {
    this.continentalNoise = new SimplexNoise2D(`${seed}:continental`);
    this.mountainNoise = new SimplexNoise2D(`${seed}:mountain`);
    this.detailNoise = new SimplexNoise2D(`${seed}:detail`);
    this.humidityNoise = new SimplexNoise2D(`${seed}:humidity`);
    this.temperatureNoise = new SimplexNoise2D(`${seed}:temperature`);
  }

  sampleHeight(x: number, z: number): number {
    const continental = this.continentalNoise.fractal2D(x * 0.0018, z * 0.0018, 5, 2, 0.53);
    const mountain = this.mountainNoise.fractal2D(x * 0.006, z * 0.006, 4, 2.1, 0.5);
    const ridged = 1 - Math.abs(this.mountainNoise.fractal2D(x * 0.0105, z * 0.0105, 3, 2.3, 0.48));
    const detail = this.detailNoise.fractal2D(x * 0.027, z * 0.027, 3, 2.2, 0.45);

    const valleys = continental * 54;
    const uplifts = mountain * 22;
    const ridges = ridged * 41;
    const micro = detail * 8;

    return valleys + uplifts + ridges + micro - 24;
  }

  sampleHumidity(x: number, z: number): number {
    const base = this.humidityNoise.fractal2D(x * 0.0022, z * 0.0022, 4, 2, 0.55);
    const detail = this.humidityNoise.fractal2D(x * 0.009, z * 0.009, 2, 2.3, 0.45);
    return clamp(0.54 + base * 0.36 + detail * 0.14, 0, 1);
  }

  sampleTemperature(x: number, z: number, height: number): number {
    const latitude = clamp(0.72 - Math.abs(z) * 0.00028, 0.08, 0.95);
    const noise = this.temperatureNoise.fractal2D(x * 0.0014, z * 0.0014, 4, 2.1, 0.5);
    const altitudePenalty = Math.max(0, height) * 0.0036;

    return clamp(latitude + noise * 0.23 - altitudePenalty, 0, 1);
  }
}
