export const terrainVertexShader = `#version 300 es
precision highp float;

layout (location = 0) in vec3 aPosition;
layout (location = 1) in vec3 aNormal;
layout (location = 2) in float aHumidity;
layout (location = 3) in float aTemperature;

uniform mat4 uViewProj;
uniform float uElevation;

out vec3 vWorldPos;
out vec3 vNormal;
out float vHumidity;
out float vTemperature;
out float vHeight;

void main() {
  vec3 world = aPosition;
  world.y *= uElevation;
  vec3 adjustedNormal = normalize(vec3(aNormal.x, aNormal.y / max(uElevation, 0.001), aNormal.z));

  vWorldPos = world;
  vNormal = adjustedNormal;
  vHumidity = aHumidity;
  vTemperature = aTemperature;
  vHeight = world.y;

  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const terrainFragmentShader = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in float vHumidity;
in float vTemperature;
in float vHeight;

uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform float uWaterLevel;
uniform float uHumidityBias;
uniform float uTemperatureBias;
uniform float uDayAmount;
uniform vec3 uFogColor;

out vec4 outColor;

vec3 pickBiome(float h, float humidity, float temperature) {
  vec3 deepOcean = vec3(0.01, 0.08, 0.30);
  vec3 shallowOcean = vec3(0.03, 0.20, 0.50);
  vec3 beach = vec3(0.85, 0.70, 0.36);
  vec3 grass = vec3(0.20, 0.63, 0.24);
  vec3 forest = vec3(0.05, 0.29, 0.14);
  vec3 snow = vec3(0.96, 0.98, 1.0);

  if (h < uWaterLevel + 0.55) {
    float depth = smoothstep(uWaterLevel - 26.0, uWaterLevel + 0.5, h);
    return mix(deepOcean, shallowOcean, depth);
  }

  if (h < uWaterLevel + 3.2) {
    float shore = smoothstep(uWaterLevel + 0.4, uWaterLevel + 3.2, h);
    return mix(beach * 0.86, beach, shore);
  }

  if (h > 84.0 || (h > 64.0 && temperature < 0.36) || temperature < 0.18) {
    return snow;
  }

  if (humidity > 0.66) {
    return mix(forest * 0.90, forest, humidity);
  }

  return mix(grass * 0.88, grass, humidity * 0.36);
}

void main() {
  float humidity = clamp(vHumidity * uHumidityBias, 0.0, 1.0);
  float temperature = clamp(vTemperature * uTemperatureBias, 0.0, 1.0);

  vec3 biome = pickBiome(vHeight, humidity, temperature);

  float slope = 1.0 - clamp(vNormal.y, 0.0, 1.0);
  biome = mix(biome, biome * 0.58, smoothstep(0.34, 0.98, slope));

  vec3 normal = normalize(vNormal);
  vec3 sunDirection = normalize(uSunDir);

  float hemisphere = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  float ambient = mix(0.12, 0.34, uDayAmount) * mix(0.75, 1.08, hemisphere);
  float diffuse = max(dot(normal, sunDirection), 0.0);
  float light = ambient + diffuse * mix(0.25, 0.98, uDayAmount);

  vec3 color = biome * light;

  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  float rim = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.2);
  color += rim * mix(vec3(0.015, 0.02, 0.04), vec3(0.08, 0.11, 0.14), uDayAmount);

  float distanceToCamera = length(vWorldPos - uCameraPos);
  float fogDensity = mix(0.00128, 0.0009, uDayAmount);
  float fog = 1.0 - exp(-pow(distanceToCamera * fogDensity, 1.35));

  color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

  outColor = vec4(color, 1.0);
}
`;

export const waterVertexShader = `#version 300 es
precision highp float;

layout (location = 0) in vec3 aPosition;

uniform mat4 uViewProj;
uniform vec3 uWaterOffset;
uniform float uTime;

out vec3 vWorldPos;
out vec3 vNormal;

void main() {
  vec3 world = aPosition + uWaterOffset;

  float waveA = sin((world.x + uTime * 22.0) * 0.041) * 0.58;
  float waveBArg = world.z * 0.035 - uTime * 1.8 + world.x * 0.012;
  float waveB = cos(waveBArg) * 0.42;
  float waveCArg = (world.x + world.z) * 0.021 - uTime * 1.45;
  float waveC = sin(waveCArg) * 0.26;
  world.y += waveA + waveB + waveC;

  float slopeX = cos((world.x + uTime * 22.0) * 0.041) * 0.58 * 0.041;
  slopeX += -sin(waveBArg) * 0.42 * 0.012;
  slopeX += cos(waveCArg) * 0.26 * 0.021;

  float slopeZ = -sin(waveBArg) * 0.42 * 0.035;
  slopeZ += cos(waveCArg) * 0.26 * 0.021;

  vNormal = normalize(vec3(-slopeX, 1.0, -slopeZ));
  vWorldPos = world;

  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const waterFragmentShader = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;

uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform float uDayAmount;
uniform float uTime;
uniform vec3 uSkyColor;
uniform vec3 uFogColor;

out vec4 outColor;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  vec3 sunDirection = normalize(uSunDir);

  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);
  float glint = pow(max(dot(reflect(-sunDirection, normal), viewDir), 0.0), 120.0);

  float ripple = sin(vWorldPos.x * 0.035 + uTime * 1.9) * cos(vWorldPos.z * 0.029 - uTime * 1.4);
  float micro = sin((vWorldPos.x + vWorldPos.z) * 0.08 - uTime * 2.8) * 0.5 + 0.5;

  vec3 deep = vec3(0.005, 0.07, 0.20);
  vec3 shallow = vec3(0.05, 0.25, 0.44);
  vec3 refracted = mix(deep, shallow, 0.44 + ripple * 0.24 + micro * 0.1);

  vec3 horizon = mix(vec3(0.02, 0.04, 0.11), uSkyColor, 0.72);
  vec3 sky = mix(horizon, uSkyColor, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));

  vec3 reflected = sky + glint * mix(vec3(0.18, 0.22, 0.28), vec3(1.0, 0.82, 0.54), uDayAmount);
  vec3 color = mix(refracted, reflected, clamp(0.35 + fresnel * 0.7, 0.0, 1.0));

  float distanceToCamera = length(vWorldPos - uCameraPos);
  float fog = 1.0 - exp(-pow(distanceToCamera * 0.00108, 1.28));
  color = mix(color, uFogColor, fog * 0.72);

  outColor = vec4(color, 0.78);
}
`;
