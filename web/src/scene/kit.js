/* three.js building blocks for the livingSpaces room: tweens, renderer,
   the isometric cutaway room, lighting moods and the generic models for
   every category. Ported unchanged from the approved round-5 design. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const Ease = {
  inOut: k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
  out: k => 1 - Math.pow(1 - k, 3),
  in: k => k * k * k,
  outBack: k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  outBounce: k => { const n = 7.5625, d = 2.75; if (k < 1 / d) return n * k * k; if (k < 2 / d) return n * (k -= 1.5 / d) * k + .75; if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + .9375; return n * (k -= 2.625 / d) * k + .984375; },
  linear: k => k,
};
export const tweens = new Set();
export function tween(ms, fn, ease = Ease.inOut) {
  return new Promise(res => { tweens.add({ t0: performance.now(), ms, fn, ease, res }); });
}
export function tickTweens(now) {
  for (const t of tweens) {
    const k = Math.min(1, Math.max(0, (now - t.t0) / t.ms));
    t.fn(t.ease(k), k);
    if (k >= 1) { tweens.delete(t); t.res(); }
  }
}
export const lerp = (a, b, k) => a + (b - a) * k;

export function createRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.08;
  return r;
}

export function woodTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  const tones = ['#9a6c4c', '#8f6245', '#a37452', '#8a5d41', '#966a4b', '#9f7150'];
  const rows = 16, rowH = 1024 / rows;
  for (let r = 0; r < rows; r++) {
    let x = -((r * 397) % 600);
    while (x < 1024) {
      const w = 380 + ((r * 131 + x) % 260);
      g.fillStyle = tones[(r * 7 + Math.abs(Math.round(x))) % tones.length];
      g.fillRect(x, r * rowH, w, rowH);
      for (let k = 0; k < 9; k++) {
        g.strokeStyle = `rgba(80,40,15,${.05 + Math.random() * .07})`; g.lineWidth = 1 + Math.random() * 1.5;
        const y = r * rowH + 6 + Math.random() * (rowH - 12);
        g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + w * .3, y + (Math.random() - .5) * 6, x + w * .7, y + (Math.random() - .5) * 6, x + w, y); g.stroke();
      }
      g.fillStyle = 'rgba(60,28,10,.35)'; g.fillRect(x, r * rowH, 2, rowH);
      x += w;
    }
    g.fillStyle = 'rgba(60,28,10,.32)'; g.fillRect(0, r * rowH, 1024, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }
export function rbox(w, hgt, d, r, mat) { return mesh(new RoundedBoxGeometry(w, hgt, d, 3, Math.min(r, w / 2 - .001, hgt / 2 - .001, d / 2 - .001)), mat); }
export const M = {
  wall: () => new THREE.MeshStandardMaterial({ color: 0xf4efe9, roughness: .95 }),
  white: () => new THREE.MeshStandardMaterial({ color: 0xf7f4ef, roughness: .78 }),
  fabric: () => new THREE.MeshStandardMaterial({ color: 0xf1ebe4, roughness: .95 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x34343a, roughness: .45, metalness: .2 }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0xb98a62, roughness: .7 }),
  color: hex => new THREE.MeshStandardMaterial({ color: hex, roughness: .8 }),
};

/* Room: floor x,z in [-3,3]; walls on x=-3 (left) and z=-3 (back). Viewer sits at +x,+z. */
export function buildRoom({ size = 6, wallH = 3.3 } = {}) {
  const g = new THREE.Group(), S = size / 2;
  const slab = rbox(size + .36, .36, size + .36, .05, M.white()); slab.position.set(-.08, -.18, -.08); g.add(slab);
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: .62 });
  woodMat.map.repeat.set(1.15, 1.15);
  const floor = mesh(new THREE.BoxGeometry(size, .04, size), woodMat); floor.position.y = .0; floor.castShadow = false; g.add(floor);
  const wallMat = M.wall();
  const left = mesh(new THREE.BoxGeometry(.24, wallH, size + .24), wallMat); left.position.set(-S - .12, wallH / 2, -.12); g.add(left);
  const back = mesh(new THREE.BoxGeometry(size, wallH, .24), wallMat); back.position.set(0, wallH / 2, -S - .12); g.add(back);
  const capMat = M.white();
  const cap1 = mesh(new THREE.BoxGeometry(.26, .03, size + .26), capMat); cap1.position.set(-S - .12, wallH + .015, -.12); g.add(cap1);
  const cap2 = mesh(new THREE.BoxGeometry(size + .02, .03, .26), capMat); cap2.position.set(0, wallH + .015, -S - .12); g.add(cap2);
  const bbMat = M.white();
  const bb1 = mesh(new THREE.BoxGeometry(.04, .14, size), bbMat); bb1.position.set(-S + .02, .07, 0); g.add(bb1);
  const bb2 = mesh(new THREE.BoxGeometry(size, .14, .04), bbMat); bb2.position.set(0, .07, -S + .02); g.add(bb2);
  // window + curtains on the left wall (echoes the reference image)
  const win = new THREE.Group(); win.position.set(-S + .005, 0, 1.45);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.7), new THREE.MeshBasicMaterial({ color: 0xfff1df }));
  glass.rotation.y = Math.PI / 2; glass.position.set(.01, 1.75, 0); win.add(glass);
  const frameMat = M.dark();
  [[0, 2.62, 0, .05, .06, 1.6], [0, .88, 0, .05, .06, 1.6], [0, 1.75, -.78, .05, 1.8, .06], [0, 1.75, .78, .05, 1.8, .06], [0, 1.75, 0, .04, 1.74, .035]].forEach(([x, y, z, w, hh, d]) => {
    const f = mesh(new THREE.BoxGeometry(w, hh, d), frameMat); f.position.set(x + .03, y, z); win.add(f);
  });
  const rod = mesh(new THREE.CylinderGeometry(.025, .025, 2.3, 8), frameMat); rod.rotation.x = Math.PI / 2; rod.position.set(.16, 2.86, 0); win.add(rod);
  const curtMat = new THREE.MeshStandardMaterial({ color: 0xfbf8f3, roughness: 1, transparent: true, opacity: .93 });
  for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
    const p = mesh(new THREE.CylinderGeometry(.075, .075, 2.0, 10, 1, false, 0, Math.PI), curtMat);
    p.rotation.y = -Math.PI / 2; p.position.set(.16, 1.84, side * (.62 + k * .13)); win.add(p);
  }
  g.add(win);
  // soft contact shadow under the room
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .16 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.36; ground.receiveShadow = true; g.add(ground);
  return { group: g, floor, half: S, wallH };
}

export function createLights(scene) {
  const hemi = new THREE.HemisphereLight(0xfff5ec, 0xe7c4ad, 1.15); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffe3c6, 2.3);
  key.position.set(5, 11, 7); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  key.shadow.bias = -.0004; key.shadow.normalBias = .02; key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffa868, 1.0); rim.position.set(9, 3.5, -3); scene.add(rim);
  const fill = new THREE.AmbientLight(0xffffff, .28); scene.add(fill);
  const MOODS = {
    day: { hemi: [0xfff5ec, 0xe7c4ad, 1.15], key: [0xffe3c6, 2.3, [5, 11, 7]], rim: [0xffa868, 1.0], fill: .28, exp: 1.08 },
    morning: { hemi: [0xf4f6ff, 0xe9d6c8, 1.25], key: [0xfff3e6, 1.9, [-2, 11, 8]], rim: [0xffd2a8, .55], fill: .34, exp: 1.12 },
    golden: { hemi: [0xffe6cf, 0xd99c7d, .95], key: [0xffb27a, 2.5, [8, 8.5, 6]], rim: [0xff8a48, 1.5], fill: .2, exp: 1.05 },
    dusk: { hemi: [0xc9c3e6, 0xb99484, .8], key: [0xffa77a, 1.1, [8, 7, 5]], rim: [0xb48cff, .7], fill: .24, exp: 1.0 },
  };
  let cur = structuredClone(MOODS.day);
  const C = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
  function apply(m) {
    hemi.color.set(m.hemi[0]); hemi.groundColor.set(m.hemi[1]); hemi.intensity = m.hemi[2];
    key.color.set(m.key[0]); key.intensity = m.key[1]; key.position.set(...m.key[2]);
    rim.color.set(m.rim[0]); rim.intensity = m.rim[1]; fill.intensity = m.fill;
  }
  return {
    hemi, key, rim, fill,
    setMood(name, ms = 1600, renderer) {
      const from = structuredClone(cur), to = MOODS[name];
      return tween(ms, k => {
        const m = {
          hemi: [C(from.hemi[0], to.hemi[0], k), C(from.hemi[1], to.hemi[1], k), lerp(from.hemi[2], to.hemi[2], k)],
          key: [C(from.key[0], to.key[0], k), lerp(from.key[1], to.key[1], k), from.key[2].map((v, i) => lerp(v, to.key[2][i], k))],
          rim: [C(from.rim[0], to.rim[0], k), lerp(from.rim[1], to.rim[1], k)], fill: lerp(from.fill, to.fill, k),
        };
        apply(m);
        if (renderer) renderer.toneMappingExposure = lerp(from.exp, to.exp, k);
        if (k === 1) cur = structuredClone(to);
      });
    },
  };
}

/* Generic low-poly models. Origin = floor centre of the footprint, facing +z. */
export const MODEL_SCALE = 1.22;
export function buildModel(cat) {
  const g = new THREE.Group(), body = new THREE.Group();
  body.scale.setScalar(MODEL_SCALE); g.add(body);
  const add = (m, x, y, z) => { m.position.set(x, y, z); body.add(m); return m; };
  if (cat === 'couch') {
    const fab = M.fabric(), base = M.white(), leg = M.dark();
    for (const [x, z] of [[-1.05, .36], [1.05, .36], [-1.05, -.36], [1.05, -.36]]) add(mesh(new THREE.CylinderGeometry(.035, .03, .12, 8), leg), x, .06, z);
    add(rbox(2.3, .28, .95, .07, base), 0, .26, 0);
    for (const x of [-.52, .52]) add(rbox(1.02, .17, .7, .07, fab), x, .48, .1);
    add(rbox(2.3, .56, .24, .09, base), 0, .66, -.36);
    for (const x of [-.52, .52]) { const c = add(rbox(1.0, .44, .2, .09, fab), x, .76, -.2); c.rotation.x = -.12; }
    for (const x of [-1.05, 1.05]) add(rbox(.22, .58, .95, .08, base), x, .43, 0);
    g.userData.size = { w: 2.3, d: .95, h: 1 };
  } else if (cat === 'tv') {
    const w = M.white(), d = M.dark(), wd = M.wood();
    for (const x of [-.72, .72]) for (const z of [-.14, .14]) add(mesh(new THREE.CylinderGeometry(.025, .02, .14, 8), wd), x, .07, z);
    add(rbox(1.75, .42, .44, .03, w), 0, .35, 0);
    add(mesh(new THREE.BoxGeometry(.012, .34, .01), d), 0, .35, .222);
    add(mesh(new THREE.BoxGeometry(.18, .08, .16), d), 0, .6, -.04);
    add(mesh(new THREE.BoxGeometry(.05, .2, .04), d), 0, .7, -.06);
    add(rbox(1.55, .9, .05, .02, d), 0, 1.22, -.06);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.47, .82), new THREE.MeshStandardMaterial({ color: 0x232833, emissive: 0x3a4a66, emissiveIntensity: .35, roughness: .2, metalness: .3 }));
    add(scr, 0, 1.22, -.032);
    g.userData.size = { w: 1.75, d: .44, h: 1.7 };
  } else if (cat === 'coffee_table') {
    const top = M.white(), wd = M.wood();
    for (const [x, z] of [[-.48, -.24], [.48, -.24], [-.48, .24], [.48, .24]]) { const l = add(mesh(new THREE.CylinderGeometry(.03, .022, .38, 8), wd), x, .19, z); l.rotation.z = x > 0 ? -.06 : .06; }
    add(rbox(1.18, .07, .64, .03, top), 0, .41, 0);
    add(rbox(.34, .05, .24, .01, M.color(0x8fb3a3)), -.2, .47, .02);
    add(rbox(.3, .045, .21, .01, M.color(0xe3a07c)), -.19, .52, .03);
    add(mesh(new THREE.CylinderGeometry(.06, .05, .2, 12), M.white()), .3, .54, -.06);
    const leaf = add(mesh(new THREE.IcosahedronGeometry(.11, 0), M.color(0x86a888)), .3, .7, -.06); leaf.scale.y = 1.3;
    g.userData.size = { w: 1.18, d: .64, h: .5 };
  } else if (cat === 'rug') {
    const base = mesh(new RoundedBoxGeometry(2.79, .012, 2.05, 2, .005), M.color(0xe6d8c4)); base.castShadow = false; add(base, 0, .02, 0);
    const band = mesh(new THREE.BoxGeometry(2.4, .013, 1.66), M.color(0xc99f7a)); band.castShadow = false; add(band, 0, .021, 0);
    const field = mesh(new THREE.BoxGeometry(2.16, .014, 1.42), M.color(0xe9dccb)); field.castShadow = false; add(field, 0, .022, 0);
    const motif = mesh(new THREE.BoxGeometry(1.2, .015, .05), M.color(0xb5845e)); motif.castShadow = false; add(motif, 0, .023, 0);
    g.userData.size = { w: 2.79, d: 2.05, h: .05 }; g.userData.flat = true;
  } else if (cat === 'lamp') {
    const dk = M.dark();
    add(mesh(new THREE.CylinderGeometry(.15, .17, .04, 20), dk), 0, .02, 0);
    add(mesh(new THREE.CylinderGeometry(.016, .016, 1.42, 8), dk), 0, .75, 0);
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0xfbf6ee, roughness: 1, side: THREE.DoubleSide, emissive: 0xffd9a0, emissiveIntensity: .35 });
    const shade = add(mesh(new THREE.CylinderGeometry(.15, .23, .3, 24, 1, true), shadeMat), 0, 1.5, 0); shade.userData.keepEmissive = true;
    const bulb = add(new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d6 })), 0, 1.42, 0); bulb.userData.keepEmissive = true;
    const glow = new THREE.PointLight(0xffc98a, .9, 4, 1.6); glow.position.set(0, 1.4, 0); body.add(glow);
    g.userData.size = { w: .46, d: .46, h: 1.68 };
  } else if (cat === 'bookshelf') {
    const wf = M.white();
    for (const x of [-.39, .39]) add(rbox(.04, 1.52, .32, .01, wf), x, .76, 0);
    for (const y of [.02, .52, 1.02, 1.5]) add(rbox(.82, .04, .32, .01, wf), 0, y, 0);
    for (const y of [.27, .77, 1.26]) add(mesh(new THREE.BoxGeometry(.03, .46, .3), wf), 0, y, 0);
    const cols = [0x8fb3a3, 0xe3a07c, 0x9a9ccf, 0xd9c08a, 0xc97a62, 0x6f8fa8];
    [[.04, -.3], [.54, .08], [1.04, -.3], [.54, -.3], [1.04, .1]].forEach(([y, x0], r) => {
      let x = x0;
      for (let k = 0; k < 4; k++) { const bw = .05 + ((r + k) % 3) * .015, bh = .3 + ((r * 3 + k) % 4) * .03; add(mesh(new THREE.BoxGeometry(bw, bh, .22), M.color(cols[(r + k) % cols.length])), x + bw / 2, y + .02 + bh / 2, .02); x += bw + .012; }
    });
    add(mesh(new THREE.CylinderGeometry(.06, .05, .1, 12), M.white()), .25, 1.57, 0);
    const leaf = add(mesh(new THREE.IcosahedronGeometry(.1, 0), M.color(0x86a888)), .25, 1.7, 0); leaf.scale.y = 1.2;
    g.userData.size = { w: .82, d: .32, h: 1.8 };
  } else if (cat === 'game_console') {
    add(rbox(.09, .36, .3, .03, M.white()), -.06, .18, 0);
    add(rbox(.04, .34, .28, .015, M.dark()), 0, .18, 0);
    add(rbox(.09, .36, .3, .03, M.white()), .06, .18, 0);
    const pad = add(rbox(.2, .045, .11, .02, M.dark()), .26, .03, .12); pad.rotation.y = -.4;
    g.userData.size = { w: .5, d: .34, h: .38 };
  } else if (cat === 'mini_fridge') {
    const wf = new THREE.MeshStandardMaterial({ color: 0xf6f4f1, roughness: .45, metalness: .05 }), dk = M.dark();
    for (const [x, z] of [[-.19, -.19], [.19, -.19], [-.19, .19], [.19, .19]]) add(mesh(new THREE.CylinderGeometry(.02, .02, .04, 8), dk), x, .02, z);
    add(rbox(.48, .82, .5, .03, wf), 0, .45, 0);
    add(mesh(new THREE.BoxGeometry(.46, .008, .01), dk), 0, .68, .252);
    add(rbox(.025, .22, .025, .01, dk), .18, .48, .26);
    add(mesh(new THREE.CylinderGeometry(.03, .03, .1, 12), M.color(0xc94f3d)), -.1, .91, 0);
    add(mesh(new THREE.CylinderGeometry(.03, .03, .1, 12), M.color(0x6f8fa8)), -.02, .91, .04);
    g.userData.size = { w: .48, d: .5, h: .96 };
  } else if (cat === 'speaker') {
    const cab = M.white(), grille = M.dark(), wd = M.wood();
    for (const [x, z] of [[-.13, -.13], [.13, -.13], [-.13, .13], [.13, .13]]) add(mesh(new THREE.CylinderGeometry(.02, .016, .08, 8), wd), x, .04, z);
    add(rbox(.38, 1.0, .38, .04, cab), 0, .58, 0);
    add(rbox(.32, .92, .02, .01, grille), 0, .58, .19);
    const driver = r => new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshStandardMaterial({ color: 0x55565c, roughness: .5 }));
    add(driver(.06), 0, .88, .202); add(driver(.12), 0, .45, .202);
    g.userData.size = { w: .38, d: .38, h: 1.1 };
  } else {
    const seat = M.fabric(), wd = M.wood();
    for (const [x, z] of [[-.25, .22], [.25, .22], [-.25, -.22], [.25, -.22]]) {
      const l = add(mesh(new THREE.CylinderGeometry(.028, .02, .4, 8), wd), x * 1.04, .2, z * 1.04); l.rotation.z = -x * .18; l.rotation.x = z * .18;
    }
    add(rbox(.68, .14, .64, .06, seat), 0, .46, .02);
    const back = add(rbox(.68, .6, .14, .07, seat), 0, .8, -.27); back.rotation.x = -.14;
    for (const x of [-.36, .36]) add(rbox(.08, .2, .52, .03, M.white()), x, .62, .03);
    g.userData.size = { w: .7, d: .66, h: 1.1 };
  }
  const sz = g.userData.size; g.userData.size = { w: sz.w * MODEL_SCALE, d: sz.d * MODEL_SCALE, h: sz.h * MODEL_SCALE };
  g.userData.category = cat;
  return g;
}

/* deterministic layout - each category has favourite spots; overflow uses the free floor */
export const faceTo = (x, z, t) => Math.atan2(t.x - x, t.z - z);

export function setGlow(obj, amt, color = 0xff9a5c) {
  obj.traverse(o => { if (o.isMesh && o.material?.emissive && !o.userData.keepEmissive) { o.material.emissive.set(color); o.material.emissiveIntensity = amt; } });
}
export function itemRootOf(obj) { while (obj && !obj.userData.itemId) obj = obj.parent; return obj; }
export function puff(scene, at, color = 0xffffff, n = 14) {
  const geo = new THREE.SphereGeometry(.08, 8, 6);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true }));
    const a = (i / n) * Math.PI * 2, sp = .8 + Math.random() * .8;
    m.position.copy(at); scene.add(m);
    tween(700 + Math.random() * 300, k => {
      m.position.set(at.x + Math.cos(a) * sp * k, at.y + .2 + k * .6 + Math.sin(k * 3) * .1, at.z + Math.sin(a) * sp * k);
      m.scale.setScalar(1 + k * 1.6); m.material.opacity = 1 - k;
    }, Ease.out).then(() => { scene.remove(m); m.material.dispose(); });
  }
}
export function projectToScreen(v3, camera, rect) {
  const p = v3.clone().project(camera);
  return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height, behind: p.z > 1 };
}
