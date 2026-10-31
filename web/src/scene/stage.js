/* The 3D room: one model per category in a fixed zoned layout, the camera
   view offset that slides the room aside when a tab opens, picking, and the
   per-frame screen anchors the DOM overlays follow. */
import * as THREE from 'three';
import { createRenderer, createLights, buildRoom, buildModel, tween, tickTweens, lerp, Ease, setGlow, itemRootOf, puff, projectToScreen, faceTo } from './kit.js';

/* Zones that read well with one item or all ten:
   back wall = seating (fridge as end table · couch · lamp · bookshelf),
   centre = rug under the coffee table, left wall = media (speaker · TV · console),
   front right = reading chair; the front-left floor stays open as the walkway. */
const SEAT = { x: -0.05, z: -0.65 };
const TV_TOP = 0.683;
export const LAYOUT = {
  couch: { x: -0.05, z: -2.35, r: 0 },
  rug: { x: -0.05, z: -0.6, r: 0 },
  coffee_table: { x: -0.05, z: -0.65, r: 0 },
  chair: { x: 1.95, z: 0.35, r: faceTo(1.95, 0.35, SEAT) },
  tv: { x: -2.68, z: -0.75, r: Math.PI / 2 },
  speaker: { x: -2.66, z: -2.3, r: Math.PI / 2 },
  game_console: { x: -2.66, z: -0.12, r: Math.PI / 2, onTv: true },
  mini_fridge: { x: -1.92, z: -2.66, r: 0 },
  lamp: { x: 1.66, z: -2.62, r: 0 },
  bookshelf: { x: 2.47, z: -2.78, r: 0 },
};

export function createStage(canvas) {
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  cam.position.set(14, 12.2, 14); cam.lookAt(-0.3, 0.85, -0.3);
  const lights = createLights(scene);
  const room = buildRoom(); scene.add(room.group);
  const itemsGroup = new THREE.Group(); room.group.add(itemsGroup);

  const stacks = new Map();           /* category -> { obj, count } */
  const frameFns = new Set();
  const view = { dx: 0, zoom: 0.55, y: -1.6, tdx: 0, tzoom: 0.55, ty: -1.6 };
  const panels = { L: 0, R: 0 };
  let nextSlot = { x: 0, z: 0 }, selected = null, golden = false, hovered = null, pickHandler = () => {}, hoverHandler = () => {};

  function targets() {
    const w = innerWidth, L = panels.L, R = panels.R;
    view.tdx = (L - R) / 2;
    const base = stacks.size ? 1 : 1.06;
    view.tzoom = base * Math.min(1, Math.max(0.6, (w - L - R) / (w * 0.74)));
  }
  const slotY = cat => (LAYOUT[cat].onTv && stacks.has('tv') ? TV_TOP : 0);
  /* the console rides on the TV stand when there is one, otherwise waits on the floor */
  function relayout() {
    const gc = stacks.get('game_console'); if (!gc) return;
    const o = gc.obj, y1 = slotY('game_console'), x1 = y1 ? LAYOUT.game_console.x : -2.5;
    if (Math.abs((o.userData.baseY ?? 0) - y1) < 0.001 && Math.abs(o.position.x - x1) < 0.001) return;
    const y0 = o.position.y, x0 = o.position.x; o.userData.baseY = y1;
    tween(700, k => { o.position.y = lerp(y0, y1, k) + Math.sin(k * Math.PI) * 0.35; o.position.x = lerp(x0, x1, k); }, Ease.inOut);
  }
  /* the Add marker floats over the most open patch of floor */
  function computeNextSlot() {
    if (!stacks.size) { nextSlot = { x: 0, z: 0 }; return; }
    let best = null, bestScore = -Infinity;
    for (let x = -2; x <= 2.01; x += 0.5) for (let z = -2; z <= 2.01; z += 0.5) {
      let dmin = Infinity;
      for (const { obj: o } of stacks.values()) { if (o.userData.flat) continue; const s = o.userData.size; dmin = Math.min(dmin, Math.hypot(o.position.x - x, o.position.z - z) - Math.max(s.w, s.d) / 2); }
      const score = Math.min(dmin, 1.6) - 0.25 * Math.hypot(x - 0.2, z - 0.6);
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
    nextSlot = best;
  }

  function addModel(cat, { animate = true, delay = 0 } = {}) {
    const slot = LAYOUT[cat], m = buildModel(cat);
    m.userData.itemId = 'stack:' + cat; m.userData.cat = cat;
    stacks.set(cat, { obj: m, count: 0 });
    const y = slotY(cat); m.userData.baseY = y; m.rotation.y = slot.r;
    itemsGroup.add(m);
    if (!animate) { m.position.set(slot.x, y, slot.z); return; }
    if (m.userData.flat) {
      /* rugs unroll in place instead of dropping through the furniture */
      m.position.set(slot.x, y, slot.z); m.scale.set(0.01, 1, 1);
      setTimeout(() => tween(800, k => m.scale.set(Math.max(0.01, Ease.outBack(k)), 1, 1), Ease.linear), delay);
    } else {
      m.position.set(slot.x, 5, slot.z); m.scale.setScalar(0.7); m.visible = delay === 0;
      setTimeout(() => {
        m.visible = true;
        tween(900, k => { m.position.y = lerp(5, m.userData.baseY ?? 0, k); }, Ease.outBounce);
        tween(600, k => m.scale.setScalar(lerp(0.7, 1, k)), Ease.outBack);
        setTimeout(() => puff(itemsGroup, new THREE.Vector3(slot.x, y, slot.z), 0xf3e6da, 10), 330);
      }, delay);
    }
  }
  async function removeModel(cat) {
    const st = stacks.get(cat); if (!st) return;
    stacks.delete(cat);
    if (selected === st.obj) selected = null;
    const o = st.obj, y0 = o.position.y, base = o.position.clone();
    await tween(700, k => { o.position.y = y0 + k * 1.4; o.rotation.y += 0.02 + k * 0.08; o.scale.setScalar(Math.max(0.001, 1 - Ease.in(k))); }, Ease.inOut);
    base.y = 1.2; puff(itemsGroup, base, 0xffe2c4, 16);
    itemsGroup.remove(o);
    relayout(); computeNextSlot(); targets();
  }
  function bump(cat) {
    const st = stacks.get(cat); if (!st) return;
    const o = st.obj, y0 = o.userData.baseY ?? 0;
    tween(520, k => { const s = 1 + Math.sin(k * Math.PI) * 0.12; o.scale.set(s, 1 - Math.sin(k * Math.PI) * 0.08, s); o.position.y = y0 + Math.sin(k * Math.PI) * 0.25; }, Ease.out);
    puff(itemsGroup, new THREE.Vector3(o.position.x, 0.9, o.position.z), 0xffe2c4, 8);
  }

  /* make the room match the server's items: { category: count } */
  let first = true;
  async function sync(counts) {
    const removals = [];
    for (const cat of [...stacks.keys()]) if (!counts[cat]) removals.push(removeModel(cat));
    let i = 0;
    for (const [cat, n] of Object.entries(counts)) {
      if (!n) continue;
      if (!stacks.has(cat)) addModel(cat, { animate: true, delay: first ? 120 + i++ * 140 : 0 });
      else if (n > stacks.get(cat).count && !first) bump(cat);
      stacks.get(cat).count = n;
    }
    first = false;
    relayout(); computeNextSlot(); targets();
    await Promise.all(removals);
  }

  /* picking */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObjects(itemsGroup.children, true)[0];
    return hit ? itemRootOf(hit.object) : null;
  }
  let interactive = true;
  canvas.addEventListener('pointermove', e => {
    if (!interactive) return;
    const o = pick(e);
    if (o !== hovered) { if (hovered && hovered !== selected) setGlow(hovered, 0); hovered = o; if (o && o !== selected) setGlow(o, 0.14); }
    document.body.classList.toggle('hovering', !!o);
    hoverHandler(o && o !== selected ? o.userData.cat : null, e);
  });
  canvas.addEventListener('pointerleave', () => hoverHandler(null));
  canvas.addEventListener('click', e => { if (interactive) pickHandler(pick(e)?.userData.cat ?? null); });

  function select(cat) {
    const st = cat ? stacks.get(cat) : null;
    if (selected && selected !== st?.obj) { const prev = selected, b = prev.userData.baseY ?? 0, y0 = prev.position.y; setGlow(prev, 0); tween(250, k => (prev.position.y = lerp(y0, b, k))); }
    if (st && selected !== st.obj) { const o = st.obj, b = o.userData.baseY ?? 0; tween(300, k => (o.position.y = b + lerp(0, o.userData.flat ? 0.03 : 0.12, k)), Ease.outBack); }
    selected = st?.obj ?? null;
    if (selected) setGlow(selected, 0.2);
  }
  function setGolden(on) {
    if (on === golden) return;
    golden = on; lights.setMood(on ? 'golden' : 'day', 1200, renderer); document.body.classList.toggle('golden', on);
  }

  /* screen positions for the DOM overlays */
  const tmp = new THREE.Vector3();
  const rect = () => canvas.getBoundingClientRect();
  function screenOfMarker() { return projectToScreen(tmp.set(nextSlot.x, view.y + 0.05, nextSlot.z), cam, rect()); }
  function screenOfStack(cat, above = 0.15) {
    const st = stacks.get(cat); if (!st) return null;
    tmp.copy(st.obj.position); tmp.y += (st.obj.userData.size?.h || 1) + above; room.group.localToWorld(tmp);
    return projectToScreen(tmp, cam, rect());
  }
  function screenOfStackBase(cat) {
    const st = stacks.get(cat); if (!st) return null;
    return projectToScreen(st.obj.getWorldPosition(tmp), cam, rect());
  }

  function resize() { renderer.setSize(innerWidth, innerHeight); targets(); }
  addEventListener('resize', resize); resize();
  let last = performance.now();
  renderer.setAnimationLoop(now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    tickTweens(now);
    const k = 1 - Math.exp(-dt * 5.5);
    view.dx += (view.tdx - view.dx) * k; view.zoom += (view.tzoom - view.zoom) * k; view.y += (view.ty - view.y) * (1 - Math.exp(-dt * 3.2));
    room.group.position.y = view.y;
    const w = innerWidth, hgt = innerHeight, a = w / hgt, vh = Math.max(9.8, 11.8 / a);
    Object.assign(cam, { left: (-vh * a) / 2, right: (vh * a) / 2, top: vh / 2, bottom: -vh / 2, zoom: view.zoom });
    cam.setViewOffset(w, hgt, -view.dx, 0, w, hgt);
    for (const fn of frameFns) fn();
    renderer.render(scene, cam);
  });

  return {
    sync, select, setGolden, bump,
    has: cat => stacks.has(cat),
    get selectedCat() { return selected?.userData.cat ?? null; },
    rise() { view.ty = 0; },
    setPanels(L, R) { panels.L = L; panels.R = R; targets(); },
    setInteractive(on) { interactive = on; if (!on) { document.body.classList.remove('hovering'); hoverHandler(null); } },
    onPick(fn) { pickHandler = fn; },
    onHover(fn) { hoverHandler = fn; },
    onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
    screenOfMarker, screenOfStack, screenOfStackBase,
    sizeOf: cat => stacks.get(cat)?.obj.userData.size,
  };
}
