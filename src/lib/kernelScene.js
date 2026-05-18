// ─────────────────────────────────────────────────────────────
// Three.js kernel map scene — Phase 1 INITIALIZING (cosmetic) mode.
// Renders the actual Phase 1 node population per Section A of the
// reconciliation v1.1 — five clusters: TRADES (cyan), NEWS (amber),
// WEEKLY (white), SCAFFOLD predictions (dim gray), RULES (green).
// Phase 4 auto-switches to the 7-cluster IndicatorNode-driven taxonomy
// when nodes.length >= 10 (per Portal Spec bootstrap rule).
//
// Edges: HAS_PREDICTION (every trade→pred), HAS_NEWS_CONTEXT (~45%
// of trades → random news node), CONTAINS_TRADE (each weekly → 4-7
// random trades). RuleNodes float without edges (read by query).
//
// r128-compatible patterns only — uses SphereGeometry / LineBasicMaterial.
// No CapsuleGeometry (r142+).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';

const TRADE_COLOR = 0x00c2ff;
const NEWS_COLOR = 0xffab00;
const WEEKLY_COLOR = 0xddeeff;
const SCAFFOLD_COLOR = 0x3d6080;
const RULE_COLOR = 0x00e676;

const CRYPTO_CENTER = [-15, 0, 0];
const LCAP_CENTER = [15, 5, -5];
const GROWTH_CENTER = [5, -15, 8];

const WEEKLY_POSITIONS = [
  [0, 25, 0], [20, 18, 5], [-20, 18, 5],
  [0, -25, 5], [15, -12, -15], [-15, -12, -15],
];

export function initKernelScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, 130);

  const tradeNodes = [];
  const newsNodes = [];
  const weeklyNodes = [];
  const predNodes = [];
  const ruleNodes = [];

  function addNode(arr, x, y, z, size, color, opacity) {
    const geo = new THREE.SphereGeometry(size, 10, 10);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const node = { x, y, z, color, size, baseOpacity: opacity, mesh };
    arr.push(node);
    return node;
  }

  function placeTrades(center, n) {
    for (let i = 0; i < n; i++) {
      const r = 8 + Math.random() * 9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const x = center[0] + r * Math.sin(phi) * Math.cos(theta);
      const y = center[1] + r * Math.sin(phi) * Math.sin(theta);
      const z = center[2] + r * Math.cos(phi);
      const sz = 1.0 + Math.random() * 0.7;
      const trade = addNode(tradeNodes, x, y, z, sz, TRADE_COLOR, 0.75 + Math.random() * 0.2);
      const offX = (Math.random() - 0.5) * 3;
      const offY = (Math.random() - 0.5) * 3;
      const offZ = (Math.random() - 0.5) * 3;
      const pred = addNode(predNodes, x + offX, y + offY, z + offZ, sz * 0.55, SCAFFOLD_COLOR, 0.35);
      pred.partner = trade;
    }
  }
  placeTrades(CRYPTO_CENTER, 12);
  placeTrades(LCAP_CENTER, 10);
  placeTrades(GROWTH_CENTER, 8);

  for (let i = 0; i < 15; i++) {
    const center = [CRYPTO_CENTER, LCAP_CENTER, GROWTH_CENTER][i % 3];
    const r = 14 + Math.random() * 8;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const x = center[0] + r * Math.sin(phi) * Math.cos(theta);
    const y = center[1] + r * Math.sin(phi) * Math.sin(theta);
    const z = center[2] + r * Math.cos(phi);
    addNode(newsNodes, x, y, z, 1.0 + Math.random() * 0.4, NEWS_COLOR, 0.7);
  }

  WEEKLY_POSITIONS.forEach((p) => {
    addNode(weeklyNodes, p[0], p[1], p[2], 2.4, WEEKLY_COLOR, 0.85);
  });

  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const r = 42;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r * 0.6 + 15;
    const z = Math.sin(angle * 1.5) * 8;
    addNode(ruleNodes, x, y, z, 1.1, RULE_COLOR, 0.8);
  }

  const edges = [];
  function addEdge(a, b, color, opacity) {
    const pts = [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    edges.push({ line, mat, baseOpacity: opacity });
  }

  predNodes.forEach((p) => {
    if (p.partner) addEdge(p.partner, p, SCAFFOLD_COLOR, 0.25);
  });
  tradeNodes.forEach((t) => {
    if (Math.random() < 0.45) {
      const news = newsNodes[Math.floor(Math.random() * newsNodes.length)];
      addEdge(t, news, NEWS_COLOR, 0.18);
    }
  });
  weeklyNodes.forEach((w) => {
    const fanCount = 4 + Math.floor(Math.random() * 4);
    for (let k = 0; k < fanCount; k++) {
      const t = tradeNodes[Math.floor(Math.random() * tradeNodes.length)];
      addEdge(w, t, WEEKLY_COLOR, 0.12);
    }
  });

  const allNodes = [...tradeNodes, ...newsNodes, ...weeklyNodes, ...predNodes, ...ruleNodes];

  function resize() {
    const p = canvas.parentElement;
    if (!p) return;
    const w = p.clientWidth, h = p.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  let t = 0;
  let pulseNodes = [];
  let pulseTime = 0;
  let pulseIntervalId = null;
  let animationId = null;
  let running = true;

  function triggerPulse() {
    pulseNodes = tradeNodes.filter(() => Math.random() < 0.25);
    pulseTime = 0;
  }
  pulseIntervalId = setInterval(triggerPulse, 4000);

  function animate() {
    if (!running) return;
    animationId = requestAnimationFrame(animate);
    t += 0.004;
    scene.rotation.y = t * 0.4;
    scene.rotation.x = Math.sin(t * 0.2) * 0.15;
    scene.rotation.z = Math.cos(t * 0.15) * 0.08;

    if (pulseNodes.length) {
      pulseTime += 0.08;
      pulseNodes.forEach((n) => {
        const osc = Math.sin(pulseTime * 3) * 0.3 + 0.7;
        n.mesh.material.opacity = n.baseOpacity * osc;
        const s = 1 + Math.sin(pulseTime * 3) * 0.15;
        n.mesh.scale.setScalar(s);
      });
      if (pulseTime > Math.PI * 2) {
        pulseNodes.forEach((n) => {
          n.mesh.material.opacity = n.baseOpacity;
          n.mesh.scale.setScalar(1);
        });
        pulseNodes = [];
      }
    }
    renderer.render(scene, camera);
  }
  animate();

  function destroy() {
    running = false;
    if (animationId) cancelAnimationFrame(animationId);
    if (pulseIntervalId) clearInterval(pulseIntervalId);
    allNodes.forEach((n) => {
      n.mesh.geometry.dispose();
      n.mesh.material.dispose();
      scene.remove(n.mesh);
    });
    edges.forEach((e) => {
      e.line.geometry.dispose();
      e.mat.dispose();
      scene.remove(e.line);
    });
    renderer.dispose();
  }

  return {
    destroy,
    resize,
    counts: { nodes: allNodes.length, edges: edges.length },
  };
}
