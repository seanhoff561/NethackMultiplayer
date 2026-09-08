import * as THREE from 'three';

// NetHack's cumulative thresholds (src/exper.c:newuexp). Level 30 is the cap.
export function experienceLabel(level = 1, experience = 0) {
  const current = Math.max(0, Number(experience) || 0).toLocaleString('en-US');
  if (level >= 30) return `${current} XP · MAX`;
  const next = level < 10 ? 10 * 2 ** level : level < 20 ? 10000 * 2 ** (level - 10) : 10000000 * (level - 19);
  return `${current} / ${next.toLocaleString('en-US')} XP`;
}

function rendered(object) {
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}
function belongsTo(object, group) {
  for (let node = object; node; node = node.parent) if (node === group) return true;
  return false;
}

// Use animated world geometry and the actual camera, not the native tile FOV.
// Hidden/invisible monsters never enter either the label or the sight list.
export function readSight(renderer) {
  const {camera, world, items, creatures, monsters, snapshot, scene} = renderer;
  if (snapshot?.player?.blind) return {target: null, enemies: []};
  camera.updateMatrixWorld(true);
  const roots = [world, items, creatures];
  roots.forEach(root => root.updateMatrixWorld(true));
  const ray = new THREE.Raycaster(), visible = [];
  ray.camera = camera;
  const firstHit = () => ray.intersectObjects(roots, true).find(hit => {
    const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face?.materialIndex || 0] : hit.object.material;
    return !hit.object.isSprite && rendered(hit.object) && material?.visible !== false && (!material?.transparent || material.opacity >= .5);
  });
  const density = scene.fog?.density || .043;
  const far = Math.min(28, Math.sqrt(-Math.log(.3)) / density);
  for (const [key, entity] of monsters) {
    if (!rendered(entity.group) || entity.data?.visible === false || entity.deathAt || entity.data?.hp <= 0) continue;
    const box = new THREE.Box3().setFromObject(entity.group), center = box.getCenter(new THREE.Vector3());
    const distance = camera.position.distanceTo(center);
    if (distance > far) continue;
    const size = box.getSize(new THREE.Vector3());
    const points = [[0, .55], [0, .85], [-.3, .55], [.3, .55], [0, .25]];
    const inSight = points.some(([side, height]) => {
      const point = new THREE.Vector3(center.x + side * size.x, box.min.y + height * size.y, center.z);
      const screen = point.clone().project(camera);
      if (Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1 || screen.z < -1 || screen.z > 1) return false;
      ray.set(camera.position, point.clone().sub(camera.position).normalize());
      ray.far = camera.position.distanceTo(point) + .02;
      const hit = firstHit();
      return !hit || belongsTo(hit.object, entity.group);
    });
    if (inSight) visible.push({key, name: entity.name, kind: entity.data?.tame ? 'Companion' : entity.data?.peaceful ? 'Peaceful' : 'Enemy', distance});
  }
  visible.sort((a, b) => a.distance - b.distance);
  ray.setFromCamera(new THREE.Vector2(0, 0), camera); ray.far = far;
  const hit = visible.length ? firstHit() : null;
  const target = hit ? visible.find(actor => belongsTo(hit.object, monsters.get(actor.key).group)) || null : null;
  return {target, enemies: visible.filter(actor => actor.kind === 'Enemy')};
}
