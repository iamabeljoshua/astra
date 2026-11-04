import * as THREE from 'three';

export function makeRibbon(pts, closed) {
  const n = pts.length;
  const pos = new Float32Array(n * 6), prev = new Float32Array(n * 6), next = new Float32Array(n * 6);
  const side = new Float32Array(n * 2), u = new Float32Array(n * 2);
  const idx = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  for (let i = 0; i < n; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; u[i * 2] = u[i * 2 + 1] = n > 1 ? i / (n - 1) : 0; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aPrev', new THREE.BufferAttribute(prev, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aNext', new THREE.BufferAttribute(next, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('aU', new THREE.BufferAttribute(u, 1));
  g.setIndex(idx);
  const write = (points) => {
    for (let i = 0; i < n; i++) {
      const c = points[i];
      const p = points[i === 0 ? (closed ? n - 2 : 0) : i - 1];
      const m = points[i === n - 1 ? (closed ? 1 : n - 1) : i + 1];
      for (let s = 0; s < 2; s++) {
        const k = (i * 2 + s) * 3;
        pos[k] = c[0]; pos[k + 1] = c[1]; pos[k + 2] = c[2];
        prev[k] = p[0]; prev[k + 1] = p[1]; prev[k + 2] = p[2];
        next[k] = m[0]; next[k + 1] = m[1]; next[k + 2] = m[2];
      }
    }
    g.attributes.position.needsUpdate = g.attributes.aPrev.needsUpdate = g.attributes.aNext.needsUpdate = true;
    g.computeBoundingSphere();
    if (!Number.isFinite(g.boundingSphere?.radius)) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  };
  write(pts);
  return { geometry: g, write };
}

export function polygonize(field, min, max, res) {
  const nx = res, ny = res, nz = res;
  const sx = (max[0] - min[0]) / (nx - 1), sy = (max[1] - min[1]) / (ny - 1), sz = (max[2] - min[2]) / (nz - 1);
  const vals = new Float32Array(nx * ny * nz);
  const I = (x, y, z) => x + nx * (y + ny * z);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    vals[I(x, y, z)] = field(min[0] + x * sx, min[1] + y * sy, min[2] + z * sz);
  }
  const vid = new Int32Array(nx * ny * nz).fill(-1);
  const verts = [];
  const corners = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let mask = 0; const v = [];
    for (let c = 0; c < 8; c++) { const q = vals[I(x + corners[c][0], y + corners[c][1], z + corners[c][2])]; v.push(q); if (q < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let px = 0, py = 0, pz = 0, cnt = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      px += corners[a][0] + t * (corners[b][0] - corners[a][0]);
      py += corners[a][1] + t * (corners[b][1] - corners[a][1]);
      pz += corners[a][2] + t * (corners[b][2] - corners[a][2]);
      cnt++;
    }
    vid[I(x, y, z)] = verts.length / 3;
    verts.push(min[0] + (x + px / cnt) * sx, min[1] + (y + py / cnt) * sy, min[2] + (z + pz / cnt) * sz);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const here = vals[I(x, y, z)] < 0;
    if (here !== (vals[I(x + 1, y, z)] < 0)) quad(vid[I(x, y - 1, z - 1)], vid[I(x, y, z - 1)], vid[I(x, y, z)], vid[I(x, y - 1, z)], !here);
    if (here !== (vals[I(x, y + 1, z)] < 0)) quad(vid[I(x - 1, y, z - 1)], vid[I(x - 1, y, z)], vid[I(x, y, z)], vid[I(x, y, z - 1)], !here);
    if (here !== (vals[I(x, y, z + 1)] < 0)) quad(vid[I(x - 1, y - 1, z)], vid[I(x, y - 1, z)], vid[I(x, y, z)], vid[I(x - 1, y, z)], !here);
  }
  return { positions: new Float32Array(verts), indices: idx };
}
