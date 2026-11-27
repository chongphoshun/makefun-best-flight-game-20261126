// Nusantara Sky Courier v3 — REAL 3D scene in raw WebGL1. No library, no
// network, no assets: every mesh is generated in code (terrain heightfield,
// low-poly aircraft, torus rings, runway, landmarks), every texture is a
// procedural canvas gradient. The 2D cockpit/HUD/panels stay on the overlay
// canvas (render.js); this module only paints the world behind them.
//
// World units are metres. The plane sits at the origin; the course runs
// straight down -Z. Absolute course coordinates: s = dist(nm)*1852 m along
// the course, x = lateral(nm)*1852 m across it. Terrain is sampled from a
// deterministic value-noise heightfield at absolute course coords, so it
// scrolls continuously and identically for a given seed/region.
//
// If WebGL is unavailable (or the context is lost) createScene3D returns
// null and render.js falls back to the v2 2D scene — the game never goes
// black.
import { REGION_BY_ID } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const NM = 1852;
const FT = 0.3048;

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ---- deterministic value noise ----
function hash2(ix, iz, seed) {
  let n = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967296;
}
function vnoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}
function fbm(x, z, seed) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o += 1) {
    v += amp * vnoise(x * f, z * f, seed + o * 131);
    amp *= 0.5;
    f *= 2;
  }
  return v; // ~0..1
}
function regionSeed(id) {
  let s = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    s ^= id.charCodeAt(i);
    s = Math.imul(s, 16777619);
  }
  return s >>> 0;
}

// ---- per-region 3D flavour ----
const REGION3D = {
  bromo: { peak: 260, base: 40, ridge: 520, water: false, cone: { x: 700, z: 2000, r: 900, h: 1150 } },
  bali: { peak: 200, base: 30, ridge: 300, water: true, terraces: true },
  rajaampat: { peak: 90, base: -55, ridge: 200, water: true, karst: true },
  jakarta: { peak: 40, base: 10, ridge: 80, water: true, city: true },
  borneo: { peak: 180, base: 25, ridge: 320, water: true, river: true },
  komodo: { peak: 170, base: 20, ridge: 260, water: true, beach: true },
  toba: { peak: 150, base: -25, ridge: 300, water: true, island: true },
};

function gauss(dx, dz, r) {
  const d2 = (dx * dx + dz * dz) / (r * r);
  return Math.exp(-d2 * 1.6);
}

function terrainHeight(ax, as, region) {
  const p = REGION3D[region.id] || REGION3D.bromo;
  const seed = regionSeed(region.id);
  const n = fbm(ax * 0.0011, as * 0.0011, seed);
  let h = p.base + (n - 0.5) * 2 * p.peak;
  // Valley carve: the flight corridor stays gentle so the plane never has
  // to thread a mountain on the centreline; ridges rise to the sides.
  const carve = 0.25 + 0.75 * smoothstep(150, 1300, Math.abs(ax));
  h *= carve;
  const wall = smoothstep(1800, 2600, Math.abs(ax)) * p.ridge;
  h += wall * (0.6 + 0.4 * fbm(ax * 0.0006 + 7, as * 0.0006, seed + 3));
  if (p.cone) h += p.cone.h * gauss(ax - p.cone.x, as - p.cone.z, p.cone.r);
  if (p.karst) {
    for (let i = 0; i < 8; i += 1) {
      const kx = (hash2(i, 11, seed) - 0.5) * 2400;
      const kz = 1200 + i * 1300 + hash2(i, 23, seed) * 500;
      h += (350 + hash2(i, 37, seed) * 270) * gauss(ax - kx, as - kz, 130 + hash2(i, 41, seed) * 70);
    }
  }
  if (p.island) h += 260 * gauss(ax - 350, as - 4200, 950);
  if (p.river) {
    const xr = 380 * Math.sin(as * 0.00035 + 1.2);
    const d = Math.abs(ax - xr);
    if (d < 90) h = Math.min(h, 4 + d * 0.12);
  }
  if (p.terraces && h > 0 && h < 320) h = Math.floor(h / 34) * 34 + 6;
  if (p.city) h *= 0.35;
  return Math.max(h, p.water ? -45 : -5);
}

function terrainColor(ax, as, h, slope, region) {
  const p = REGION3D[region.id] || REGION3D.bromo;
  const ground = hexRgb(region.ground);
  const far = hexRgb(region.groundFar);
  // Base is the rich ground colour; distance fog (not height) fades far
  // terrain toward the sky. Only high ground drifts toward the paler far
  // colour. The old height lerp washed the whole foreground pale.
  const ft = clamp((h - 320) / 400, 0, 0.6);
  let c = [
    lerp(ground[0], far[0], ft),
    lerp(ground[1], far[1], ft),
    lerp(ground[2], far[2], ft),
  ];
  if (p.water && h < 9) c = [0.92, 0.85, 0.62]; // wide sand fringe at the waterline
  if (p.beach && h < 22) c = [0.95, 0.63, 0.71]; // pink beach
  if (p.river) {
    const xr = 380 * Math.sin(as * 0.00035 + 1.2);
    if (Math.abs(ax - xr) < 70) c = hexRgb(region.water);
  }
  if (p.terraces && h > 0 && h < 320) {
    const step = Math.floor(h / 34) % 2;
    c = step ? [0.18, 0.49, 0.20] : [0.34, 0.70, 0.37];
  }
  if (h > 620) { // rock
    const t = clamp((h - 620) / 200, 0, 1);
    c = [lerp(c[0], 0.45, t), lerp(c[1], 0.44, t), lerp(c[2], 0.42, t)];
  }
  if (h > 850) { // snow caps
    const t = clamp((h - 850) / 120, 0, 1);
    c = [lerp(c[0], 0.92, t), lerp(c[1], 0.93, t), lerp(c[2], 0.95, t)];
  }
  if (slope > 0.55) { // steep faces read as rock
    c = [lerp(c[0], 0.4, 0.5), lerp(c[1], 0.38, 0.5), lerp(c[2], 0.36, 0.5)];
  }
  // Forest (v4): low-slope mid-altitude ground reads as vegetation, not
  // bare grass — a second noise field tints patches deep green, so the
  // ground has vegetation zones visible from altitude.
  if (h > 15 && h < 520 && slope < 0.35) {
    const forest = fbm(ax * 0.012 + 53, as * 0.012 + 29, regionSeed(region.id) + 21);
    const t = smoothstep(0.55, 0.78, forest) * 0.55;
    c = [lerp(c[0], 0.10, t), lerp(c[1], 0.42, t), lerp(c[2], 0.16, t)];
  }
  // Rock speckle (v5): high ground gets fine dark/light variation so a big
  // cone or karst face reads as textured rock, not one smooth grey mass.
  if (h > 450) {
    const sp = 0.82 + 0.36 * vnoise(ax * 0.05 + 7, as * 0.05 + 3, regionSeed(region.id) + 5);
    c = [clamp(c[0] * sp, 0, 1), clamp(c[1] * sp, 0, 1), clamp(c[2] * sp, 0, 1)];
  }
  // Patchiness: a second noise breaks the flat colour into grass/forest
  // patches, so the ground reads as terrain, not a painted backdrop.
  // v5: frequency x2.5 (50 m patches) — the v4 125 m patches blurred into
  // one wash at screenshot scale.
  const patch = 0.78 + 0.44 * fbm(ax * 0.02 + 31, as * 0.02 + 17, regionSeed(region.id) + 9);
  return [clamp(c[0] * patch, 0, 1), clamp(c[1] * patch, 0, 1), clamp(c[2] * patch, 0, 1)];
}

// ---- mat4 (column-major) ----
function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
function mat4Multiply(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}
function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const o = new Float32Array(16);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) / (near - far);
  o[11] = -1;
  o[14] = (2 * far * near) / (near - far);
  return o;
}
function mat4LookAt(eye, center, up) {
  let zx = eye[0] - center[0];
  let zy = eye[1] - center[1];
  let zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const o = new Float32Array(16);
  o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
  o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
  o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
  o[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  o[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  o[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  o[15] = 1;
  return o;
}
function mat4Translate(x, y, z) {
  const o = mat4Identity();
  o[12] = x; o[13] = y; o[14] = z;
  return o;
}
function mat4Scale(x, y, z) {
  const o = mat4Identity();
  o[0] = x; o[5] = y; o[10] = z;
  return o;
}
function mat4RotateY(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const o = mat4Identity();
  o[0] = c; o[2] = -s; o[8] = s; o[10] = c;
  return o;
}
function mat4RotateX(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const o = mat4Identity();
  o[5] = c; o[6] = s; o[9] = -s; o[10] = c;
  return o;
}
function mat4RotateZ(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const o = mat4Identity();
  o[0] = c; o[1] = s; o[4] = -s; o[5] = c;
  return o;
}
// Model = T * Ry(yaw) * Rx(pitch) * Rz(roll) * S
function mat4Model(tx, ty, tz, yaw, pitch, roll, sx, sy, sz) {
  let m = mat4Multiply(mat4RotateY(yaw), mat4RotateX(pitch));
  m = mat4Multiply(m, mat4RotateZ(roll));
  m = mat4Multiply(m, mat4Scale(sx, sy, sz));
  m = mat4Multiply(mat4Translate(tx, ty, tz), m);
  return m;
}
function transformPoint(m, p) {
  const x = p[0];
  const y = p[1];
  const z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

// ---- shaders ----
const COLOR_VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute vec2 aUV;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform vec3 uSunDir;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vSunDir;
varying vec2 vUV;
varying float vDist;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vColor = aColor;
  vUV = aUV;
  // Normals and the sun live in VIEW space here, so the specular term and
  // the diffuse term share one frame: rotating both by the view matrix
  // leaves every dot product unchanged, so diffuse renders identically.
  vec4 vp = uView * wp;
  vNormal = normalize(mat3(uView) * mat3(uModel) * aNormal);
  vViewDir = normalize(-vp.xyz);
  vSunDir = normalize(mat3(uView) * uSunDir);
  vDist = -vp.z;
  gl_Position = uProj * vp;
}`;
const COLOR_FRAG = `
precision mediump float;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vSunDir;
varying vec2 vUV;
varying float vDist;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
uniform float uEmissive;
uniform float uAlpha;
uniform float uSpec;
uniform sampler2D uDetail;
uniform float uUseDetail;
void main() {
  vec3 n = normalize(vNormal);
  vec3 sun = normalize(vSunDir);
  float diff = 0.35 + 0.65 * abs(dot(n, sun));
  vec3 col = vColor * diff;
  // Phong specular: a soft white sheen where the sun reflects toward the
  // camera. Shininess 12 (not 32): with this sun and chase camera the
  // half-vector sits ~40 deg off the visible face normals, so a tight
  // exponent never fires — a broad exponent gives a gentle metal sheen on
  // banked turns instead of nothing. uSpec is 0 for terrain (unchanged).
  float spec = pow(max(dot(reflect(-sun, n), normalize(vViewDir)), 0.0), 12.0) * uSpec;
  col += vec3(1.0) * spec;
  // Terrain detail: per-pixel grain from the tiled noise texture. Gated by
  // uUseDetail so aircraft, rings, runway and landmarks never sample it.
  if (uUseDetail > 0.5) {
    float d = texture2D(uDetail, vUV).r;
    col *= 0.82 + 0.36 * d;
  }
  if (uEmissive > 0.5) col = vColor * 1.35;
  float f = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, uAlpha);
}`;
const TEX_VERT = `
attribute vec3 aPos;
attribute vec2 aUV;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform vec2 uUVScale;
varying vec2 vUV;
varying float vDist;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vec4 vp = uView * wp;
  vDist = -vp.z;
  vUV = aUV * uUVScale;
  gl_Position = uProj * vp;
}`;
const TEX_FRAG = `
precision mediump float;
varying vec2 vUV;
varying float vDist;
uniform sampler2D uTex;
uniform vec3 uColor;
uniform float uAlpha;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
void main() {
  vec4 t = texture2D(uTex, vUV);
  float f = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
  vec3 col = mix(uColor * t.rgb, uFogColor, f * 0.85);
  gl_FragColor = vec4(col, t.a * uAlpha);
}`;

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(s)}`);
  }
  return s;
}
function makeProgram(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`program: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

// ---- mesh builder (flat-shaded triangle soup, per-vertex colour) ----
class Mesh {
  constructor() {
    this.pos = [];
    this.norm = [];
    this.col = [];
    this.idx = [];
  }
  tri(a, b, c, color) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / len, n[1] / len, n[2] / len];
    const base = this.pos.length / 3;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.norm.push(n[0], n[1], n[2]);
      this.col.push(color[0], color[1], color[2]);
    }
    this.idx.push(base, base + 1, base + 2);
  }
  quad(a, b, c, d, color) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }
  box(cx, cy, cz, sx, sy, sz, color) {
    const x0 = cx - sx / 2;
    const x1 = cx + sx / 2;
    const y0 = cy - sy / 2;
    const y1 = cy + sy / 2;
    const z0 = cz - sz / 2;
    const z1 = cz + sz / 2;
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color); // top
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color); // bottom
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color); // front
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color); // back
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color); // right
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color); // left
  }
  cone(cx, cy, cz, r, h, seg, color) {
    const tip = [cx, cy + h, cz];
    for (let i = 0; i < seg; i += 1) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r];
      const p1 = [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r];
      // Per-face shade jitter: a flat cone reads as a grey tent; jittered
      // facets read as rock.
      const j = 0.8 + 0.4 * hash2(i, 13, 7);
      this.tri(p0, p1, tip, [color[0] * j, color[1] * j, color[2] * j]);
    }
  }
  cylinder(cx, cy, cz, r, h, seg, color) {
    const top = [];
    const bot = [];
    for (let i = 0; i < seg; i += 1) {
      const a = (i / seg) * Math.PI * 2;
      top.push([cx + Math.cos(a) * r, cy + h, cz + Math.sin(a) * r]);
      bot.push([cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r]);
    }
    for (let i = 0; i < seg; i += 1) {
      const j = (i + 1) % seg;
      const f = 0.8 + 0.4 * hash2(i, 17, 5);
      const cj = [color[0] * f, color[1] * f, color[2] * f];
      this.quad(bot[i], bot[j], top[j], top[i], cj);
      this.tri([cx, cy + h, cz], top[i], top[j], color);
    }
  }
  sphere(cx, cy, cz, r, seg, color) {
    for (let i = 0; i < seg; i += 1) {
      const t0 = (i / seg) * Math.PI;
      const t1 = ((i + 1) / seg) * Math.PI;
      for (let j = 0; j < seg; j += 1) {
        const p0 = (j / seg) * Math.PI * 2;
        const p1 = ((j + 1) / seg) * Math.PI * 2;
        const pt = (t, p) => [cx + r * Math.sin(t) * Math.cos(p), cy + r * Math.cos(t), cz + r * Math.sin(t) * Math.sin(p)];
        this.quad(pt(t0, p0), pt(t0, p1), pt(t1, p1), pt(t1, p0), color);
      }
    }
  }
  torus(R, tube, radial, tubular, color) {
    // Ring gate standing in the XY plane (axis Z): the plane flies through
    // along -Z, so the torus faces the camera head-on.
    for (let i = 0; i < radial; i += 1) {
      const u0 = (i / radial) * Math.PI * 2;
      const u1 = ((i + 1) / radial) * Math.PI * 2;
      for (let j = 0; j < tubular; j += 1) {
        const v0 = (j / tubular) * Math.PI * 2;
        const v1 = ((j + 1) / tubular) * Math.PI * 2;
        const pt = (u, v) => [
          (R + tube * Math.cos(v)) * Math.cos(u),
          (R + tube * Math.cos(v)) * Math.sin(u),
          tube * Math.sin(v),
        ];
        this.quad(pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1), color);
      }
    }
  }
}

// ---- aircraft: low-poly, forward = -Z, wingspan along X, ~13 m ----
function buildAircraft(colorHex, isJet) {
  const m = new Mesh();
  const body = hexRgb(colorHex);
  const light = [0.88, 0.91, 0.94];
  const dark = [0.55, 0.62, 0.70];
  const glass = [0.04, 0.10, 0.18]; // v5: canopy much darker, reads as glass
  // Fuselage: nose pyramid (tip at -Z) + cabin box + tail boom.
  const nose = [0, 0, -7.2];
  const ring = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    ring.push([Math.cos(a) * 0.85, Math.sin(a) * 0.85, -4.8]);
  }
  for (let i = 0; i < 8; i += 1) m.tri(ring[i], ring[(i + 1) % 8], nose, body);
  m.box(0, 0, -1.2, 1.7, 1.7, 7.2, body); // cabin
  m.box(0, 0.1, 3.4, 1.1, 1.1, 2.6, body); // tail boom
  m.box(0, 0.75, -1.6, 0.9, 0.7, 2.2, glass); // canopy
  // Panel lines (v5): dark rings around the fuselage at the panel joints,
  // slightly proud of the cabin wall so they render instead of z-fighting
  // it, plus a dark spine stripe — the v4 fuselage was one flat colour and
  // read as a toy block. A panelled fuselage reads as a built aircraft.
  const panelLine = [0.22, 0.25, 0.29];
  m.box(0, 0, -3.4, 1.78, 1.78, 0.16, panelLine);
  m.box(0, 0, 0.9, 1.78, 1.78, 0.16, panelLine);
  m.box(0, 0.88, -1.2, 0.34, 0.08, 6.0, panelLine);
  // Two-tone: a darker belly box under the cabin, so the fuselage reads as
  // a designed aircraft (light top, dark underside) instead of one flat
  // colour from the chase view.
  m.box(0, -0.75, -1.2, 1.5, 0.5, 6.0, [0.32, 0.36, 0.41]);
  // Cheatline: a thin gold stripe along each fuselage side, slightly proud
  // of the cabin wall so it renders instead of z-fighting it. v5: twice as
  // tall and prouder — the v4 stripe vanished at screenshot distance.
  const gold = [0.95, 0.75, 0.25];
  m.box(-0.9, 0.15, -1.2, 0.1, 0.5, 6.8, gold);
  m.box(0.9, 0.15, -1.2, 0.1, 0.5, 6.8, gold);
  // Main wings (thin boxes with slight dihedral so they read as wings from
  // behind, not edge-on lines) + tailplane + fin.
  m.box(-3.7, 0.5, -0.9, 6.2, 0.28, 1.7, light);
  m.box(3.7, 0.5, -0.9, 6.2, 0.28, 1.7, light);
  // Wingtip gold stripes (v5): the wing ends read as designed, not cut off.
  m.box(-6.4, 0.66, -0.9, 1.2, 0.08, 1.7, gold);
  m.box(6.4, 0.66, -0.9, 1.2, 0.08, 1.7, gold);
  m.box(-1.5, 0.3, 4.8, 2.4, 0.22, 1.1, dark);
  m.box(1.5, 0.3, 4.8, 2.4, 0.22, 1.1, dark);
  // Fin (v5 fix 3): light, not body-yellow — the yellow fin's sun-facing
  // side shaded to a brown plank in every close shot. A light fin reads
  // as part of the wing set instead of a board bolted to the tail.
  // v5 fix 4: shorter (top 1.7, was 2.0) — the tall fin read as a sail.
  m.quad([-0.12, 0.6, 4.6], [0.12, 0.6, 4.6], [0.12, 1.7, 5.2], [-0.12, 1.7, 5.2], light);
  m.quad([0.12, 0.6, 4.6], [-0.12, 0.6, 4.6], [-0.12, 1.7, 5.2], [0.12, 1.7, 5.2], light);
  // Wingtip nav lights (emissive handled by colour brightness). v5: bigger.
  m.box(-6.8, 0.9, 0.1, 0.5, 0.5, 0.5, [1, 0.2, 0.2]);
  m.box(6.8, 0.9, 0.1, 0.5, 0.5, 0.5, [0.2, 1, 0.4]);
  if (isJet) {
    m.box(0, 0, 5.0, 0.9, 0.9, 0.8, [0.15, 0.15, 0.18]);
    m.box(0, 0, 5.5, 0.5, 0.5, 0.4, [1, 0.75, 0.3]);
  }
  return m;
}
// Canopy glass highlight: one thin diagonal streak floating just above the
// canopy top face, drawn emissive and translucent so it reads as a sun
// reflection on glass. Kept out of the main aircraft mesh because it needs
// its own emissive draw call.
function buildCanopyGlint() {
  const m = new Mesh();
  m.quad(
    [-0.42, 1.16, -2.45],
    [0.14, 1.16, -2.45],
    [0.42, 1.16, -0.75],
    [-0.14, 1.16, -0.75],
    [1, 1, 1],
  );
  return m;
}

// ---- landmarks, built once per region (absolute course coords) ----
function buildLandmarks(region) {
  const p = REGION3D[region.id] || REGION3D.bromo;
  const items = []; // {mesh, x, y, z}
  if (p.cone) {
    const m = new Mesh();
    m.cone(0, 0, 0, p.cone.r, p.cone.h, 12, [0.35, 0.27, 0.19]);
    m.cylinder(0, p.cone.h - 40, 0, 130, 60, 10, [0.16, 0.12, 0.09]);
    items.push({ mesh: m, x: p.cone.x, y: 0, z: -p.cone.z });
  }
  if (p.karst) {
    const seed = regionSeed(region.id);
    for (let i = 0; i < 8; i += 1) {
      const kx = (hash2(i, 11, seed) - 0.5) * 2400;
      const kz = 1200 + i * 1300 + hash2(i, 23, seed) * 500;
      const h = 350 + hash2(i, 37, seed) * 270;
      const r = 130 + hash2(i, 41, seed) * 70;
      const m = new Mesh();
      m.cylinder(0, 0, 0, r * 0.7, h, 8, [0.12, 0.48, 0.37]);
      m.cone(0, h, 0, r * 0.7, 60, 8, [0.18, 0.68, 0.48]);
      items.push({ mesh: m, x: kx, y: 0, z: -kz });
    }
  }
  if (p.island) {
    const m = new Mesh();
    m.sphere(0, 0, 0, 900, 10, hexRgb(region.ground));
    items.push({ mesh: m, x: 350, y: -40, z: -4200, sy: 0.22 });
  }
  if (p.city) {
    const seed = regionSeed(region.id);
    for (let i = 0; i < 22; i += 1) {
      const side = i % 2 ? 1 : -1;
      const bx = side * (320 + hash2(i, 5, seed) * 1300);
      const bz = 1200 + i * 230 + hash2(i, 7, seed) * 120;
      const bh = 70 + hash2(i, 9, seed) * 160;
      const bw = 60 + hash2(i, 13, seed) * 70;
      const m = new Mesh();
      m.box(0, 0, 0, bw, bh, bw, [0.36, 0.42, 0.46]);
      m.box(0, bh / 2 + 4, 0, bw * 0.5, 8, bw * 0.5, [0.55, 0.6, 0.65]);
      items.push({ mesh: m, x: bx, y: bh / 2, z: -bz });
    }
    // Monas obelisk + gold flame.
    const m = new Mesh();
    m.box(0, 0, 0, 26, 130, 26, [0.91, 0.89, 0.82]);
    m.cone(0, 130, 0, 14, 42, 4, [0.95, 0.79, 0.30]);
    items.push({ mesh: m, x: 350, y: 65, z: -2400 });
  }
  // Living terrain (v4): trees and villages along the flight corridor, so
  // the ground reads as inhabited land instead of a flat coloured sheet.
  // Placement is deterministic (hash) and sampled against the real terrain
  // height, so trees stand on land and houses sit on the ground, never in
  // the water. Meshes are built in LOCAL coords around an item origin
  // (x=0, z=-as0): a vertex at absolute (ax, as) sits at local
  // (ax, h, as0 - as), so the draw code's relZ = lm.z + sPlane lands it
  // exactly on the terrain grid. `span` is the mesh's half-length in z —
  // the draw cull widens by it, or a long mesh would vanish while part of
  // it is still in frame.
  // v5: trees are 2-3x taller (26-48 m near the flight path) and denser
  // (~110 total, half of them in a near band 180-850 m off the centreline)
  // — v4's 13-24 m trees were ~5 px dots at screenshot scale. Villages
  // are bigger (16-24 m houses, 9 m walls, 8 m pyramid roofs) and closer
  // to the path (350-1100 m), with a 4th cluster near the runway zone, so
  // white walls + terracotta roofs read >= 20 px in the frame.
  {
    const seed = regionSeed(region.id);
    const treeMesh = new Mesh();
    let trees = 0;
    // Near band first: trees the camera actually passes, big enough to read.
    for (let i = 0; i < 160 && trees < 55; i += 1) {
      const ax = (hash2(i, 3, seed) - 0.5) * 1700;
      if (Math.abs(ax) < 180 || Math.abs(ax) > 850) continue; // clear of the centreline, close to it
      const as = 500 + hash2(i, 5, seed) * 25500;
      const h = terrainHeight(ax, as, region);
      if (h < 2 || h > 700) continue; // not in water, not on a peak
      const s = 1.6 + hash2(i, 7, seed) * 1.0;
      const th = 16 * s;
      const tr = 6.5 * s;
      const lz = 13250 - as;
      treeMesh.cylinder(ax, h, lz, 1.1 * s, 5 * s, 5, [0.35, 0.24, 0.14]);
      treeMesh.cone(ax, h + 4 * s, lz, tr, th, 6, [0.10, 0.38, 0.16]);
      treeMesh.cone(ax, h + 4 * s + th * 0.55, lz, tr * 0.62, th * 0.7, 6, [0.14, 0.46, 0.20]);
      trees += 1;
    }
    // Far band: the v4 spread, scaled up 1.5x so the horizon has texture.
    for (let i = 0; i < 220 && trees < 110; i += 1) {
      const ax = (hash2(i, 103, seed) - 0.5) * 4200;
      if (Math.abs(ax) < 160) continue; // keep the centreline clear
      const as = 500 + hash2(i, 105, seed) * 25500;
      const h = terrainHeight(ax, as, region);
      if (h < 2 || h > 700) continue; // not in water, not on a peak
      const s = 1.2 + hash2(i, 107, seed) * 0.8;
      const th = 16 * s;
      const tr = 6.5 * s;
      const lz = 13250 - as;
      treeMesh.cylinder(ax, h, lz, 1.1 * s, 5 * s, 5, [0.35, 0.24, 0.14]);
      treeMesh.cone(ax, h + 4 * s, lz, tr, th, 6, [0.10, 0.38, 0.16]);
      treeMesh.cone(ax, h + 4 * s + th * 0.55, lz, tr * 0.62, th * 0.7, 6, [0.14, 0.46, 0.20]);
      trees += 1;
    }
    // Runway-zone cluster (v5 fix 2): the v5 first pass put trees along
    // the whole course but almost none in the 13-20 km runway zone, so the
    // landed shot showed bare ground. ~25 big trees flanking the approach
    // and the runway, so the end shot has trees at the horizon.
    for (let i = 0; i < 80 && trees < 135; i += 1) {
      const ax = (hash2(i, 203, seed) - 0.5) * 1400;
      if (Math.abs(ax) < 200 || Math.abs(ax) > 700) continue;
      const as = 13000 + hash2(i, 205, seed) * 7000;
      const h = terrainHeight(ax, as, region);
      if (h < 2 || h > 700) continue;
      const s = 1.6 + hash2(i, 207, seed) * 1.0;
      const th = 16 * s;
      const tr = 6.5 * s;
      const lz = 13250 - as;
      treeMesh.cylinder(ax, h, lz, 1.1 * s, 5 * s, 5, [0.35, 0.24, 0.14]);
      treeMesh.cone(ax, h + 4 * s, lz, tr, th, 6, [0.10, 0.38, 0.16]);
      treeMesh.cone(ax, h + 4 * s + th * 0.55, lz, tr * 0.62, th * 0.7, 6, [0.14, 0.46, 0.20]);
      trees += 1;
    }
    if (trees) items.push({ mesh: treeMesh, x: 0, y: 0, z: -13250, span: 12750 });
    // Villages: 5 clusters of white houses with terracotta pyramid roofs.
    // A cluster is kept only when >= 4 of its houses land on dry ground.
    // v5 fix 2: clusters spread 1800-19400 so the 5th sits just past the
    // runway — the v4 4th cluster (16 km) sat BEHIND the landed plane.
    for (let k = 0; k < 5; k += 1) {
      const vx = (k % 2 ? 1 : -1) * (350 + hash2(k, 21, seed) * 750);
      const vas = 1800 + k * 4200 + hash2(k, 23, seed) * 800;
      const vilMesh = new Mesh();
      let houses = 0;
      for (let i = 0; i < 50 && houses < 10; i += 1) {
        const hx = vx + (hash2(k * 40 + i, 25, seed) - 0.5) * 240;
        const has = vas + (hash2(k * 40 + i, 27, seed) - 0.5) * 240;
        const h = terrainHeight(hx, has, region);
        if (h < 2 || h > 400) continue;
        const w = 16 + hash2(k * 40 + i, 29, seed) * 8;
        const lz = vas - has;
        vilMesh.box(hx, h + 4.5, lz, w, 9, w, [0.93, 0.92, 0.88]);
        vilMesh.cone(hx, h + 9, lz, w * 0.75, 8, 4, [0.72, 0.36, 0.20]);
        houses += 1;
      }
      if (houses >= 4) items.push({ mesh: vilMesh, x: 0, y: 0, z: -vas, span: 200 });
    }
  }
  return items;
}

// ---- soft blob texture (clouds / sun glow), drawn once on a 2D canvas ----
function makeBlobTexture(gl) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d');
  const drawBlob = (cx, cy, r, a) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
  };
  drawBlob(64, 70, 52, 0.9);
  drawBlob(38, 78, 34, 0.8);
  drawBlob(92, 78, 36, 0.8);
  drawBlob(58, 52, 30, 0.7);
  drawBlob(84, 56, 26, 0.6);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// Sky gradient (v4): a vertical gradient tile — deep sky at the top,
// the region's sky colour mid-frame, pale haze at the horizon — drawn on
// a far billboard so the upper half of the frame has depth instead of a
// flat clear colour. Built per region (skies differ: clear blue, storm
// orange) and cached. v5: a dusk variant (deep indigo -> burnt orange ->
// pale gold) for the sunset shot.
function makeSkyTexture(gl, skyHex, dusk) {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 256;
  const x = c.getContext('2d');
  const top = hexRgb(skyHex);
  const rgb = (r, g, b) => `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  const g = x.createLinearGradient(0, 0, 0, 256);
  if (dusk) {
    g.addColorStop(0, 'rgb(38,48,102)');
    g.addColorStop(0.42, 'rgb(214,110,52)');
    g.addColorStop(0.62, 'rgb(242,163,94)');
    g.addColorStop(1, 'rgb(250,213,165)');
  } else {
    g.addColorStop(0, rgb(top[0] * 0.5, top[1] * 0.58, top[2] * 0.85));
    g.addColorStop(0.55, rgb(top[0], top[1], top[2]));
    g.addColorStop(1, 'rgb(238,244,248)');
  }
  x.fillStyle = g;
  x.fillRect(0, 0, 16, 256);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// Propeller blur disc: a spinning prop reads as a faint translucent disc
// with a soft bright ring where the blade tips sweep, not as strobo blades.
// Baked alpha stays low (peak ~0.28) — a disc that is too opaque reads as
// a grey plate bolted in front of the nose.
function makePropDiscTexture(gl) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d');
  const cx = 64;
  const cy = 64;
  // Soft ring, brightest where the blade tips sweep (~60% radius). v5:
  // peak 0.38 (was 0.28) — the v4 disc was nearly invisible in stills.
  const ring = x.createRadialGradient(cx, cy, 18, cx, cy, 62);
  ring.addColorStop(0, 'rgba(235,240,245,0)');
  ring.addColorStop(0.45, 'rgba(235,240,245,0.14)');
  ring.addColorStop(0.62, 'rgba(235,240,245,0.38)');
  ring.addColorStop(0.8, 'rgba(235,240,245,0.16)');
  ring.addColorStop(1, 'rgba(235,240,245,0)');
  x.fillStyle = ring;
  x.fillRect(0, 0, 128, 128);
  // Two faint blurred blade wedges (the blades themselves, smeared by spin).
  x.save();
  x.translate(cx, cy);
  for (const a of [0, Math.PI]) {
    x.save();
    x.rotate(a);
    const wedge = x.createLinearGradient(0, -58, 0, -14);
    wedge.addColorStop(0, 'rgba(235,240,245,0.22)');
    wedge.addColorStop(1, 'rgba(235,240,245,0)');
    x.fillStyle = wedge;
    x.beginPath();
    x.moveTo(-7, -14);
    x.lineTo(7, -14);
    x.lineTo(4, -58);
    x.lineTo(-4, -58);
    x.closePath();
    x.fill();
    x.restore();
  }
  x.restore();
  // Hub cap in the middle.
  const hub = x.createRadialGradient(cx, cy, 0, cx, cy, 12);
  hub.addColorStop(0, 'rgba(210,216,222,0.85)');
  hub.addColorStop(1, 'rgba(210,216,222,0)');
  x.fillStyle = hub;
  x.beginPath();
  x.arc(cx, cy, 12, 0, Math.PI * 2);
  x.fill();
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// Terrain detail: a tiled grayscale noise tile sampled per-pixel, so the
// ground keeps fine structure up close instead of interpolating 130 m
// vertex-colour quads into mush. Same deterministic-hash pattern as the
// wave texture. Splotches are drawn in 4 wrapped copies so the tile is
// seamless at its 400 m repeat.
function makeDetailTexture(gl) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#808080';
  x.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 90; k += 1) {
    const cx = hash2(k, 3, 21) * 256;
    const cy = hash2(k, 5, 21) * 256;
    const r = 12 + hash2(k, 7, 21) * 42;
    const v = 96 + Math.floor(hash2(k, 9, 21) * 64);
    for (const ox of [0, -256]) {
      for (const oy of [0, -256]) {
        const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
        g.addColorStop(0, `rgba(${v},${v},${v},0.55)`);
        g.addColorStop(1, `rgba(${v},${v},${v},0)`);
        x.fillStyle = g;
        x.beginPath();
        x.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
        x.fill();
      }
    }
  }
  // Fine speckle for close-range grain.
  for (let k = 0; k < 700; k += 1) {
    const px = hash2(k, 11, 21) * 256;
    const py = hash2(k, 13, 21) * 256;
    const v = 80 + Math.floor(hash2(k, 15, 21) * 96);
    x.fillStyle = `rgba(${v},${v},${v},0.5)`;
    x.fillRect(px, py, 2, 2);
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}

// Wave streaks for the sea: a mid-blue tile with lighter and darker
// horizontal streaks, tiled many times over the water plane so the sea
// reads as water instead of a flat blue sheet.
function makeWaveTexture(gl) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#dfe9f0'; // v5 fix 3: near-white base — the tile multiplies
  x.fillRect(0, 0, 128, 128); // the region water colour, so the sea reads as
  for (let k = 0; k < 26; k += 1) { // the region's own blue, not dark navy
    const y = hash2(k, 3, 11) * 128;
    const len = 20 + hash2(k, 5, 11) * 90;
    const x0 = hash2(k, 7, 11) * 128;
    x.fillStyle = hash2(k, 9, 11) > 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(90,120,145,0.3)';
    x.fillRect(x0, y, len, 2 + hash2(k, 11, 11) * 3);
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}

function uploadStatic(gl, mesh) {
  const geo = { count: mesh.idx.length };
  geo.pos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, geo.pos);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.pos), gl.STATIC_DRAW);
  geo.norm = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, geo.norm);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.norm), gl.STATIC_DRAW);
  geo.col = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, geo.col);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.col), gl.STATIC_DRAW);
  geo.idx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.idx);
  geo.indexCount = mesh.idx.length;
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.idx), gl.STATIC_DRAW);
  return geo;
}

const FOG_BY_WEATHER = {
  // The cockpit panel hides the ground closer than ~1400 m, so the fog
  // near range must sit BEYOND that: otherwise the whole visible ground
  // is fogged and the terrain reads as a pale wash.
  clear: [2200, 5200],
  rain: [1100, 3200],
  storm: [700, 2600],
  fog: [300, 1200],
};

export function createScene3D(canvas) {
  let gl;
  try {
    gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  if (!gl) return null;
  let progC;
  let progT;
  try {
    progC = makeProgram(gl, COLOR_VERT, COLOR_FRAG);
    progT = makeProgram(gl, TEX_VERT, TEX_FRAG);
  } catch {
    return null;
  }
  const locC = {
    pos: gl.getAttribLocation(progC, 'aPos'),
    norm: gl.getAttribLocation(progC, 'aNormal'),
    col: gl.getAttribLocation(progC, 'aColor'),
    uv: gl.getAttribLocation(progC, 'aUV'),
    proj: gl.getUniformLocation(progC, 'uProj'),
    view: gl.getUniformLocation(progC, 'uView'),
    model: gl.getUniformLocation(progC, 'uModel'),
    sun: gl.getUniformLocation(progC, 'uSunDir'),
    fogColor: gl.getUniformLocation(progC, 'uFogColor'),
    fogRange: gl.getUniformLocation(progC, 'uFogRange'),
    emissive: gl.getUniformLocation(progC, 'uEmissive'),
    alpha: gl.getUniformLocation(progC, 'uAlpha'),
    spec: gl.getUniformLocation(progC, 'uSpec'),
    detail: gl.getUniformLocation(progC, 'uDetail'),
    useDetail: gl.getUniformLocation(progC, 'uUseDetail'),
  };
  const locT = {
    pos: gl.getAttribLocation(progT, 'aPos'),
    uv: gl.getAttribLocation(progT, 'aUV'),
    proj: gl.getUniformLocation(progT, 'uProj'),
    view: gl.getUniformLocation(progT, 'uView'),
    model: gl.getUniformLocation(progT, 'uModel'),
    tex: gl.getUniformLocation(progT, 'uTex'),
    color: gl.getUniformLocation(progT, 'uColor'),
    alpha: gl.getUniformLocation(progT, 'uAlpha'),
    fogColor: gl.getUniformLocation(progT, 'uFogColor'),
    fogRange: gl.getUniformLocation(progT, 'uFogRange'),
    uvScale: gl.getUniformLocation(progT, 'uUVScale'),
  };
  const blobTex = makeBlobTexture(gl);
  const waveTex = makeWaveTexture(gl);
  const propDiscTex = makePropDiscTexture(gl);
  const detailTex = makeDetailTexture(gl);
  const skyTexCache = {};
  function skyTexture(region, dusk) {
    const key = dusk ? `${region.id}:dusk` : region.id;
    if (!skyTexCache[key]) skyTexCache[key] = makeSkyTexture(gl, dusk ? '#e8845a' : region.sky, dusk);
    return skyTexCache[key];
  }
  // The detail sampler lives on texture unit 0 for the colour program.
  gl.useProgram(progC);
  gl.uniform1i(locC.detail, 0);

  // Static geometry, built once.
  const ringMesh = new Mesh();
  ringMesh.torus(90, 4, 28, 10, [1, 0.85, 0.3]);
  const ringGeo = uploadStatic(gl, ringMesh);
  const ringGeoGreen = uploadStatic(gl, (() => {
    const m = new Mesh();
    m.torus(90, 4, 28, 10, [0.22, 0.76, 0.37]);
    return m;
  })());
  // Runway strip: dark slab + dashes + edge lights, built in local space
  // (strip along Z, 600 m long, 45 m wide, at y=0).
  const runwayMesh = new Mesh();
  runwayMesh.box(0, 0, 0, 45, 1.5, 600, [0.23, 0.25, 0.28]);
  for (let i = -5; i <= 5; i += 1) runwayMesh.box(0, 0.9, i * 50, 3, 0.4, 22, [0.95, 0.95, 0.95]);
  for (let i = -6; i <= 6; i += 1) {
    runwayMesh.box(-21, 0.9, i * 45, 1.2, 1, 1.2, [1, 0.79, 0.3]);
    runwayMesh.box(21, 0.9, i * 45, 1.2, 1, 1.2, [1, 0.79, 0.3]);
  }
  const runwayGeo = uploadStatic(gl, runwayMesh);
  // Water plane (unit quad, scaled in draw).
  const waterMesh = new Mesh();
  waterMesh.quad([-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [0.18, 0.53, 0.76]);
  const waterGeo = uploadStatic(gl, waterMesh);
  // Blob shadow quad.
  const shadowMesh = new Mesh();
  shadowMesh.quad([-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [0.05, 0.10, 0.14]);
  const shadowGeo = uploadStatic(gl, shadowMesh);
  // Textured quad (clouds / glow / sun), unit square centred on origin.
  const quadMesh = new Mesh();
  quadMesh.quad([-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0], [1, 1, 1]);
  const quadPos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadPos);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadMesh.pos), gl.STATIC_DRAW);
  const quadUV = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadUV);
  // 6 UV pairs: Mesh.quad() is a triangle SOUP (6 vertices: a,b,c,a,c,d),
  // so the UVs must repeat per-vertex. The old 4-pair buffer left vertices
  // 4-5 sampling (0,0) — a transparent texture corner — which rendered
  // every billboard (sun, clouds, ring glow) as a half-blob cut on the
  // diagonal.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0]), gl.STATIC_DRAW);
  const quadIdx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(quadMesh.idx), gl.STATIC_DRAW);

  // Terrain grid: 41 x 51 vertices, local X -2600..2600, local Z -4200..600.
  const TX = 41;
  const TZ = 51;
  const TX0 = -2600;
  const TX1 = 2600;
  const TZ0 = -4200;
  const TZ1 = 600;
  const terrainPos = new Float32Array(TX * TZ * 3);
  const terrainNorm = new Float32Array(TX * TZ * 3);
  const terrainCol = new Float32Array(TX * TZ * 3);
  const terrainUV = new Float32Array(TX * TZ * 2);
  const terrainIdx = [];
  for (let j = 0; j < TZ - 1; j += 1) {
    for (let i = 0; i < TX - 1; i += 1) {
      const a = j * TX + i;
      const b = a + 1;
      const c = a + TX;
      const d = c + 1;
      terrainIdx.push(a, b, c, b, d, c);
    }
  }
  const terrainPosBuf = gl.createBuffer();
  const terrainNormBuf = gl.createBuffer();
  const terrainColBuf = gl.createBuffer();
  const terrainUVBuf = gl.createBuffer();
  const terrainIdxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, terrainIdxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(terrainIdx), gl.STATIC_DRAW);

  let aircraftGeo = null;
  let glintGeo = null;
  let aircraftId = null;
  let landmarks = null;
  let landmarkRegion = null;
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);

  function bindColorGeo(geo) {
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.pos);
    gl.vertexAttribPointer(locC.pos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locC.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.norm);
    gl.vertexAttribPointer(locC.norm, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locC.norm);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.col);
    gl.vertexAttribPointer(locC.col, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locC.col);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.idx);
  }
  function drawColor(proj, view, model, geo, emissive, alpha, sunDir, fogColor, fogRange, spec = 0) {
    gl.useProgram(progC);
    gl.uniformMatrix4fv(locC.proj, false, proj);
    gl.uniformMatrix4fv(locC.view, false, view);
    gl.uniformMatrix4fv(locC.model, false, model);
    gl.uniform3fv(locC.sun, sunDir);
    gl.uniform3fv(locC.fogColor, fogColor);
    gl.uniform2fv(locC.fogRange, fogRange);
    gl.uniform1f(locC.emissive, emissive ? 1 : 0);
    gl.uniform1f(locC.alpha, alpha);
    gl.uniform1f(locC.spec, spec);
    gl.uniform1f(locC.useDetail, 0);
    bindColorGeo(geo);
    gl.drawElements(gl.TRIANGLES, geo.indexCount, gl.UNSIGNED_SHORT, 0);
  }
  function drawTex(proj, view, model, color, alpha, fogColor, fogRange, tex = blobTex, uvScale = [1, 1]) {
    gl.useProgram(progT);
    gl.uniformMatrix4fv(locT.proj, false, proj);
    gl.uniformMatrix4fv(locT.view, false, view);
    gl.uniformMatrix4fv(locT.model, false, model);
    gl.uniform3fv(locT.color, color);
    gl.uniform1f(locT.alpha, alpha);
    gl.uniform3fv(locT.fogColor, fogColor);
    gl.uniform2fv(locT.fogRange, fogRange);
    gl.uniform2fv(locT.uvScale, uvScale);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(locT.tex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadPos);
    gl.vertexAttribPointer(locT.pos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locT.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadUV);
    gl.vertexAttribPointer(locT.uv, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locT.uv);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIdx);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }
  // Camera-facing quad model matrix from the view matrix rotation.
  function billboardModel(view, x, y, z, sx, sy) {
    const rx = [view[0], view[4], view[8]];
    const uy = [view[1], view[5], view[9]];
    const o = new Float32Array(16);
    o[0] = rx[0] * sx; o[1] = rx[1] * sx; o[2] = rx[2] * sx; o[3] = 0;
    o[4] = uy[0] * sy; o[5] = uy[1] * sy; o[6] = uy[2] * sy; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
    o[12] = x; o[13] = y; o[14] = z; o[15] = 1;
    return o;
  }

  let lastProj = null;
  let lastView = null;

  function draw(state) {
    if (lost) return false;
    try {
      resize();
    } catch {
      return false;
    }
    const region = state.region;
    const p3 = REGION3D[region.id] || REGION3D.bromo;
    const altM = state.alt * FT;
    const sPlane = state.dist * NM;
    const latM = state.lateral * NM;
    const aspect = canvas.width / Math.max(1, canvas.height);
    const proj = mat4Perspective((55 * Math.PI) / 180, aspect, 0.5, 9000);
    const rollRad = (state.roll * Math.PI) / 180;
    const up = [Math.sin(-rollRad * 0.15), Math.cos(rollRad * 0.15), 0];
    // v5: staged cameras, set per shot by shots.js via state.camMode.
    // 'close' pulls the camera in (plane ~1.6x bigger, more world ahead);
    // 'low' drops it near the ground and tilts down (ground rush, karst
    // towers loom); 'wide' pulls back for a banked plane that would
    // otherwise crop out of frame; 'landed' raises the camera and aims
    // level so a parked plane sits mid-frame instead of clipped by the
    // cockpit panel. 'default' is the v4 3/4 chase camera.
    const groundY = terrainHeight(latM, sPlane, region);
    // Landed plane: state.alt is 0 but the terrain under it can be 30 m
    // up — the v4 landed shot parked the plane on grass 0.3 nm short of a
    // floating runway slab. planeY grounds the aircraft AND the camera on
    // the real terrain, so a staged landing sits ON the runway slab.
    const planeY = state.phase === 'landed' ? groundY + 1.2 : altM;
    const camMode = state.camMode || 'default';
    const eye = camMode === 'low' ? [6, planeY + 3.5, 16]
      : camMode === 'close' ? [7, planeY + 4.5, 17]
        : camMode === 'wide' ? [8.5, planeY + 6.5, 25]
          : camMode === 'landed' ? [8, planeY + 9, 26]
            : [7.5, planeY + 5.5, 21];
    const center = camMode === 'low' ? [0, planeY - 6 + state.pitch * 0.08, -35]
      : camMode === 'close' ? [0, planeY - 2 + state.pitch * 0.08, -42]
        : camMode === 'wide' ? [0, planeY - 3 + state.pitch * 0.08, -50]
          : camMode === 'landed' ? [0, planeY + 0.5 + state.pitch * 0.08, -48]
            : [0, planeY - 2 + state.pitch * 0.08, -45];
    const view = mat4LookAt(eye, center, up);
    lastProj = proj;
    lastView = view;

    const dusk = !!state.dusk;
    const sky = hexRgb(dusk ? '#e8845a' : region.sky);
    const fogColor = dusk ? [0.93, 0.72, 0.5]
      : [lerp(sky[0], 0.93, 0.35), lerp(sky[1], 0.96, 0.35), lerp(sky[2], 0.99, 0.35)];
    const fogRange = FOG_BY_WEATHER[state.weatherId] || FOG_BY_WEATHER.clear;
    const sunDir = dusk ? [0.55, 0.28, 0.35] : [0.45, 0.75, 0.35];
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);

    // Sky gradient dome (v4): a far billboard with the vertical gradient,
    // drawn first so terrain and sea overwrite it where they stand. The
    // fog range sits beyond the quad so the gradient survives unfogged.
    {
      const sm = billboardModel(view, 0, altM + 1200, -8400, 22000, 9000);
      drawTex(proj, view, sm, [1, 1, 1], 1, fogColor, [9000, 10000], skyTexture(region, dusk));
    }

    // Water plane under the terrain (only for water regions). Textured with
    // wave streaks, tiled 48x so the sea has visible structure; the quad is
    // centred 1800 m ahead of the plane in view space (relZ), so it always
    // covers the visible ground; terrain dips below it show as sea/lake.
    if (region.water) {
      // The shared quad lives in the local XY plane (z=0); scale (S,1,S)
      // leaves it a VERTICAL ribbon 1 m tall. Rotate -90 deg about X first
      // so local Y maps to world Z: a real horizontal sea. (This was the
      // bug: the sea was a hairline at the horizon and the terrain's sand
      // colour showed through everywhere instead.)
      // v5 fix 3: scale 11000 (was 14000) — the old plane's far edge sat
      // 8800 m out, BEHIND the sky dome billboard (8400 m), so from a low
      // landed camera the lake occluded the sky and the upper frame was
      // solid dark water. At 11000 the far edge is 7300 m: sky shows above
      // the lake, and the plane still covers the whole terrain grid.
      const wm = mat4Multiply(
        mat4Translate(-latM, 0.4, -1800),
        mat4Multiply(mat4RotateX(-Math.PI / 2), mat4Scale(11000, 11000, 1)),
      );
      drawTex(proj, view, wm, hexRgb(region.water), 1, fogColor, fogRange, waveTex, [64, 64]);
    }

    // Terrain: rebuild the grid around the plane every frame from absolute
    // course coordinates, so the ground scrolls continuously.
    const heights = new Float32Array(TX * TZ);
    for (let j = 0; j < TZ; j += 1) {
      for (let i = 0; i < TX; i += 1) {
        const lx = TX0 + ((TX1 - TX0) * i) / (TX - 1);
        const lz = TZ0 + ((TZ1 - TZ0) * j) / (TZ - 1);
        const ax = latM + lx;
        const as = sPlane - lz;
        const h = terrainHeight(ax, as, region);
        heights[j * TX + i] = h;
        terrainPos[(j * TX + i) * 3] = lx;
        terrainPos[(j * TX + i) * 3 + 1] = h;
        terrainPos[(j * TX + i) * 3 + 2] = lz;
        // Detail UVs from absolute course coords: one tile per ~167 m
        // (v5, was 400 m) — finer grain at screenshot scale.
        terrainUV[(j * TX + i) * 2] = ax * 0.006;
        terrainUV[(j * TX + i) * 2 + 1] = as * 0.006;
      }
    }
    const dxStep = (TX1 - TX0) / (TX - 1);
    const dzStep = (TZ1 - TZ0) / (TZ - 1);
    for (let j = 0; j < TZ; j += 1) {
      for (let i = 0; i < TX; i += 1) {
        const hl = heights[j * TX + Math.max(0, i - 1)];
        const hr = heights[j * TX + Math.min(TX - 1, i + 1)];
        const hd = heights[Math.max(0, j - 1) * TX + i];
        const hu = heights[Math.min(TZ - 1, j + 1) * TX + i];
        let nx = -(hr - hl) / (2 * dxStep);
        let nz = -(hu - hd) / (2 * dzStep);
        const len = Math.hypot(nx, 1, nz) || 1;
        const nrm = [nx / len, 1 / len, nz / len];
        const k = j * TX + i;
        terrainNorm[k * 3] = nrm[0];
        terrainNorm[k * 3 + 1] = nrm[1];
        terrainNorm[k * 3 + 2] = nrm[2];
        const lx = TX0 + ((TX1 - TX0) * i) / (TX - 1);
        const lz = TZ0 + ((TZ1 - TZ0) * j) / (TZ - 1);
        const slope = Math.hypot(hr - hl, hu - hd) / (2 * dxStep);
        const c = terrainColor(latM + lx, sPlane - lz, heights[k], slope, region);
        terrainCol[k * 3] = c[0];
        terrainCol[k * 3 + 1] = c[1];
        terrainCol[k * 3 + 2] = c[2];
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, terrainPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, terrainPos, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, terrainNormBuf);
    gl.bufferData(gl.ARRAY_BUFFER, terrainNorm, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, terrainColBuf);
    gl.bufferData(gl.ARRAY_BUFFER, terrainCol, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, terrainUVBuf);
    gl.bufferData(gl.ARRAY_BUFFER, terrainUV, gl.DYNAMIC_DRAW);
    const terrainGeo = { pos: terrainPosBuf, norm: terrainNormBuf, col: terrainColBuf, idx: terrainIdxBuf, indexCount: terrainIdx.length };
    gl.useProgram(progC);
    gl.uniformMatrix4fv(locC.proj, false, proj);
    gl.uniformMatrix4fv(locC.view, false, view);
    gl.uniformMatrix4fv(locC.model, false, mat4Identity());
    gl.uniform3fv(locC.sun, sunDir);
    gl.uniform3fv(locC.fogColor, fogColor);
    gl.uniform2fv(locC.fogRange, fogRange);
    gl.uniform1f(locC.emissive, 0);
    gl.uniform1f(locC.alpha, 1);
    gl.uniform1f(locC.spec, 0);
    gl.uniform1f(locC.useDetail, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, detailTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, terrainPosBuf);
    gl.vertexAttribPointer(locC.pos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locC.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, terrainNormBuf);
    gl.vertexAttribPointer(locC.norm, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locC.norm);
    gl.bindBuffer(gl.ARRAY_BUFFER, terrainColBuf);
    gl.vertexAttribPointer(locC.col, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locC.col);
    gl.bindBuffer(gl.ARRAY_BUFFER, terrainUVBuf);
    gl.vertexAttribPointer(locC.uv, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locC.uv);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, terrainIdxBuf);
    gl.drawElements(gl.TRIANGLES, terrainIdx.length, gl.UNSIGNED_SHORT, 0);

    // Landmarks (built + uploaded once per region, reused every frame).
    if (landmarkRegion !== region.id) {
      landmarks = buildLandmarks(region).map((lm) => ({ ...lm, geo: uploadStatic(gl, lm.mesh) }));
      landmarkRegion = region.id;
    }
    for (const lm of landmarks) {
      const relZ = lm.z + sPlane; // landmark z is stored as -as
      const span = lm.span || 0; // long meshes (trees) cull by their extent
      if (relZ < -4200 - span || relZ > 900 + span) continue;
      const relX = lm.x - latM;
      const lmModel = mat4Multiply(
        mat4Translate(relX, lm.y, relZ),
        mat4Scale(1, lm.sy || 1, 1),
      );
      drawColor(proj, view, lmModel, lm.geo, false, 1, sunDir, fogColor, fogRange);
    }

    // Runway, on the landing leg and while it is still ahead.
    const landing = state.ringIndex >= state.rings.length;
    if (landing) {
      const d = state.runwayDist - state.dist;
      if (d > -0.2 && d < 7) {
        const as = state.runwayDist * NM;
        const gy = terrainHeight(0, as, region);
        // Tilt the slab to the terrain's slope along its length (v4): a
        // flat slab over undulating ground floated visibly at its far end.
        const gyN = terrainHeight(0, as - 300, region);
        const gyF = terrainHeight(0, as + 300, region);
        const pitch = Math.atan2(gyF - gyN, 600);
        const rm = mat4Multiply(
          mat4Translate(-latM, gy + 1, -(as - sPlane)),
          mat4RotateX(pitch),
        );
        drawColor(proj, view, rm, runwayGeo, false, 1, sunDir, fogColor, fogRange);
      }
    }

    // Rings: next three, gold for the next one, dimmer for later ones.
    for (let k = 0; k < 3; k += 1) {
      const ring = state.rings[state.ringIndex + k];
      if (!ring) break;
      const d = ring.dist - state.dist;
      if (d <= 0 || d > 6) continue;
      const relZ = -d * NM;
      const relY = ring.alt * FT;
      const relX = -latM;
      const geo = ring.passed ? ringGeoGreen : ringGeo;
      const rm = mat4Translate(relX, relY, relZ);
      drawColor(proj, view, rm, geo, true, k === 0 ? 1 : 0.55, sunDir, fogColor, fogRange);
      if (k === 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        const gm = billboardModel(view, relX, relY, relZ, 520, 520);
        drawTex(proj, view, gm, [1, 0.85, 0.3], 0.4, fogColor, fogRange);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
    }

    // Blob shadow on the ground under the plane (same flat-quad fix as the
    // water: rotate -90 deg about X so the quad lies horizontal).
    {
      const gy = terrainHeight(latM, sPlane, region);
      const sh = clamp(1 - altM / 2500, 0.15, 1);
      const sm = mat4Multiply(
        mat4Translate(0, gy + 1.5, 0),
        mat4Multiply(mat4RotateX(-Math.PI / 2), mat4Scale(90 * sh + 20, 90 * sh + 20, 1)),
      );
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      drawColor(proj, view, sm, shadowGeo, false, 0.35 * sh, sunDir, fogColor, fogRange);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // Aircraft (rebuild when the selected aircraft changes).
    if (aircraftId !== state.aircraft.id) {
      aircraftGeo = uploadStatic(gl, buildAircraft(state.aircraft.color, state.aircraft.id === 'garuda'));
      glintGeo = uploadStatic(gl, buildCanopyGlint());
      aircraftId = state.aircraft.id;
    }
    {
      const yaw = (-(state.heading - state.courseHeading) * Math.PI) / 180;
      const pitch = (state.pitch * Math.PI) / 180;
      const roll = (state.roll * Math.PI) / 180;
      const am = mat4Model(0, planeY, 0, yaw, pitch, -roll, 1, 1, 1);
      drawColor(proj, view, am, aircraftGeo, false, 1, sunDir, fogColor, fogRange, 0.7);
      // Canopy glint: same model matrix, emissive white streak, translucent.
      // v5: alpha 0.7 (was 0.45) — the v4 streak was invisible in stills.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      drawColor(proj, view, am, glintGeo, true, 0.7, sunDir, fogColor, fogRange);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      if (state.aircraft.id !== 'garuda') {
        // The blur disc IS the spinning prop — no spin angle needed, the
        // texture carries the smeared blades. Same nose offset as before.
        const pm = mat4Multiply(am, mat4Multiply(mat4Translate(0, 0, -7.0), mat4Scale(5.4, 5.4, 1)));
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        drawTex(proj, view, pm, [1, 1, 1], 1, fogColor, fogRange, propDiscTex);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      // Contrails (v4): faint wingtip trails while banked — a still frame
      // of a banking plane reads as motion; a level plane shows none. The
      // ribbon is a stretched blob quad in aircraft-local space: it starts
      // at the trailing edge (z=2) and runs 42 m behind the wingtip.
      // v5: alpha 0.55 (was 0.32), wider — v4's trails were "very subtle",
      // and white on a pale storm sky needs more body to read at all.
      if (Math.abs(state.roll) > 8) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        for (const sx of [-6.8, 6.8]) {
          const tm = mat4Multiply(am, mat4Multiply(mat4Translate(sx, 0.9, 23), mat4Multiply(mat4RotateX(Math.PI / 2), mat4Scale(4.5, 42, 1))));
          drawTex(proj, view, tm, [1, 1, 1], 0.55, fogColor, fogRange, blobTex);
        }
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
    }

    // Clouds: anchored to absolute course position so they drift past.
    // v4: more of them (26 -> 40), lower and bigger, so the upper half of
    // the frame is sky with structure instead of empty gradient.
    // v5: 48 clouds, 250-1350 m (some BELOW the plane at cruise altitude),
    // 620-1220 m wide, so the sky has layers instead of a few blobs.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    // Horizon haze (v4): a wide soft band where sky meets ground, so the
    // horizon is a layer of haze instead of a hard clear-colour edge.
    // v5: stronger (0.3) and taller (600 m).
    {
      const hm = billboardModel(view, 0, altM + 60, -3800, 15000, 600);
      drawTex(proj, view, hm, [1, 1, 1], 0.3, fogColor, [9000, 10000]);
    }
    const cloudAlpha = state.weatherId === 'fog' ? 0.5 : 0.85;
    const cloudCol = dusk ? [1, 0.82, 0.62] : [1, 1, 1];
    for (let k = 0; k < 48; k += 1) {
      const kz = k * 550 + hash2(k, 3, 99) * 300;
      const relZ = -(kz - sPlane);
      if (relZ < -4000 || relZ > 700) continue;
      const cx = (hash2(k, 5, 99) - 0.5) * 4200 - latM * 0.4;
      const cy = 250 + hash2(k, 7, 99) * 1100;
      const sz = 620 + hash2(k, 9, 99) * 600;
      const cm = billboardModel(view, cx, cy, relZ, sz, sz * 0.45);
      drawTex(proj, view, cm, cloudCol, cloudAlpha, fogColor, fogRange);
    }
    // Sun glow billboard, far ahead-LEFT and clear-weather only: a storm /
    // fog sky has no visible sun, and near the title panel the camera roll
    // clipped the billboard into a triangle. v5: bigger (850, was 550)
    // with a wide faint halo; at dusk the sun sits low on the horizon.
    if (state.weatherId === 'clear') {
      if (dusk) {
        const halo = billboardModel(view, -2200, planeY + 40, -3800, 1200, 1200);
        drawTex(proj, view, halo, [1, 0.55, 0.25], 0.25, fogColor, [9000, 10000]);
        const sm = billboardModel(view, -2200, planeY + 40, -3800, 850, 850);
        drawTex(proj, view, sm, [1, 0.62, 0.3], 0.95, fogColor, [9000, 10000]);
      } else {
        const halo = billboardModel(view, -1600, altM + 750, -3800, 1500, 1500);
        drawTex(proj, view, halo, [1, 0.93, 0.62], 0.25, fogColor, [9000, 10000]);
        const sm = billboardModel(view, -1600, altM + 750, -3800, 850, 850);
        drawTex(proj, view, sm, [1, 0.93, 0.62], 0.9, fogColor, [9000, 10000]);
      }
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    return true;
  }

  // Project a world point (relative to the plane) to logical 1280x720
  // coordinates, for the 2D ring/runway labels. Returns null when behind
  // the camera or off-screen.
  function project(x, y, z) {
    if (!lastProj || !lastView) return null;
    const vp = mat4Multiply(lastProj, lastView);
    const ndc = transformPoint(vp, [x, y, z]);
    if (ndc[2] < -1 || ndc[2] > 1) return null;
    const sx = (ndc[0] * 0.5 + 0.5) * 1280;
    const sy = (1 - (ndc[1] * 0.5 + 0.5)) * 720;
    if (sx < -40 || sx > 1320 || sy < -40 || sy > 760) return null;
    return { x: sx, y: sy };
  }

  return { draw, project, isLost: () => lost };
}
