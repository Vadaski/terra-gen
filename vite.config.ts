import { defineConfig } from "vite";

const fiberShimPath = new URL("./src/shims/reactThreeFiber.tsx", import.meta.url).pathname;
const threeShimPath = new URL("./src/shims/three.ts", import.meta.url).pathname;

export default defineConfig({
  base: "/terra-gen/",
  resolve: {
    alias: {
      "@react-three/fiber": fiberShimPath,
      three: threeShimPath
    }
  }
});
