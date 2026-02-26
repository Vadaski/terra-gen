export class Vector3 {
  x: number;

  y: number;

  z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(vector: Vector3): this {
    this.x = vector.x;
    this.y = vector.y;
    this.z = vector.z;
    return this;
  }

  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  add(vector: Vector3): this {
    this.x += vector.x;
    this.y += vector.y;
    this.z += vector.z;
    return this;
  }

  sub(vector: Vector3): this {
    this.x -= vector.x;
    this.y -= vector.y;
    this.z -= vector.z;
    return this;
  }

  multiplyScalar(scalar: number): this {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  normalize(): this {
    const len = this.length() || 1;
    return this.multiplyScalar(1 / len);
  }

  dot(vector: Vector3): number {
    return this.x * vector.x + this.y * vector.y + this.z * vector.z;
  }

  cross(vector: Vector3): this {
    const x = this.y * vector.z - this.z * vector.y;
    const y = this.z * vector.x - this.x * vector.z;
    const z = this.x * vector.y - this.y * vector.x;
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  crossVectors(a: Vector3, b: Vector3): this {
    const x = a.y * b.z - a.z * b.y;
    const y = a.z * b.x - a.x * b.z;
    const z = a.x * b.y - a.y * b.x;
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
}

export class Matrix4 {
  elements: Float32Array;

  constructor() {
    this.elements = new Float32Array(16);
    this.identity();
  }

  identity(): this {
    const te = this.elements;
    te[0] = 1;
    te[1] = 0;
    te[2] = 0;
    te[3] = 0;
    te[4] = 0;
    te[5] = 1;
    te[6] = 0;
    te[7] = 0;
    te[8] = 0;
    te[9] = 0;
    te[10] = 1;
    te[11] = 0;
    te[12] = 0;
    te[13] = 0;
    te[14] = 0;
    te[15] = 1;
    return this;
  }

  copy(matrix: Matrix4): this {
    this.elements.set(matrix.elements);
    return this;
  }

  multiplyMatrices(a: Matrix4, b: Matrix4): this {
    const ae = a.elements;
    const be = b.elements;
    const te = this.elements;

    const a11 = ae[0];
    const a12 = ae[4];
    const a13 = ae[8];
    const a14 = ae[12];
    const a21 = ae[1];
    const a22 = ae[5];
    const a23 = ae[9];
    const a24 = ae[13];
    const a31 = ae[2];
    const a32 = ae[6];
    const a33 = ae[10];
    const a34 = ae[14];
    const a41 = ae[3];
    const a42 = ae[7];
    const a43 = ae[11];
    const a44 = ae[15];

    const b11 = be[0];
    const b12 = be[4];
    const b13 = be[8];
    const b14 = be[12];
    const b21 = be[1];
    const b22 = be[5];
    const b23 = be[9];
    const b24 = be[13];
    const b31 = be[2];
    const b32 = be[6];
    const b33 = be[10];
    const b34 = be[14];
    const b41 = be[3];
    const b42 = be[7];
    const b43 = be[11];
    const b44 = be[15];

    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

    return this;
  }

  makePerspective(fovRadians: number, aspect: number, near: number, far: number): this {
    const te = this.elements;
    const f = 1 / Math.tan(fovRadians / 2);
    const nf = 1 / (near - far);

    te[0] = f / aspect;
    te[1] = 0;
    te[2] = 0;
    te[3] = 0;

    te[4] = 0;
    te[5] = f;
    te[6] = 0;
    te[7] = 0;

    te[8] = 0;
    te[9] = 0;
    te[10] = (far + near) * nf;
    te[11] = -1;

    te[12] = 0;
    te[13] = 0;
    te[14] = 2 * far * near * nf;
    te[15] = 0;

    return this;
  }

  lookAt(eye: Vector3, target: Vector3, up: Vector3): this {
    const te = this.elements;

    const z = eye.clone().sub(target).normalize();
    const x = up.clone().cross(z).normalize();
    const y = z.clone().cross(x).normalize();

    te[0] = x.x;
    te[1] = y.x;
    te[2] = z.x;
    te[3] = 0;

    te[4] = x.y;
    te[5] = y.y;
    te[6] = z.y;
    te[7] = 0;

    te[8] = x.z;
    te[9] = y.z;
    te[10] = z.z;
    te[11] = 0;

    te[12] = -x.dot(eye);
    te[13] = -y.dot(eye);
    te[14] = -z.dot(eye);
    te[15] = 1;

    return this;
  }
}
