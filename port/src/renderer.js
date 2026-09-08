import {mapRecord,drawParchment} from './parchment.js';
import {itemProfile,detailedItem} from './item-models.js';
import {creatureProfile} from './creatures.js';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {CollisionWorld,mergeSurfaces,FLOOR_HEIGHT,ALTAR_STEPS} from './spatial.js';
import {lootPositions} from './loot.js';
import {readSight} from './awareness.js';
import {swingPose} from './presentation.js';
import {voxelVolume,dressingPlan,branchStyle} from './voxel.js';

const profileSpeed=e=>e.moving?1:0;
const CELL = 3;
const WALL_HEIGHT = 3.65;
const PALETTE = [0x353442, 0x8f494c, 0x68775c, 0x77665f, 0x596488, 0x79577e, 0x527b7f, 0x8b8a96,
  0x888393, 0xaa795f, 0x869473, 0xb1a485, 0x858dac, 0xa586ac, 0x8eb0ae, 0xd2cdd4];
const OPEN_TYPES = new Set(['floor', 'corridor', 'door', 'door_open', 'stairs_up', 'stairs_down', 'fountain', 'altar', 'water', 'lava', 'ice', 'tree', 'sink', 'grave', 'throne', 'bars', 'trap']);
const hash = (x, y, seed = 0) => {
  let n = Math.imul(x + 173, 374761393) ^ Math.imul(y + 97, 668265263) ^ Math.imul(seed + 11, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const colorOf = (color, fallback = 0x89927d) => {
  if (typeof color === 'number') return color < 16 ? PALETTE[Math.max(0, color)] : color;
  if (typeof color === 'string' && color) {
    if (/^\d+$/.test(color)) return PALETTE[Number(color) % 16];
    try { return new THREE.Color(color).getHex(); } catch { return fallback; }
  }
  return fallback;
};

function canvasTexture(draw, size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function stoneTexture(floor = false, rock = false) {
  const size=256,canvas=document.createElement('canvas'),heightCanvas=document.createElement('canvas');
  canvas.width=canvas.height=heightCanvas.width=heightCanvas.height=size;
  const ctx=canvas.getContext('2d'),hctx=heightCanvas.getContext('2d');
  const pixels=ctx.createImageData(size,size),heights=hctx.createImageData(size,size);
  const smooth=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t;
  const noise=(x,y,period)=>{
    x=(x%period+period)%period;y=(y%period+period)%period;
    const ix=Math.floor(x),iy=Math.floor(y),tx=smooth(x-ix),ty=smooth(y-iy);
    return mix(mix(hash(ix,iy,43),hash((ix+1)%period,iy,43),tx),mix(hash(ix,(iy+1)%period,43),hash((ix+1)%period,(iy+1)%period,43),tx),ty);
  };
  const rows=floor?3:5,columns=3,rowHeight=size/rows,brickWidth=size/columns;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const broad=noise(x/size*8,y/size*8,8),grain=noise(x/size*64,y/size*64,64),fine=noise(x/size*256,y/size*256,256);
    const wy=y+(broad-.5)*2.5, row=Math.floor(wy/rowHeight), rowY=((wy%rowHeight)+rowHeight)%rowHeight;
    const wx=x+(row%2)*brickWidth*.5+(grain-.5)*1.5,col=Math.floor(wx/brickWidth),brickX=((wx%brickWidth)+brickWidth)%brickWidth;
    const edge=Math.min(brickX,brickWidth-brickX,rowY,rowHeight-rowY),bevel=rock?1:smooth(Math.min(1,Math.max(0,(edge-.6)/2.6)));
    const variation=rock?broad:hash((col%columns+columns)%columns,(row%rows+rows)%rows,floor?14:15);
    const veins=Math.max(0,1-Math.abs(grain-.42)*32)*(broad>.5?1:.2);
    const chip=Math.max(0,(fine-.73)*4),pore=(hash(x,y,80)>.975?.05:0);
    const relief=.44+broad*.12+grain*.08+fine*.035-chip*.12-pore;
    const h=(.16*(1-bevel)+relief*bevel)*255;
    const base=(57+variation*24+broad*21+grain*12+fine*9-veins*7-chip*17)*( .37+.63*bevel );
    const i=(y*size+x)*4;
    pixels.data[i]=base*.92;pixels.data[i+1]=base*.98;pixels.data[i+2]=base*1.12;pixels.data[i+3]=255;
    heights.data[i]=heights.data[i+1]=heights.data[i+2]=h;heights.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);hctx.putImageData(heights,0,0);
  const texture=new THREE.CanvasTexture(canvas),bump=new THREE.CanvasTexture(heightCanvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  for(const t of [texture,bump]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;t.magFilter=THREE.NearestFilter;}
  texture.userData.bump=bump;return texture;
}

function woodTexture() {
  return canvasTexture((ctx, size) => {
    ctx.fillStyle = '#4a3322'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 8; i++) {
      const shade = 41 + hash(i, 3) * 24;
      ctx.fillStyle = `rgb(${shade * 1.6},${shade},${shade * 0.6})`;
      ctx.fillRect(i * 64 + 3, 0, 58, size);
      for (let j = 0; j < 15; j++) {
        ctx.strokeStyle = j % 2 ? 'rgba(11,6,2,.25)' : 'rgba(173,127,77,.18)';
        ctx.lineWidth = 1 + hash(i, j, 6) * 2;
        ctx.beginPath();
        const x = i * 64 + 5 + hash(i, j, 5) * 52;
        ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 12, 160, x - 9, 380, x + 3, size); ctx.stroke();
      }
    }
  });
}

function glowTexture() {
  return canvasTexture((ctx, size) => {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,232,1)');
    gradient.addColorStop(0.12, 'rgba(255,224,146,.85)');
    gradient.addColorStop(0.32, 'rgba(255,163,63,.27)');
    gradient.addColorStop(1, 'rgba(255,118,24,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
  }, 128);
}

function shadowTexture() {
  return canvasTexture((ctx, size) => {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,.85)'); gradient.addColorStop(0.45, 'rgba(0,0,0,.50)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
  }, 64);
}

/** First-person rendering of shared architectural geometry and continuous bodies. */
export class DungeonRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.time = 0;
    this.pose = { x: 0.5, y: 0.5, yaw: 0, pitch: 0, crouch: false, moving: false, running: false };
    this.cameraPlaced = false;
    this.levelId = null;
    this.terrainSignature = '';
    this.monsters = new Map();
    this.pickups = new Map();
    this.resources = new Set();
    this.materials = new Map();
    this.geometries = new Map();
    this.torches = [];
    this.features = [];
    this.effects = [];
    this.attackTime = -10;
    this.attackKind = 'melee';
    this.bobPhase = 0;
    this.motionBlend = 0;
    this.damageKick = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d18);
    this.scene.fog = new THREE.FogExp2(0x0b0d18, 0.043);
    this.camera = new THREE.PerspectiveCamera(76, 1, 0.065, 100);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.world = new THREE.Group();
    this.creatures = new THREE.Group();
    this.items = new THREE.Group();
    this.scene.add(this.world, this.creatures, this.items);

    this.scene.add(new THREE.HemisphereLight(0x999bc5, 0x191421, 0.64));
    this.scene.add(new THREE.AmbientLight(0x777393, 0.14));
    this.lantern = new THREE.PointLight(0xadb8e2, 17, 15, 1.5);
    this.scene.add(this.lantern);
    this.headlight = new THREE.SpotLight(0xc1c9e1, 13, 21, 0.9, 0.9, 1.4);
    this.headlight.castShadow = true;
    this.headlight.shadow.mapSize.set(1024, 1024);
    this.headlight.shadow.bias = -0.0008;
    this.headlight.shadow.normalBias = 0.035;
    this.headlight.shadow.camera.near = 0.5;
    this.headlight.shadow.camera.far = 23;
    this.scene.add(this.headlight, this.headlight.target);
    this.torchLights = Array.from({ length: 7 }, () => {
      const light = new THREE.PointLight(0xe0b3a0, 0, 9, 1.6);
      this.scene.add(light); return light;
    });

    this.wallTexture = this.keep(stoneTexture());
    this.floorTexture = this.keep(stoneTexture(true));
    this.rockTexture=this.keep(stoneTexture(false,true));this.rockBump=this.keep(this.rockTexture.userData.bump);
    this.wallBump=this.keep(this.wallTexture.userData.bump);this.floorBump=this.keep(this.floorTexture.userData.bump);
    this.woodTexture = this.keep(woodTexture());
    this.glowTexture = this.keep(glowTexture());
    this.shadowTexture = this.keep(shadowTexture());
    this.wallMaterial = this.keep(new THREE.MeshStandardMaterial({ map: this.wallTexture, bumpMap:this.wallBump, bumpScale:.16, color: 0x8b8d9f, roughness: 0.95 }));
    this.floorMaterial = this.keep(new THREE.MeshStandardMaterial({ map: this.floorTexture, bumpMap:this.floorBump, bumpScale:.1, color: 0x8a8998, roughness: 0.91 }));
    this.ceilingMaterial = this.keep(new THREE.MeshStandardMaterial({ map: this.wallTexture, color: 0x434554, roughness: 1 }));
    this.woodMaterial = this.keep(new THREE.MeshStandardMaterial({ map: this.woodTexture, color: 0x827b8b, roughness: 0.86 }));
    this.waterMaterial = this.keep(new THREE.MeshStandardMaterial({ color: 0x3b6f70, emissive: 0x14302e, emissiveIntensity: 0.18, roughness: 0.17, metalness: 0.48, transparent: true, opacity: 0.88 }));
    this.lavaMaterial = this.keep(new THREE.MeshStandardMaterial({ map: this.floorTexture, color: 0xf67c2e, emissive: 0xd73709, emissiveMap: this.floorTexture, emissiveIntensity: 2.2, roughness: 0.75 }));
    this.shadowMaterial = this.keep(new THREE.MeshBasicMaterial({ map: this.shadowTexture, color: 0x000000, transparent: true, opacity: 0.65, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.flameMaterial = this.keep(new THREE.SpriteMaterial({ map: this.glowTexture, color: 0xffd083, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    this._buildViewModel();
    this._buildMotes();
    this.resize();
  }

  keep(resource) { this.resources.add(resource); return resource; }

  material(color = 0x8b8e7a, metalness = 0, roughness = 0.85, emissive = 0) {
    const key = `${color},${metalness},${roughness},${emissive}`;
    if (!this.materials.has(key)) this.materials.set(key, this.keep(new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity: emissive ? 0.8 : 0, flatShading: true })));
    return this.materials.get(key);
  }

  geometry(kind) {
    if (!this.geometries.has(kind)) {
      let geometry;
      if(kind==='sphere'||kind==='ico'){
        const data=voxelVolume(kind==='sphere'?6:4);geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));
      }
      else if (kind === 'gem') geometry = new THREE.OctahedronGeometry(0.5, 0);
      else if (kind === 'cylinder') geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
      else if (kind === 'cone') geometry = new THREE.ConeGeometry(0.5, 1, 8);
      else if (kind === 'torus') geometry = new THREE.TorusGeometry(0.5, 0.075, 4, 12);
      else if (kind === 'plane') geometry = new THREE.PlaneGeometry(1, 1);
      else geometry = new THREE.BoxGeometry(1, 1, 1);
      this.geometries.set(kind, this.keep(geometry));
    }
    return this.geometries.get(kind);
  }

  mesh(parent, kind, material, position = [0, 0, 0], scale = [1, 1, 1], rotation) {
    const mesh = new THREE.Mesh(this.geometry(kind), typeof material === 'number' ? this.material(material) : material);
    mesh.position.set(...position); mesh.scale.set(...scale);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = kind !== 'plane'; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }

  bone(parent, a, b, radius, material) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const middle = start.clone().add(end).multiplyScalar(0.5);
    const mesh = this.mesh(parent, 'cylinder', material, middle.toArray(), [radius * 2, start.distanceTo(end), radius * 2]);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    return mesh;
  }

  _instances(parent, transforms, material) {
    if (!transforms.length) return;
    const mesh = new THREE.InstancedMesh(this.geometry('box'), material, transforms.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    transforms.forEach((transform, i) => {
      dummy.position.set(...transform.p); dummy.scale.set(...transform.s);
      dummy.rotation.set(0, transform.r || 0, 0); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (transform.c !== undefined) mesh.setColorAt(i, color.setScalar(transform.c));
    });
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    parent.add(mesh);
  }

  setWorld(snapshot) {
    if (!snapshot?.tiles) return;
    const tiles = Array.isArray(snapshot.tiles) ? snapshot.tiles : Object.values(snapshot.tiles);
    this.snapshot = snapshot;
    const levelId = snapshot.levelId ?? snapshot.level ?? 'dungeon';
    const levelChanged = this.levelId !== levelId;
    const signature = `${levelId}:` + tiles.map(tile => `${tile.x},${tile.y},${tile.type}`).join(';');
    if (signature !== this.terrainSignature) {
      this.terrainSignature = signature;
      this.levelId = levelId;
      this.branch=branchStyle(snapshot.player?.dungeon);
      this.wallMaterial.map=this.branch.id==='mines'||this.branch.id==='infernal'?this.rockTexture:this.wallTexture;this.wallMaterial.bumpMap=this.wallMaterial.map===this.rockTexture?this.rockBump:this.wallBump;
      this.wallMaterial.color.setHex(this.branch.wall);this.floorMaterial.color.setHex(this.branch.floor);
      this.scene.fog.color.setHex(this.branch.fog);this.scene.background.copy(this.scene.fog.color);
      this._buildTerrain(tiles);
    }
    if (levelChanged) {
      for(const entity of this.monsters.values())this._disposeActor(entity);
      this.creatures.clear(); this.items.clear(); this.monsters.clear(); this.pickups.clear();
    }
    this._updateEntities(snapshot.actors?tiles.map(t=>({...t,monster:null})).concat(snapshot.actors.map(m=>({x:m.x,y:m.y,monster:m,char:m.symbol}))):tiles);
    if (!this.cameraPlaced && snapshot.player) {
      this.setPose({ x: snapshot.player.x + 0.5, y: snapshot.player.y + 0.5, yaw: this.pose.yaw, pitch: 0 });
    }
    if(this.mapHeld&&snapshot.multiplayer)this.holdMap(true,snapshot,snapshot.cartography?.elapsed||0);
  }

  _buildTerrain(tiles) {
    this.highlightPickup(null);this.doorTargets=new Map();
    this.world.traverse(object => { if (object.isInstancedMesh) object.dispose(); if(object.userData.terrainGeometry)object.geometry.dispose(); });
    this.world.clear(); this.torches = []; this.features = [];
    this.collision=new CollisionWorld(tiles);
    const grid = new Map(tiles.map(tile => [`${tile.x},${tile.y}`, tile]));
    const typeAt = (x, y) => grid.get(`${x},${y}`)?.type || 'unknown';
    const floors = [], walls = [], ceilings = [], trims = [], posts = [], water = [], lava = [];
    const directions = [[0, -1, 0], [1, 0, -Math.PI / 2], [0, 1, Math.PI], [-1, 0, Math.PI / 2]];
    for (const tile of tiles) {
      const type = tile.type || 'unknown';
      if (type === 'unknown' || type === 'unexplored' || type === 'blank') continue;
      const x = (tile.x + 0.5) * CELL, z = (tile.y + 0.5) * CELL;
      const variance = 0.82 + hash(tile.x, tile.y) * 0.3;
      if (type === 'wall' || type === 'stone') {
        walls.push({ p: [x, WALL_HEIGHT / 2, z], s: [CELL, WALL_HEIGHT, CELL], c: variance });
        const neighbors = directions.filter(([dx, dy]) => OPEN_TYPES.has(typeAt(tile.x + dx, tile.y + dy)));
        for (const [dx, dy] of neighbors) {
          const sx = dx ? 0.13 : CELL, sz = dy ? 0.13 : CELL;
          trims.push({ p: [x + dx * 1.5, 0.14, z + dy * 1.5], s: [sx, 0.28, sz], c: variance * 0.8 });
          trims.push({ p: [x + dx * 1.5, WALL_HEIGHT - 0.22, z + dy * 1.5], s: [sx + (dx ? 0.07 : 0), 0.18, sz + (dy ? 0.07 : 0)], c: variance });
          if (hash(tile.x, tile.y, 7) > 0.58) {
            posts.push({ p: [x + dx * 1.54, 1.78, z + dy * 1.54], s: [dx ? 0.22 : 0.33, 3.48, dy ? 0.22 : 0.33], c: variance * 0.9 });
          }
        }
        continue;
      }
      const floorHeight = type === 'water' || type === 'lava' ? -0.2 : -0.11;
      if(type==='corridor')for(const [dx,dy] of directions)if(typeAt(tile.x+dx,tile.y+dy)==='unknown') {
        walls.push({p:[x+dx*1.55,WALL_HEIGHT/2,z+dy*1.55],s:[dx?.12:CELL,WALL_HEIGHT,dy?.12:CELL],c:variance*.85});
      }
      if (!type.startsWith('stairs_')) floors.push({ p: [x, floorHeight, z], s: [CELL, 0.22, CELL], c: variance });
      if(!type.startsWith('stairs_'))ceilings.push({ p: [x, WALL_HEIGHT + 0.1, z], s: [CELL, 0.2, CELL], c: variance * 0.8 });
      if (type === 'water') water.push({ p: [x, -0.045, z], s: [2.99, 0.035, 2.99] });
      if (type === 'lava') lava.push({ p: [x, -0.045, z], s: [2.99, 0.035, 2.99] });
      if (type === 'door' || type === 'door_open') {
        const northSouth = ['wall', 'stone'].includes(typeAt(tile.x - 1, tile.y)) || ['wall', 'stone'].includes(typeAt(tile.x + 1, tile.y));
        this._door(x, z, !northSouth, type === 'door_open');
      } else if (type === 'stairs_up' || type === 'stairs_down') this._stairs(this.collision.stairs.find(s=>s.cellX===tile.x&&s.cellZ===tile.y));
      else if (type === 'fountain') this._fountain(x, z);
      else if (type === 'altar') this._altar(x, z);
      else if (type === 'tree') this._tree(x, z, tile.x + tile.y);
      else if (type === 'sink') this._sink(x, z);
      else if (type === 'grave') this._grave(x, z);
      else if (type === 'throne') this._throne(x, z);
      else if (type === 'bars') this._bars(x, z);
      else if (type === 'trap') this._trap(x, z, tile.description || 'trap');
      if((tile.trap||tile.campaignMarker)&&type!=='trap')this._trap(x,z,tile.description||'trap');
      const adjacentWalls = directions.filter(([dx, dy]) => ['wall', 'stone'].includes(typeAt(tile.x + dx, tile.y + dy)));
      if (adjacentWalls.length && !['door', 'door_open', 'water', 'lava'].includes(type)) {
        if (hash(tile.x, tile.y, 31) > 0.68) {
          const [dx, dy, rotation] = adjacentWalls[Math.floor(hash(tile.x, tile.y, 33) * adjacentWalls.length)];
          this._torch(x + dx * 1.38, z + dy * 1.38, rotation, hash(tile.x, tile.y, 11));
        }
        if (hash(tile.x, tile.y, 13) > 0.84 && type === 'floor') {
          const [dx, dy] = adjacentWalls[0];
          this._rubble(x + dx, z + dy, tile.x, tile.y);
        }
      }

      // Narrow stone ribs make long passage ceilings read as built architecture.
      if (type === 'corridor' && (tile.x + tile.y) % 3 === 0) {
        const alongZ = OPEN_TYPES.has(typeAt(tile.x, tile.y - 1)) || OPEN_TYPES.has(typeAt(tile.x, tile.y + 1));
        trims.push({ p: [x, WALL_HEIGHT - 0.15, z], s: alongZ ? [CELL, 0.3, 0.23] : [0.23, 0.3, CELL], c: 0.65 });
      }
    }
    this._surfaces(mergeSurfaces(tiles,t=>OPEN_TYPES.has(t.type)&&!t.type.startsWith('stairs_')&&!['water','lava'].includes(t.type)), -.11,.22,this.floorMaterial);
    this._surfaces(mergeSurfaces(tiles,t=>['wall','stone'].includes(t.type)),WALL_HEIGHT/2,WALL_HEIGHT,this.wallMaterial);
    this._surfaces(mergeSurfaces(tiles,t=>OPEN_TYPES.has(t.type)&&!t.type.startsWith('stairs_')),WALL_HEIGHT+.1,.2,this.ceilingMaterial);
    this._instances(this.world, trims, this.wallMaterial);
    this._instances(this.world, posts, this.wallMaterial);
    this._instances(this.world, water, this.waterMaterial);
    this._instances(this.world, lava, this.lavaMaterial);
    this.dressing=dressingPlan(tiles,this.snapshot?.player?.dungeon);for(const prop of this.dressing)this._dressing(prop);this._batchDressing();
    this.terrainTiles = grid;
    this._placeMotes(tiles);
  }

  _door(x, z, rotate, open) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotate ? Math.PI / 2 : 0;
    this.world.add(group);
    for (const side of [-1, 1]) {
      this.mesh(group, 'box', this.wallMaterial, [side * 1.30, 1.68, 0], [0.4, 3.36, 0.64]);
      this.mesh(group, 'box', this.wallMaterial, [side * 1.30, 0.2, 0], [0.53, 0.4, 0.76]);
      this.mesh(group, 'box', this.wallMaterial, [side * 1.30, 3.17, 0], [0.52, 0.27, 0.76]);
    }
    this.mesh(group, 'box', this.wallMaterial, [0, 3.37, 0], [3, 0.52, 0.72]);
    const door = new THREE.Group(); door.position.set(-1.1, 0, 0); door.rotation.y = open ? -1.32 : 0; group.add(door);if(!open)this.doorTargets.set(`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`,door);
    this.mesh(door, 'box', this.woodMaterial, [1.1, 1.48, 0], [2.2, 2.96, 0.16]);
    const iron = this.material(0x424b47, 0.75, 0.5);
    for (const height of [0.37, 1.25, 2.56]) {
      this.mesh(door, 'box', iron, [1.1, height, -0.094], [2.13, 0.115, 0.035]);
      this.mesh(door, 'box', iron, [1.1, height, 0.094], [2.13, 0.115, 0.035]);
      for (let j = 0; j < 5; j++) for (const face of [-1, 1]) this.mesh(door, 'sphere', iron, [0.17 + j * 0.46, height, face * 0.122], [0.062, 0.062, 0.035]);
    }
    for (const face of [-1, 1]) {
      this.mesh(door, 'box', iron, [1.91, 1.38, face * 0.13], [0.19, 0.3, 0.06]);
      this.mesh(door, 'torus', this.material(0xb59855, 0.72, 0.38), [1.91, 1.31, face * 0.2], [0.19, 0.19, 0.19]);
    }
  }

  _surfaces(rectangles,y,height,material) {
    const positions=[],normals=[],uvs=[],indices=[];
    for(const r of rectangles){
      const g=new THREE.BoxGeometry(r.w,height,r.h);g.translate(r.x+r.w/2,y,r.z+r.h/2);
      const p=g.attributes.position,n=g.attributes.normal,base=positions.length/3;
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),z=p.getZ(i),yy=p.getY(i),nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i);
        positions.push(x,yy,z);normals.push(nx,ny,nz);
        uvs.push((Math.abs(nx)>.5?z:x)/3,(Math.abs(ny)>.5?z:yy)/3);
      }
      for(const i of g.index.array)indices.push(base+i);g.dispose();
    }
    if(!positions.length)return;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);mesh.userData.terrainGeometry=true;mesh.castShadow=mesh.receiveShadow=true;this.world.add(mesh);
  }

  _stoneBox(parent,material,position,scale) {
    const g=new THREE.BoxGeometry(...scale),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
    for(let i=0;i<p.count;i++)uv.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))/3,(Math.abs(n.getY(i))>.5?p.getZ(i):p.getY(i))/3);
    const mesh=new THREE.Mesh(g,material);mesh.position.set(...position);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.terrainGeometry=true;parent.add(mesh);return mesh;
  }

  _stairs(stair) {
    if(!stair)return;
    const {x,z,sign,angle}=stair,H=FLOOR_HEIGHT;
    const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=angle;this.world.add(group);
    const low=sign>0?0:-H,high=sign>0?H+WALL_HEIGHT:WALL_HEIGHT;
    for(const side of [-1,1])this._stoneBox(group,this.wallMaterial,[side*1.47,(low+high)/2,0],[.16,high-low,3]);
    this._stoneBox(group,this.wallMaterial,[0,(low+high)/2,-1.47],[3,high-low,.16]);
    this._stoneBox(group,this.wallMaterial,[0,(low+high)/2,.425],[.16,high-low,2.15]);
    this._stoneBox(group,this.ceilingMaterial,[0,high+.08,0],[3,.16,3]);
    // Each floor has exactly one opening. Seal the unused half at both ends,
    // including its floor/soffit, so neither end exposes a second empty shaft.
    for(const [sx,level] of [[.775,0],[-.775,sign*H]]){
      const cap=this._stoneBox(group,this.floorMaterial,[sx,level-.11,.425],[1.39,.22,2.15]);
      cap.name='stair-unused-lane-slab';
      const face=this._stoneBox(group,this.wallMaterial,[sx,level+WALL_HEIGHT/2,1.48],[1.39,WALL_HEIGHT,.16]);
      face.name='stair-unused-lane-wall';
    }
    // The first flight and the return flight meet on a full-width landing.
    const count=12,run=2.15/count,rise=H/2/count;
    for(let i=0;i<count;i++){
      const y1=sign*(i+.5)*rise,y2=sign*(H/2+(i+.5)*rise);
      this._stoneBox(group,this.floorMaterial,[-.775,y1-.11,1.5-(i+.5)*run],[1.39,.22,run+.006]);
      this._stoneBox(group,this.floorMaterial,[.775,y2-.11,-.65+(i+.5)*run],[1.39,.22,run+.006]);
      for(const [sx,sy,sz] of [[-.775,y1,1.5-(i+.5)*run],[.775,y2,-.65+(i+.5)*run]])
        this.mesh(group,'box',this.material(0x938771,.3,.7),[sx,sy+.004,sz+run*.45],[1.32,.025,.026]);
    }
    this._stoneBox(group,this.floorMaterial,[0,sign*H/2-.11,-1.06],[2.78,.22,.83]);
    const lamp=new THREE.PointLight(0xa4a4d8,4.5,7,1.8);lamp.position.set(0,sign*H/2+1.7,-1.15);group.add(lamp);
    const flame=new THREE.Sprite(this.flameMaterial);flame.position.copy(lamp.position);flame.scale.set(.3,.55,.3);group.add(flame);
    // A dark opening beyond the final landing gives the connection real depth.
    this._stoneBox(group,this.wallMaterial,[.77,sign*H+2.9,1.49],[1.4,.35,.18]);
  }

  actorAttack(id,ranged=false){const e=this.monsters.get(`id:${id}`);if(e){e.attackAt=this.time;e.rangedAttack=ranged;}}

  setMotion(packet) {
    this.motion=packet;
    for(const actor of packet.actors||[]) {
      const entity=this.monsters.get(`id:${actor.id}`);if(!entity)continue;
      entity.spatial=true;entity.moving=actor.moving;entity.yaw=actor.yaw;entity.group.visible=actor.visible!==false;
      entity.target.set(actor.x,actor.y||0,actor.z);
    }
  }

  _torch(x, z, rotation, phase) {
    const group = new THREE.Group(); group.position.set(x, 1.72, z); group.rotation.y = rotation; this.world.add(group);
    const iron = this.material(0x353b35, 0.72, 0.48);
    this.mesh(group, 'box', iron, [0, 0.1, 0], [0.2, 0.48, 0.08]);
    this.bone(group, [0, -0.11, 0.04], [0, 0.12, 0.28], 0.045, iron);
    this.mesh(group, 'cylinder', this.woodMaterial, [0, 0.23, 0.28], [0.085, 0.48, 0.085], [0.1, 0, 0]);
    this.mesh(group, 'cylinder', iron, [0, 0.45, 0.28], [0.18, 0.18, 0.18]);
    const flame = new THREE.Group(); flame.position.set(0, 0.59, 0.28); group.add(flame);
    this.mesh(flame, 'cone', this.material(0xffc65b, 0, 0.7, 0xff7c1c), [0, 0.08, 0], [0.14, 0.39, 0.14]);
    this.mesh(flame, 'cone', this.material(0xffe4a7, 0, 0.6, 0xffc45c), [0, 0.025, 0], [0.08, 0.24, 0.08]);
    const glow = new THREE.Sprite(this.flameMaterial); glow.scale.set(1.02, 1.7, 1); flame.add(glow);
    const point = new THREE.Vector3(0, 0.64, 0.4); group.localToWorld(point);
    this.torches.push({ flame, point, phase: phase * Math.PI * 2 });
  }

  _fountain(x, z) {
    const group = new THREE.Group();group.name='stone-fountain';group.position.set(x,0,z);this.world.add(group);
    if(!this.fountainStone){
      this.fountainStone=[0x89867d,0x77766f,0x979187].map(color=>this.keep(new THREE.MeshStandardMaterial({color,map:this.wallTexture,bumpMap:this.wallBump,bumpScale:.065,roughness:.96,flatShading:true})));
      this.fountainWater=this.keep(new THREE.MeshStandardMaterial({color:0x63969b,roughness:.16,metalness:.08,transparent:true,opacity:.72,depthWrite:false,side:THREE.DoubleSide}));
    }
    const stone=this.fountainStone,water=this.fountainWater;
    // A hollow masonry basin, with separate blocks and a submerged stone bed.
    this.mesh(group,'box',stone[1],[0,.09,0],[1.64,.18,1.64]);
    this.mesh(group,'box',stone[0],[0,.21,0],[1.48,.14,1.48]);
    for(const side of [-1,1])for(let i=0;i<3;i++){
      const offset=(i-1)*.50;
      this.mesh(group,'box',stone[(i+(side+1)/2)%3],[offset,.405,side*.65],[.488,.27,.22]);
      this.mesh(group,'box',stone[(i+1)%3],[side*.65,.405,offset],[.22,.27,.488]);
    }
    for(const side of [-1,1]){
      this.mesh(group,'box',stone[2],[0,.56,side*.65],[1.56,.10,.25]);
      this.mesh(group,'box',stone[2],[side*.65,.56,0],[.25,.10,1.06]);
    }
    const pool=this.mesh(group,'box',water,[0,.448,0],[1.075,.025,1.075]);pool.name='fountain-water';pool.castShadow=false;
    // A plain stone pier and carved spillway replace the floating ornamental head.
    this.mesh(group,'box',stone[1],[0,.34,-.38],[.56,.13,.44]);
    for(let i=0;i<3;i++)this.mesh(group,'box',stone[i],[0,.49+i*.23,-.38],[.38,.22,.32]);
    this.mesh(group,'box',stone[2],[0,1.09,-.38],[.50,.12,.44]);
    this.mesh(group,'box',stone[1],[0,.913,-.05],[.29,.065,.46]);
    for(const side of [-1,1])this.mesh(group,'box',stone[0],[side*.115,.975,-.05],[.06,.08,.46]);
    this.mesh(group,'box',water,[0,.955,-.05],[.15,.017,.45]).castShadow=false;
    // A continuous gravity-curved sheet of water, without rotating jets or glow.
    if(!this.geometries.has('fountain-spill')){
      const vertices=[],indices=[];
      for(let i=0;i<=10;i++){const t=i/10;for(const side of [-1,1])vertices.push(side*(.075-t*.02),.955-.503*t*t,.18+.20*t);if(i<10){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();this.geometries.set('fountain-spill',this.keep(geometry));
    }
    const spill=this.mesh(group,'fountain-spill',water);spill.castShadow=false;
    const droplets=Array.from({length:5},(_,i)=>{const drop=this.mesh(group,'box',water,[0,0,0],[.018,.038,.018]);drop.castShadow=false;return drop;});
    const ripples=Array.from({length:3},()=>{
      const ripple=new THREE.Group(),material=this.keep(new THREE.MeshBasicMaterial({color:0xb1d0cb,transparent:true,opacity:.2,depthWrite:false}));ripple.position.set(0,.467,.34);group.add(ripple);
      for(const side of [-1,1]){this.mesh(ripple,'box',material,[side*.5,0,0],[.014,.003,1]);this.mesh(ripple,'box',material,[0,0,side*.5],[1,.003,.014]);}
      return {group:ripple,material};
    });
    this.features.push({type:'fountain',group,droplets,ripples,phase:hash(x,z)*6});
  }

  _altar(x, z) {
    const group = new THREE.Group(); group.name='stepped-altar';group.position.set(x,0,z);this.world.add(group);
    const stone=this.material(0x434452,0,.94),cloth=this.material(0x54334d,0,.96),metal=this.material(0x827764,.35,.72);
    let previous=0;
    for(const step of ALTAR_STEPS){
      const tread=this.mesh(group,'box',stone,[0,(previous+step.height)/2,0],[step.half*2,step.height-previous,step.half*2]);
      tread.name='altar-walkable-tread';previous=step.height;
    }
    const top=ALTAR_STEPS.at(-1).height;
    this.mesh(group,'box',cloth,[0,top+.007,0],[.48,.014,1.48]);
    // Inlaid ritual marks and low candles frame the usable offering surface.
    for(const side of [-1,1]){
      this.mesh(group,'box',metal,[side*.56,top+.009,0],[.018,.012,1.15]);
      this.mesh(group,'box',metal,[0,top+.009,side*.56],[1.15,.012,.018]);
      this.mesh(group,'box',metal,[side*.64,top+.035,-.64],[.17,.07,.17]);
      this.mesh(group,'cylinder',this.material(0xbcb0a0),[side*.64,top+.15,-.64],[.065,.2,.065]);
      this.mesh(group,'cone',this.material(0xffc98d,0,1,0xb16b37),[side*.64,top+.285,-.64],[.04,.09,.04]);
    }
  }

  _tree(x, z, seed) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = seed; this.world.add(group);
    this.bone(group, [0, 0, 0], [0.08, 2.4, 0.04], 0.2, this.material(0x5b4d37));
    for (let i = 0; i < 6; i++) {
      const angle = i * 2.4;
      this.bone(group, [0.02, 1.1 + i * 0.15, 0], [Math.cos(angle) * 0.72, 2.3 + (i % 2) * 0.45, Math.sin(angle) * 0.72], 0.075, this.material(0x5b4d37));
      this.mesh(group, 'ico', this.material(i % 2 ? 0x3d5433 : 0x4a633e), [Math.cos(angle) * 0.7, 2.45 + i % 2 * 0.4, Math.sin(angle) * 0.7], [1.4, 1.15, 1.4]);
    }
  }

  _sink(x, z) {
    const group = new THREE.Group(); group.position.set(x, 0, z); this.world.add(group);
    this.mesh(group, 'box', this.wallMaterial, [0, 0.55, 0], [1.1, 1.1, 0.9]);
    this.mesh(group, 'box', this.material(0x878d7f), [0, 1.16, 0], [1.25, 0.2, 1]);
    this.mesh(group, 'box', this.waterMaterial, [0, 1.265, 0], [0.88, 0.012, 0.64]);
    this.bone(group, [0, 1.2, -0.39], [0, 1.57, -0.39], 0.045, this.material(0x9c956f, 0.8, 0.4));
    this.bone(group, [0, 1.57, -0.39], [0, 1.57, -0.12], 0.045, this.material(0x9c956f, 0.8, 0.4));
  }

  _grave(x, z) {
    const group = new THREE.Group(); group.position.set(x, 0, z); this.world.add(group);
    this.mesh(group, 'box', this.material(0x45483b), [0, 0.035, 0.3], [1, 0.07, 1.8]);
    this.mesh(group, 'box', this.wallMaterial, [0, 0.5, -0.58], [0.88, 1, 0.19]);
    this.mesh(group, 'sphere', this.wallMaterial, [0, 0.95, -0.58], [0.87, 0.58, 0.19]);
    this.mesh(group, 'box', this.material(0x2b332d), [0, 0.73, -0.475], [0.4, 0.055, 0.012]);
    this.mesh(group, 'box', this.material(0x2b332d), [0, 0.7, -0.475], [0.055, 0.38, 0.012]);
  }

  _throne(x, z) {
    const group = new THREE.Group(); group.position.set(x, 0, z); this.world.add(group);
    const gold = this.material(0xb3964d, 0.67, 0.45);
    this.mesh(group, 'box', this.wallMaterial, [0, 0.15, 0], [1.7, 0.3, 1.8]);
    this.mesh(group, 'box', gold, [0, 1.1, -0.42], [1.3, 2, 0.25]);
    this.mesh(group, 'box', this.material(0x673139), [0, 1.18, -0.25], [0.88, 1.5, 0.13]);
    this.mesh(group, 'box', this.material(0x673139), [0, 0.65, 0.1], [1.1, 0.24, 1]);
    for (const side of [-1, 1]) this.mesh(group, 'box', gold, [side * 0.64, 0.78, 0.1], [0.18, 1, 1.12]);
    this.mesh(group, 'gem', gold, [0, 2.2, -0.4], [0.35, 0.5, 0.2]);
  }

  _bars(x, z) {
    for (let i = 0; i < 7; i++) this.mesh(this.world, 'cylinder', this.material(0x4a524a, 0.78, 0.5), [x - 1.29 + i * 0.43, 1.8, z], [0.072, 3.6, 0.072]);
    for (const y of [0.28, 2.9]) this.mesh(this.world, 'box', this.material(0x4a524a, 0.78, 0.5), [x, y, z], [3, 0.1, 0.08]);
  }

  _trap(x, z, description) {
    const group = new THREE.Group(); group.position.set(x, 0.02, z); this.world.add(group);
    if (/pit|hole/.test(description)) this.mesh(group, 'cylinder', this.material(0x101816), [0, 0, 0], [1.5, 0.024, 1.5]);
    else {
      const ring = this.mesh(group, 'torus', this.material(0x736746, 0.55, 0.6), [0, 0.04, 0], [0.85, 0.85, 0.35], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 8; i++) this.mesh(group, 'cone', ring.material, [Math.sin(i * Math.PI / 4) * 0.38, 0.1, Math.cos(i * Math.PI / 4) * 0.38], [0.09, 0.17, 0.09]);
    }
  }

  _rubble(x, z, tx, ty) {
    const group = new THREE.Group(); group.position.set(x, 0, z); this.world.add(group);
    for (let i = 0; i < 4; i++) {
      const size = 0.09 + hash(tx + i, ty, 21) * 0.14;
      this.mesh(group, 'ico', this.material(0x62695b), [(hash(tx, ty + i, 23) - 0.5) * 0.8, size * 0.24, (hash(tx + i, ty, 24) - 0.5) * 0.65], [size * 1.6, size * 0.8, size], [i * 0.5, i, 0]);
    }
  }

  _updateEntities(tiles) {
    const presentMonsters = new Set(), presentItems = new Set(), counts = new Map();
    for (const tile of tiles) {
      if (tile.monster) {
        const data = typeof tile.monster === 'string' ? { name: tile.monster } : tile.monster;
        const name = data.name || data.description || tile.description || 'creature';
        const ordinal = counts.get(name) || 0; counts.set(name, ordinal + 1);
        const key = data.id !== undefined ? `id:${data.id}` : `${name}:${ordinal}`;
        presentMonsters.add(key);
        let entity = this.monsters.get(key);
        if(entity&&entity.name!==name){
          const old=entity.group;this._disposeActor(entity);
          const group=this._creature(name,data.color??tile.color,data.kind||tile.char||'',data);group.position.copy(old.position);group.rotation.copy(old.rotation);
          this.creatures.remove(old);this.creatures.add(group);entity.group=group;entity.name=name;entity.flashMaterials=null;entity.deathAt=null;
        }
        if (!entity) {
          const group = this._creature(name, data.color ?? tile.color, data.kind || tile.char || '', data);
          group.position.set((tile.x + 0.5) * CELL, 0, (tile.y + 0.5) * CELL);
          this.creatures.add(group);
          entity = { group, target: group.position.clone(), phase: hash(tile.x, tile.y, 42) * 6.28, name };
          this.monsters.set(key, entity);
        }
        if(!entity.spatial)entity.target.set((tile.x + 0.5) * CELL, 0, (tile.y + 0.5) * CELL);
        entity.data=data;entity.group.visible=data.visible!==false;
      }
      if (tile.object && !this.snapshot.floorObjects) {
        const data = typeof tile.object === 'string' ? { name: tile.object } : tile.object;
        const name = data.name || data.description || tile.description || 'object';
        const key = `${tile.x},${tile.y}:${name}`;
        presentItems.add(key);
        if (!this.pickups.has(key)) {
          const group = this._item(name, data.color ?? tile.color, data.kind || tile.char || '');
          group.position.set((tile.x + 0.5) * CELL, 0, (tile.y + 0.5) * CELL);
          group.rotation.y = hash(tile.x, tile.y, 56) * 6.28;
          this.items.add(group); this.pickups.set(key, { group, phase: hash(tile.x, tile.y, 44) * 6.28 });
        }
      }
    }
    for(const item of lootPositions(this.snapshot.floorObjects||[],this.collision)){
      const key=`object:${item.id}`;presentItems.add(key);
      let entity=this.pickups.get(key);
      if(entity&&entity.name!==item.name){this.items.remove(entity.group);this.pickups.delete(key);entity=null;}
      if(!entity){
        const group=this._item(item.name,item.color,item.symbol,item);group.rotation.y=item.rotation;
        entity={group,born:this.time,name:item.name};this.items.add(group);this.pickups.set(key,entity);
      }
      entity.group.position.set(item.worldX,item.worldY,item.worldZ);
    }
    for (const [key, entity] of this.monsters) if (!presentMonsters.has(key)&&!entity.deathAt) { this.creatures.remove(entity.group);this._disposeActor(entity); this.monsters.delete(key); }
    for (const [key, entity] of this.pickups) if (!presentItems.has(key)) { this.items.remove(entity.group); this.pickups.delete(key); }
    this._readEquipment(this.snapshot);
  }

  _disposeActor(entity){for(const m of entity.flashMaterials||[])m.dispose();}

  _actorMaterials(entity){
    if(!entity.flashMaterials){
      const clones=new Map();
      entity.group.traverse(mesh=>{
        if(!mesh.isMesh||!mesh.material.isMeshStandardMaterial)return;
        const original=mesh.material;
        if(!clones.has(original)){const m=original.clone();m.userData.baseColor=m.color.clone();m.userData.baseEmissive=m.emissive.clone();m.userData.baseIntensity=m.emissiveIntensity;clones.set(original,m);}
        mesh.material=clones.get(original);
      });
      entity.flashMaterials=[...clones.values()];
    }
  }

  sight(){return readSight(this);}
  highlightActor(key=null){
    this.focusedActor=key;
    const entity=this.monsters.get(key);if(entity)this._actorMaterials(entity);
  }

  hitActor(id,dead=false){
    const entity=this.monsters.get(`id:${id}`);if(!entity)return false;
    this._actorMaterials(entity);
    entity.hitAt=this.time;if(dead)entity.deathAt=this.time||.0001;
    const v=entity.group.position.clone().add(new THREE.Vector3(0,.7,0)).project(this.camera);
    return entity.group.visible&&Math.abs(v.x)<1&&Math.abs(v.y)<1&&v.z>0&&v.z<1&&entity.group.position.distanceTo(this.camera.position)<15;
  }

  _shadow(parent, size = 1) {
    return this.mesh(parent, 'plane', this.shadowMaterial, [0, 0.012, 0], [size, size, size], [-Math.PI / 2, 0, 0]);
  }

  _eyes(parent, y, z, spread, size, friendly = false, color) {
    const material = this.material(color || (friendly ? 0xddc482 : 0xf1a259), 0.1, 0.4, color || (friendly ? 0x77653a : 0xaa3b18));
    for (const side of [-1, 1]) {
      this.mesh(parent, 'sphere', this.material(0x181d16), [side * spread, y, z], [size * 1.8, size * 1.45, size * 0.65]);
      this.mesh(parent, 'sphere', material, [side * spread, y, z + size * 0.28], [size, size * 0.95, size * 0.55]);
      this.mesh(parent, 'sphere', this.material(0x10140e), [side * spread, y, z + size * 0.51], [size * 0.28, size * 0.86, size * 0.1]);
    }
  }

  _creature(name, color, kind, data = {}) {
    const label = name.toLowerCase(),profile=creatureProfile({...data,name,symbol:kind});
    const group = new THREE.Group();
    group.userData.name = name;group.userData.profile=profile;
    const body = new THREE.Group(); group.add(body); group.userData.body = body;
    const friendly = !!(data.tame || data.peaceful || /tame|peaceful|kitten|little dog|pet /.test(label));
    const primary = colorOf(color, friendly ? 0xa18764 : 0x748a56);
    const skin = this.material(primary, 0, 0.92);
    const dark = this.material(0x3a382e);
    const bone = this.material(0xc6c2a4);
    this._shadow(group, 1.4);

    if (/jelly|pudding|slime|blob|ooze|gelatinous/.test(label) || /^[bjP]$/.test(kind)) {
      const jelly = this.material(primary, 0.22, 0.28);
      for (let i = 0; i < 4; i++) this.mesh(body, 'sphere', jelly, [(i - 1.5) * 0.2, 0.28 + i % 2 * 0.12, Math.sin(i * 2) * 0.18], [0.85, 0.65 + i % 2 * 0.22, 0.86]);
      this.mesh(body, 'sphere', this.material(0x72835b, 0.1, 0.45, 0x102613), [0, 0.43, 0.13], [0.28, 0.26, 0.27]);
      group.userData.slime = true;
    } else if(/elemental|vortex/.test(label)){
      const fire=/fire|flaming|steam/.test(label),earth=/earth|dust/.test(label);
      const matter=this.material(fire?0xb16a52:earth?0x6b6a74:0x708eab,.1,.83,fire?0x692412:0x101925);
      const pieces=[];for(let i=0;i<14;i++){
        const a=i*2.4,y=.18+i*.105,rr=.17+Math.sin(i*.4)*.2;
        const m=this.mesh(body,'box',matter,[Math.sin(a)*rr,y,Math.cos(a)*rr],[.25+(i%3)*.07,.26,.25],[0,a,.2]);pieces.push(m);
      }
      group.userData.swirl=pieces;group.userData.hover=!earth;
    } else if (/floating eye|gas spore|sphere|beholder|vortex|elemental|light$/.test(label) || kind === 'e' || kind === 'v') {
      this.mesh(body, 'sphere', skin, [0, 0.97, 0], [0.82, 0.84, 0.78]);
      this.mesh(body, 'sphere', this.material(0xd8d1a9), [0, 1.01, 0.34], [0.48, 0.49, 0.22]);
      this.mesh(body, 'sphere', this.material(0x94b896, 0.2, 0.3, 0x3d6f45), [0, 1.01, 0.445], [0.24, 0.28, 0.04]);
      this.mesh(body, 'sphere', dark, [0, 1.01, 0.474], [0.08, 0.23, 0.015]);
      for (let i = 0; i < 5; i++) this.bone(body, [Math.cos(i * 1.25) * 0.32, 0.72, Math.sin(i * 1.25) * 0.28], [Math.cos(i * 1.25) * 0.49, 0.35, Math.sin(i * 1.25) * 0.47], 0.025, skin);
      group.userData.hover = true;
    } else if (/spider|scorpion|ant|beetle|centipede|bee|bug|insect|cockroach/.test(label) || kind === 'a' || kind === 's') {
      const spider = /spider|scorpion/.test(label) || kind === 's';
      this.mesh(body, 'sphere', skin, [0, 0.38, -0.23], [spider ? 0.69 : 0.47, 0.5, 0.73]);
      this.mesh(body, 'sphere', this.material(primary, 0.12, 0.5), [0, 0.36, 0.24], [0.42, 0.35, 0.42]);
      const legs = [];
      for (const side of [-1, 1]) for (let i = 0; i < (spider ? 4 : 3); i++) {
        const leg = new THREE.Group(); body.add(leg); legs.push(leg);
        const z = -0.35 + i * 0.24;
        this.bone(leg, [side * 0.17, 0.35, z], [side * 0.61, 0.39, z - 0.17], 0.029, skin);
        this.bone(leg, [side * 0.61, 0.39, z - 0.17], [side * 0.81, 0.04, z + (i - 1.5) * 0.17], 0.018, skin);
      }
      this._eyes(body, 0.42, 0.44, 0.095, 0.045, friendly);
      for (const side of [-1, 1]) this.bone(body, [side * 0.08, 0.47, 0.34], [side * 0.22, 0.66, 0.65], 0.014, dark);
      group.userData.legs = legs;
      if (/bee/.test(label)) {
        for (const side of [-1, 1]) this.mesh(body, 'sphere', this.material(0xa3b1a1, 0.2, 0.2), [side * 0.29, 0.61, -0.1], [0.55, 0.022, 0.39]);
        group.userData.hover = true;
      }
    } else if (/snake|python|cobra|eel|worm|naga/.test(label) || /^[Sw;]$/.test(kind)) {
      for (let i = 0; i < 8; i++) this.mesh(body, 'sphere', skin, [Math.sin(i * 0.78) * 0.31, 0.16 + (i === 7 ? 0.22 : 0), -0.75 + i * 0.21], [0.31, 0.29 + (i === 7 ? 0.09 : 0), 0.36]);
      this._eyes(body, 0.46, 0.83, 0.105, 0.036, friendly);
      group.userData.snake = true;
    } else if (/bat|dragon|wyvern/.test(label) || kind === 'D' || kind === 'B') {
      const dragon = /dragon|wyvern/.test(label) || kind === 'D';
      this.mesh(body, 'sphere', skin, [0, dragon ? 0.84 : 1.05, 0], dragon ? [0.8, 1.1, 1.45] : [0.34, 0.5, 0.31]);
      this.mesh(body, 'sphere', skin, [0, dragon ? 1.1 : 1.22, dragon ? 0.66 : 0.12], dragon ? [0.54, 0.54, 0.72] : [0.29, 0.3, 0.22]);
      this._eyes(body, dragon ? 1.24 : 1.26, dragon ? 0.965 : 0.22, dragon ? 0.15 : 0.069, dragon ? 0.075 : 0.035, friendly);
      const wings = [];
      for (const side of [-1, 1]) {
        const wing = new THREE.Group(); wing.position.set(side * (dragon ? 0.28 : 0.11), dragon ? 1.25 : 1.1, 0); body.add(wing);
        const span = dragon ? 1.35 : 0.66;
        const vertices = new Float32Array([0, 0, 0, side * span * 0.55, span * 0.42, -0.16, side * span, span * 0.08, 0,
          0, 0, 0, side * span, span * 0.08, 0, side * span * 0.75, -span * 0.24, 0.22,
          0, 0, 0, side * span * 0.75, -span * 0.24, 0.22, side * span * 0.37, -span * 0.33, 0.36]);
        const geomKey = `wing:${dragon}:${side}`;
        if (!this.geometries.has(geomKey)) {
          const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
          this.geometries.set(geomKey, this.keep(geometry));
        }
        const membrane = this.material(new THREE.Color(primary).multiplyScalar(0.65).getHex()); membrane.side = THREE.DoubleSide;
        const surface = new THREE.Mesh(this.geometries.get(geomKey), membrane); surface.castShadow = true; wing.add(surface);
        this.bone(wing, [0, 0, 0], [side * span * 0.55, span * 0.42, -0.16], 0.022, skin);
        this.bone(wing, [side * span * 0.55, span * 0.42, -0.16], [side * span, span * 0.08, 0], 0.017, skin);
        wings.push(wing);
        if (dragon) {
          this.bone(body, [side * 0.3, 0.65, 0.4], [side * 0.48, 0.12, 0.6], 0.1, skin);
          this.mesh(body, 'cone', bone, [side * 0.19, 1.58, 0.48], [0.12, 0.37, 0.12], [0.1, 0, -side * 0.2]);
        } else this.mesh(body, 'cone', skin, [side * 0.09, 1.43, 0.1], [0.12, 0.24, 0.1]);
      }
      if (dragon) for (let i = 0; i < 5; i++) this.mesh(body, 'sphere', skin, [Math.sin(i * 0.6) * 0.27, 0.43 - i * 0.04, -0.7 - i * 0.24], [0.32 - i * 0.045, 0.27 - i * 0.04, 0.42]);
      group.userData.wings = wings; group.userData.hover = !dragon;
    } else if(/cockatrice|chickatrice|raven|bird/.test(label)||kind==='c'){
      this.mesh(body,'sphere',skin,[0,.65,0],[.54,.72,.58]);
      this.mesh(body,'sphere',skin,[0,1.12,.16],[.31,.33,.31]);
      this.mesh(body,'cone',bone,[0,1.09,.4],[.16,.33,.14],[Math.PI/2,0,0]);
      this._eyes(body,1.17,.3,.085,.035,friendly);
      const legs=[],wings=[];for(const side of [-1,1]){
        const leg=new THREE.Group();leg.position.set(side*.15,.4,0);body.add(leg);legs.push(leg);
        this.mesh(leg,'box',bone,[0,-.19,0],[.065,.38,.07]);this.mesh(leg,'box',bone,[0,-.36,.09],[.16,.055,.27]);
        const wing=new THREE.Group();wing.position.set(side*.23,.85,0);body.add(wing);wings.push(wing);
        for(let i=0;i<4;i++)this.mesh(wing,'box',skin,[side*(.06+i*.045),-.12-i*.055,-.04],[.12,.36,.065],[.3,0,side*.25]);
      }
      group.userData.legs=legs;group.userData.wings=wings;
    } else if (/dog|wolf|jackal|fox|cat|kitten|feline|panther|tiger|jaguar|lynx|rat|mouse|rodent|horse|pony|unicorn|rothe|lamb|bear|lizard|newt|iguana|crocodile/.test(label) || /^[dfqru:]$/.test(kind)) {
      const cat = /cat|kitten|feline|panther|tiger|jaguar|lynx/.test(label) || kind === 'f';
      const rat = /rat|mouse|rodent/.test(label) || kind === 'r';
      const lizard = /newt|lizard|iguana|crocodile/.test(label) || kind === ':';
      this.mesh(body, 'sphere', skin, [0, 0.5, -0.12], [0.47, 0.47, 0.92]);
      this.mesh(body, 'sphere', skin, [0, 0.64, 0.4], [0.41, cat ? 0.4 : 0.35, 0.4]);
      if (!cat) this.mesh(body, 'sphere', skin, [0, 0.58, 0.63], [0.25, 0.22, 0.33]);
      this.mesh(body, 'sphere', this.material(0x27241f), [0, 0.59, cat ? 0.615 : 0.8], [0.08, 0.065, 0.045]);
      if (!lizard) for (const side of [-1, 1]) this.mesh(body, rat ? 'sphere' : 'cone', skin, [side * 0.135, 0.87, 0.36], rat ? [0.17, 0.2, 0.07] : [0.15, 0.26, 0.16], [0, 0, side * -0.17]);
      this._eyes(body, 0.69, 0.585, 0.116, cat ? 0.055 : 0.046, friendly, cat ? 0xaeca67 : undefined);
      const legs = [];
      for (const side of [-1, 1]) for (const z of [-0.42, 0.28]) {
        const leg = new THREE.Group(); leg.position.set(side * 0.17, 0.45, z); body.add(leg); legs.push(leg);
        this.mesh(leg, 'cylinder', skin, [0, -0.2, 0], [0.115, 0.4, 0.115]);
        this.mesh(leg, 'sphere', skin, [0, -0.39, 0.045], [0.15, 0.105, 0.22]);
      }
      for (let i = 0; i < 5; i++) this.bone(body, [Math.sin(i * 0.35) * 0.18, 0.47 + (cat ? i * 0.065 : -i * 0.045), -0.52 - i * 0.14], [Math.sin((i + 1) * 0.35) * 0.18, 0.47 + (cat ? (i + 1) * 0.065 : -(i + 1) * 0.045), -0.66 - i * 0.14], rat ? 0.02 : 0.048 - i * 0.006, rat ? this.material(0x947969) : skin);
      if (/unicorn/.test(label)) this.mesh(body, 'cone', bone, [0, 1.01, 0.57], [0.1, 0.54, 0.1], [0.24, 0, 0]);
      if (friendly) this.mesh(body, 'torus', this.material(0x966d42), [0, 0.53, 0.28], [0.44, 0.44, 0.2]);
      if (rat || lizard) body.scale.setScalar(0.67);
      if (/horse|pony|unicorn|bear|tiger/.test(label)) body.scale.setScalar(1.4);
      group.userData.legs = legs;
    } else if (/mushroom|fungus|mold|lichen|shrieker|violet/.test(label) || kind === 'F') {
      for (let i = 0; i < 5; i++) {
        const x = Math.sin(i * 2.4) * 0.35, z = Math.cos(i * 2.4) * 0.32, y = 0.25 + i % 3 * 0.19;
        this.mesh(body, 'cylinder', this.material(0xb4aa8a), [x, y / 2, z], [0.1, y, 0.1]);
        this.mesh(body, 'sphere', skin, [x, y, z], [0.42, 0.18, 0.42]);
        this.mesh(body, 'sphere', this.material(0xb8bbaa, 0, 0.7, 0x253423), [x + 0.05, y + 0.084, z + 0.05], [0.055, 0.022, 0.06]);
      }
    } else if (/mimic/.test(label) || kind === 'm') {
      this._chest(body, true);
      this._eyes(body, 0.56, 0.41, 0.23, 0.07, false);
    } else {
      const skeletal = /skeleton|lich|bone/.test(label);
      const undead = /zombie|ghoul|vampire|wraith|ghost|mummy/.test(label);
      const small = /kobold|goblin|gnome|dwarf|hobbit|imp|leprechaun/.test(label) || /^[ghik]$/.test(kind);
      const giant = /giant|ogre|troll|ettin|minotaur/.test(label) || /^[HOT]$/.test(kind);
      const humanoidSkin = skeletal ? bone : undead ? this.material(0x819079) : skin;
      const clothing = this.material(/orc|goblin|kobold/.test(label) ? 0x625c42 : /wizard|mage|lich/.test(label) ? 0x514862 : friendly ? 0x797054 : 0x625044);
      this.mesh(body, skeletal ? 'cylinder' : 'sphere', skeletal ? bone : clothing, [0, 0.99, 0], skeletal ? [0.13, 0.5, 0.12] : [0.55, 0.68, 0.34]);
      this.mesh(body, 'sphere', clothing, [0, 0.69, 0], [0.48, 0.29, 0.34]);
      if (skeletal) for (let i = 0; i < 4; i++) this.mesh(body, 'torus', bone, [0, 1.14 - i * 0.105, 0], [0.4 - i * 0.033, 0.18, 0.38], [Math.PI / 2, 0, 0]);
      this.mesh(body, 'sphere', humanoidSkin, [0, 1.49, 0.025], [0.42, 0.48, 0.38]);
      this.mesh(body, 'sphere', humanoidSkin, [0, 1.33, 0.12], [0.31, 0.16, 0.3]);
      this.mesh(body, 'cone', humanoidSkin, [0, 1.47, 0.24], [0.1, 0.15, 0.13], [Math.PI / 2, 0, 0]);
      this._eyes(body, 1.53, 0.205, 0.104, skeletal ? 0.073 : 0.052, friendly);
      if (/goblin|orc|elf|kobold|imp/.test(label)) for (const side of [-1, 1]) this.mesh(body, 'cone', humanoidSkin, [side * 0.23, 1.52, 0], [0.14, 0.31, 0.12], [0, 0, side * -0.95]);
      const legs = [], arms = [];
      for (const side of [-1, 1]) {
        const leg = new THREE.Group(); leg.position.set(side * 0.15, 0.7, 0); body.add(leg); legs.push(leg);
        this.mesh(leg, 'cylinder', skeletal ? bone : clothing, [0, -0.25, 0], [skeletal ? 0.08 : 0.16, 0.5, skeletal ? 0.08 : 0.18]);
        this.mesh(leg, 'sphere', skeletal ? bone : dark, [0, -0.59, 0.06], [0.2, 0.22, 0.32]);
        const arm = new THREE.Group(); arm.position.set(side * 0.32, 1.23, 0); arm.rotation.z = side * 0.14; body.add(arm); arms.push(arm);
        this.mesh(arm, 'cylinder', skeletal ? bone : clothing, [0, -0.21, 0], [skeletal ? 0.07 : 0.16, 0.39, skeletal ? 0.07 : 0.18]);
        this.mesh(arm, 'cylinder', humanoidSkin, [0, -0.44, 0.055], [skeletal ? 0.06 : 0.12, 0.2, skeletal ? 0.06 : 0.13], [-0.36, 0, 0]);
        this.mesh(arm, 'sphere', humanoidSkin, [0, -0.58, 0.11], [0.16, 0.17, 0.17]);
      }
      this.mesh(body, 'box', this.material(0x302d25), [0, 0.75, 0.01], [0.48, 0.09, 0.37]);
      this.mesh(body, 'box', this.material(0xbaa568, 0.7, 0.45), [0, 0.75, 0.21], [0.11, 0.085, 0.025]);
      if (/gnome|wizard|mage|leprechaun/.test(label)) this.mesh(body, 'cone', clothing, [0, 1.91, 0.01], [0.59, 0.66, 0.59], [0, 0, -0.12]);
      else if (/soldier|orc|guard|knight|dwarf/.test(label)) {
        this.mesh(body, 'sphere', this.material(0x727970, 0.66, 0.45), [0, 1.68, 0], [0.47, 0.28, 0.44]);
        this.mesh(body, 'box', this.material(0x727970, 0.66, 0.45), [0, 1.52, 0.236], [0.058, 0.34, 0.04]);
      }
      if (profile.style==='demon'||/minotaur/.test(label)) for (const side of [-1, 1]) this.mesh(body, 'cone', bone, [side * 0.18, 1.8, -0.03], [0.14, 0.38, 0.13], [0.25, 0, side * -0.35]);
      if (data.weapon || (data.weapon===undefined&&!/ghost|wraith|nymph|human|shopkeeper|priest/.test(label))) {
        const weapon = new THREE.Group(); weapon.position.set(0, -0.55, 0.13); weapon.rotation.x = -0.32; arms[1].add(weapon);
        if(data.weapon)this._weapon(weapon,data.weapon);
        else if (/mage|wizard|lich/.test(label)) this._weapon(weapon, 'staff');
        else if (/ogre|troll|giant/.test(label)) this._weapon(weapon, 'club');
        else this._weapon(weapon, /orc|dwarf/.test(label) ? 'axe' : 'short sword');
        weapon.scale.setScalar(0.62);
      }
      group.userData.humanoid=true;
      if (/ghost|wraith/.test(label)) group.userData.hover = true;
      const metal=this.material(profile.boss?0x4d425d:0x555a6c,.42,.77);
      if(['orc','soldier','demon'].includes(profile.style)||profile.boss){
        for(const side of [-1,1]){
          this.mesh(body,'box',metal,[side*.34,1.29,0],[.28,.19,.4],[0,0,side*.18]);
          if(profile.boss||profile.style==='demon')for(let i=0;i<3;i++)this.mesh(body,'cone',bone,[side*(.28+i*.055),1.46,0],[.075,.25+i*.035,.075],[0,0,side*.28]);
        }
        this.mesh(body,'box',metal,[0,1.05,.18],[.39,.38,.06]);
        if(profile.style==='orc')for(const side of [-1,1])this.mesh(body,'cone',bone,[side*.095,1.37,.29],[.06,.14,.055]);
      }
      if(profile.style==='miner'){
        for(let i=0;i<5;i++)this.mesh(body,'box',this.material(0x73615a),[(i-2)*.052,1.22-Math.abs(i-2)*.02,.245],[.06,.33,.09]);
        this.mesh(body,'box',this.material(0xb4a086,.3,.6),[0,1.73,.238],[.12,.11,.055]);
      }
      if(profile.style==='caster'||profile.style==='undead'){
        const cloak=new THREE.Group();cloak.position.set(0,1.24,-.16);body.add(cloak);
        for(let i=0;i<5;i++)this.mesh(cloak,'box',clothing,[(i-2)*.105,-.42,0],[.11,.98-Math.abs(i-2)*.09,.045],[.12,0,0]);
        group.userData.cloak=cloak;
      }
      if(profile.boss){this.mesh(body,'box',this.material(0x937795,.2,.7,0x241229),[0,1.08,.224],[.17,.23,.04]);}
      group.userData.legs = legs; group.userData.arms = arms;
    }
    if(group.userData.humanoid)body.scale.setScalar(profile.height/1.8);
    else if(profile.large){
      body.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(body),size=bounds.getSize(new THREE.Vector3());
      const scale=Math.min(profile.height/Math.max(.1,size.y),2.65/Math.max(.1,size.x),2.6/Math.max(.1,size.z));body.scale.multiplyScalar(scale);
    }
    if(profile.boss&&group.userData.humanoid){body.scale.x*=1.55;body.scale.z*=1.35;}
    group.userData.baseScale=body.scale.clone();
    return group;
  }

  _item(name, color, kind, data={}) {
    const group = new THREE.Group();
    const profile=itemProfile(name,kind,data),label=name.toLowerCase(),family=profile.family;
    const material = this.material(colorOf(color, 0x9f8f63));
    this._shadow(group, 0.9);group.userData.modelKey=profile.key;group.userData.family=family;
    if(detailedItem(this,group,profile,colorOf(color,0x80788b)))return group;
    // Visible proportions and fittings distinguish appearances without exposing enchantments.
    group.scale.set(1+profile.variant*.06,1+profile.variant*.1,1+profile.variant*.06);
    if (family==='gold') {
      for (let i = 0; i < 9; i++) this.mesh(group, 'cylinder', this.material(0xd2b461, 0.77, 0.3), [Math.sin(i * 2.4) * 0.2, 0.028 + (i % 3) * 0.021, Math.cos(i * 2.4) * 0.19], [0.16, 0.027, 0.16], [0.05 * (i % 2), i, i % 4 === 0 ? 0.15 : 0]);
    } else if (/potion|bottle/.test(label) || kind === '!') {
      if(!this.geometries.has('potion-bottle')){
        const points=[[0,.02],[.105,.02],[.135,.05],[.14,.27],[.12,.34],[.047,.4],[.047,.51],[.035,.51],[.035,.4],[.108,.33],[.127,.27],[.123,.055],[0,.04]].map(p=>new THREE.Vector2(...p));
        this.geometries.set('potion-bottle',this.keep(new THREE.LatheGeometry(points,24)));
        this.bottleMaterial=this.keep(new THREE.MeshPhysicalMaterial({color:0xb2c4b4,roughness:.15,metalness:.03,transparent:true,opacity:.42,depthWrite:false,clearcoat:1}));
      }
      const bottle=new THREE.Mesh(this.geometries.get('potion-bottle'),this.bottleMaterial);group.add(bottle);
      this.mesh(group,'sphere',this.material(colorOf(color,0x436846),.05,.27),[0,.18,0],[.24,.29,.24]);
      this.mesh(group, 'cylinder', this.material(0x907247), [0, 0.535, 0], [0.105, 0.055, 0.105]);
      this.mesh(group, 'box', this.material(0xc7b687), [0, 0.25, 0.148], [0.13, 0.14, 0.012]);
    } else if (/scroll|paper/.test(label) || kind === '?') {
      this.mesh(group, 'box', this.material(0xc9bd93), [0, 0.055, 0], [0.48, 0.04, 0.44]);
      for (const side of [-1, 1]) this.mesh(group, 'cylinder', this.material(0xd6c89f), [side * 0.24, 0.09, 0], [0.11, 0.53, 0.11], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 4; i++) this.mesh(group, 'box', this.material(0x655848), [0, 0.079, -0.12 + i * 0.07], [0.25 - (i % 2) * 0.08, 0.006, 0.009]);
    } else if (/spellbook|book/.test(label) || kind === '+') {
      this.mesh(group, 'box', material, [0, 0.095, 0], [0.46, 0.16, 0.6]);
      this.mesh(group, 'box', this.material(0xc3ba95), [0.02, 0.096, 0.02], [0.41, 0.1, 0.57]);
      this.mesh(group, 'box', material, [0, 0.17, 0], [0.47, 0.025, 0.61]);
      this.mesh(group, 'torus', this.material(0xc3a25d, 0.7, 0.4), [0, 0.185, 0], [0.2, 0.2, 0.045], [Math.PI / 2, 0, 0]);
    } else if (/chest|large box|ice box/.test(label)) this._chest(group);
    else if (/boulder|statue/.test(label) || kind === '`') {
      if (/statue/.test(label)) {
        this.mesh(group, 'cylinder', this.wallMaterial, [0, 0.13, 0], [1.08, 0.26, 1.08]);
        this.mesh(group, 'sphere', this.wallMaterial, [0, 0.91, 0], [0.59, 1.44, 0.51]);
        this.mesh(group, 'sphere', this.wallMaterial, [0, 1.75, 0], [0.49, 0.52, 0.42]);
      } else this.mesh(group, 'ico', this.wallMaterial, [0, 0.78, 0], [1.91, 1.7, 1.87], [0.2, 0.4, 0.15]);
    } else if (family==='gem') {
      this.mesh(group, /rock|stone/.test(label) ? 'ico' : 'gem', this.material(colorOf(color, 0x80bcb2), 0.4, 0.23), [0, 0.135, 0], [0.31, 0.28, 0.3], [0.3, 0.7, 0.2]);
    } else if (family==='ring'||family==='amulet') {
      this.mesh(group, 'torus', this.material(0xc4af70, 0.8, 0.3), [0, 0.035, 0], [0.25, 0.25, 0.18], [Math.PI / 2, 0, 0]);
      this.mesh(group, 'gem', material, [0, 0.07, 0.13], [0.13, 0.1, 0.14]);
    } else if (/sword|dagger|knife|axe|mace|club|staff|spear|lance|bow|arrow|bolt|dart|shuriken|pick|hammer|whip|wand/.test(label) || kind === ')' || kind === '/') {
      const weapon = new THREE.Group(); weapon.position.set(0, 0.13, 0.29); weapon.rotation.set(Math.PI / 2, 0, 0.65); group.add(weapon);
      this._weapon(weapon, label); weapon.scale.setScalar(0.85);
    } else if (/shield/.test(label)) {
      const shield = new THREE.Group(); shield.rotation.x = -Math.PI / 2; shield.position.y = 0.16; group.add(shield); this._shield(shield, label); shield.scale.setScalar(0.8);
    } else if (/mail|armor|helmet|helm|boots|gloves|cloak|shirt/.test(label) || kind === '[') {
      if (/helm/.test(label)) this.mesh(group, 'sphere', this.material(0x9d9f8c, 0.68, 0.43), [0, 0.2, 0], [0.46, 0.39, 0.5]);
      else {
        this.mesh(group, 'sphere', this.material(/cloak|shirt/.test(label) ? 0x736352 : 0x91968a, /cloak|shirt/.test(label) ? 0 : 0.6, 0.6), [0, 0.14, 0], [0.68, 0.2, 0.76]);
        for (const side of [-1, 1]) this.mesh(group, 'sphere', material, [side * 0.38, 0.09, -0.19], [0.27, 0.17, 0.34]);
      }
    } else if (/corpse/.test(label) || kind === '%') {
      if (/corpse/.test(label)) {
        this.mesh(group, 'sphere', this.material(0x695a49), [0, 0.17, 0], [0.43, 0.28, 0.87]);
        this.mesh(group, 'sphere', this.material(0x897a62), [0, 0.18, 0.48], [0.3, 0.26, 0.31]);
      } else {
        this.mesh(group, 'sphere', this.material(/apple/.test(label) ? 0xa85935 : /carrot/.test(label) ? 0xc18035 : 0xb59563), [0, 0.13, 0], [0.39, 0.23, 0.35]);
      }
    } else {
      this.mesh(group, 'sphere', this.material(0x99835c), [0, 0.22, 0], [0.44, 0.43, 0.37]);
      this.mesh(group, 'torus', this.material(0x5d4930), [0, 0.4, 0], [0.21, 0.21, 0.1], [Math.PI / 2, 0, 0]);
    }
    return group;
  }

  _chest(parent, mimic = false) {
    const iron = this.material(0x6e705d, 0.7, 0.5);
    this.mesh(parent, 'box', this.woodMaterial, [0, 0.29, 0], [1.04, 0.56, 0.74]);
    this.mesh(parent, 'cylinder', this.woodMaterial, [0, 0.59, 0], [0.74, 1.04, 0.74], [0, 0, Math.PI / 2]);
    this.mesh(parent, 'box', this.woodMaterial, [0, 0.42, 0], [1.05, 0.29, 0.76]);
    for (const side of [-1, 1]) {
      this.mesh(parent, 'box', iron, [side * 0.34, 0.31, 0.39], [0.09, 0.58, 0.028]);
      this.mesh(parent, 'box', iron, [side * 0.34, 0.6, 0], [0.09, 0.08, 0.79]);
    }
    this.mesh(parent, 'box', this.material(0xb19a56, 0.7, 0.43), [0, 0.41, 0.402], [0.19, 0.22, 0.03]);
    if (mimic) for (let i = 0; i < 7; i++) this.mesh(parent, 'cone', this.material(0xcac19e), [-0.4 + i * 0.13, 0.43, 0.409], [0.06, 0.13, 0.07], [Math.PI, 0, 0]);
  }

  _weapon(parent, name='long sword') {
    const label=name.toLowerCase(),steel=this.material(0x565c70,.46,.73),edge=this.material(0x828799,.52,.64),gold=this.material(0x666072,.45,.7),leather=this.material(0x4f3726);
    if(/bare hands|empty|unarmed/.test(label))return;
    if(/crossbow/.test(label)&&!/bolt/.test(label)){
      this.mesh(parent,'box',this.woodMaterial,[0,.25,0],[.12,1,.13]);
      for(const side of [-1,1])this.bone(parent,[0,.57,0],[side*.47,.42,.08],.035,steel);
      this.bone(parent,[-.47,.42,.08],[.47,.42,.08],.005,edge);return;
    }
    if(/sling|boomerang/.test(label)){
      for(const side of [-1,1])this.bone(parent,[0,0,0],[side*.26,.43,0],/sling/.test(label)?.012:.06,leather);
      if(/sling/.test(label))this.mesh(parent,'box',leather,[0,-.04,0],[.13,.19,.035]);return;
    }
    if(/shuriken|throwing star/.test(label)){
      for(let i=0;i<4;i++)this.mesh(parent,'cone',steel,[Math.sin(i*Math.PI/2)*.1,Math.cos(i*Math.PI/2)*.1,0],[.1,.23,.025],[0,0,-i*Math.PI/2]);return;
    }
    if(/trident|fork|grappling/.test(label)){
      this.bone(parent,[0,-.2,0],[0,1.1,0],.035,this.woodMaterial);
      for(const side of [-1,0,1]){this.bone(parent,[0,1.04,0],[side*.17,1.17,0],.028,steel);this.mesh(parent,'cone',steel,[side*.17,1.3,0],[.08,.3,.04]);}return;
    }
    if(/unicorn horn/.test(label)){this.mesh(parent,'cone',this.material(0xb8ad9b),[0,.35,0],[.15,.95,.15]);return;}
    if(/flail/.test(label)){
      this.bone(parent,[0,-.16,0],[0,.35,0],.035,this.woodMaterial);
      for(let i=0;i<5;i++)this.mesh(parent,'torus',steel,[i*.055,.4+i*.055,0],[.06,.09,.06],[0,i%2*Math.PI/2,0]);
      this.mesh(parent,'ico',steel,[.29,.72,0],[.24,.24,.24]);return;
    }
    if(/bow|\byumi\b/.test(label)&&!/bolt/.test(label)) {
      for(const side of [-1,1]){this.bone(parent,[0,0,0],[side*.15,side*.45,0],.036,this.woodMaterial);this.bone(parent,[side*.15,side*.45,0],[0,side*.78,.08],.024,this.woodMaterial);}
      this.bone(parent,[0,-.78,.08],[0,.78,.08],.004,edge);return;
    }
    if(/arrow|bolt|dart|\bya\b/.test(label)){
      const short=/dart/.test(label),length=short?.36:.92;
      this.bone(parent,[0,0,0],[0,length,0],short?.011:.014,this.woodMaterial);
      this.mesh(parent,'cone',steel,[0,length+.07,0],[.065,.19,.025]);
      for(let i=0;i<3;i++)this.mesh(parent,'box',this.material(0x9b8c6d),[Math.cos(i*2.094)*.022,.11,Math.sin(i*2.094)*.022],[.07,.17,.007],[0,i*2.094,0]);return;
    }
    if(/whip|rubber hose/.test(label)){
      this.bone(parent,[0,-.15,0],[0,.2,0],.035,leather);
      for(let i=0;i<22;i++){const t=i/21,a=t*Math.PI*3,b=(i+1)/21*Math.PI*3;this.bone(parent,[Math.sin(a)*.15,.25+t*.35,Math.cos(a)*.15],[Math.sin(b)*.15,.25+(i+1)/21*.35,Math.cos(b)*.15],.013,leather);}return;
    }
    const long=/staff|spear|lance|pole|halberd|glaive|guisarme|bardiche|voulge|ranseur|spetum|fauchard|partisan|lucern|bec de corbin|bill-guisarme|javelin/.test(label),wand=/wand/.test(label);
    this.mesh(parent,'cylinder',wand&&/iron|steel|silver|copper|brass|platinum|tin|hexagonal/.test(label)?steel:long||wand?this.woodMaterial:leather,[0,long?.5:0,0],[.065,long?1.75:wand?.62:.31,.065]);
    if(long||wand){
      if(/spear|lance|halberd|glaive|guisarme|bardiche|voulge|ranseur|spetum|fauchard|partisan|lucern|bec de corbin|javelin/.test(label))this.mesh(parent,'cone',steel,[0,1.51,0],[.15,.5,.06]);
      else{this.mesh(parent,'gem',gold,[0,wand?.35:1.4,0],[.12,.17,.12]);if(/staff/.test(label))this.mesh(parent,'gem',this.material(0x8baeb7,.3,.23,0x294e60),[0,1.54,0],[.15,.2,.15]);}
      return;
    }
    this.mesh(parent,'sphere',gold,[0,-.19,0],[.105,.11,.1]);
    for(let i=0;i<7;i++)this.mesh(parent,'torus',this.material(0x775b39),[0,-.12+i*.038,0],[.071,.071,.2],[Math.PI/2,0,0]);
    if(/pick|mattock/.test(label)){
      this.bone(parent,[0,-.16,0],[0,.96,0],.038,this.woodMaterial);
      this.mesh(parent,'box',steel,[0,.77,0],[.18,.17,.15]);
      for(const side of [-1,1])this.mesh(parent,'cone',steel,[side*.24,.73,0],[.16,.51,/mattock/.test(label)&&side===1?.22:.07],[0,0,-side*1.72]);
    }else if(/axe/.test(label)){
      this.mesh(parent,'cylinder',this.woodMaterial,[0,.36,0],[.075,.85,.075]);
      if(!this.geometries.has('axe-head')){
        const shape=new THREE.Shape();shape.moveTo(-.045,.55);shape.lineTo(.09,.53);shape.quadraticCurveTo(.2,.55,.31,.42);shape.quadraticCurveTo(.58,.58,.47,.99);shape.quadraticCurveTo(.2,.78,.06,.85);shape.lineTo(-.045,.82);shape.closePath();
        const g=new THREE.ExtrudeGeometry(shape,{depth:.046,bevelEnabled:true,bevelThickness:.012,bevelSize:.013,bevelSegments:2,steps:1,curveSegments:12});g.translate(0,0,-.023);this.geometries.set('axe-head',this.keep(g));
      }
      const head=new THREE.Mesh(this.geometries.get('axe-head'),steel);head.castShadow=true;parent.add(head);
      this.mesh(parent,'cylinder',gold,[0,.69,0],[.11,.29,.11]);
      if(/battle|pick/.test(label))this.mesh(parent,'cone',steel,[-.23,.69,0],[.19,.5,.08],[0,0,Math.PI/2]);
    }else if(/mace|hammer|club|morning star|aklys/.test(label)){
      this.mesh(parent,'cylinder',this.woodMaterial,[0,.28,0],[.085,.7,.085]);
      this.mesh(parent,/hammer/.test(label)?'box':'ico',/club|aklys/.test(label)?this.woodMaterial:steel,[0,.68,0],[.34,.35,.29]);
      if(/mace|morning star/.test(label))for(let i=0;i<6;i++)this.mesh(parent,'cone',edge,[Math.sin(i)*.17,.69,Math.cos(i)*.17],[.08,.25,.08],[Math.cos(i)*1.2,0,Math.sin(i)*1.2]);
    }else{
      const length=/dagger|knife|short|athame|scalpel|stiletto|worm tooth/.test(label)?.64:/two-handed|tsurugi/.test(label)?1.94:1.72;
      for(const side of [-1,1]){
        this.bone(parent,[0,.19,0],[side*.12,.19,0],.032,gold);
        this.bone(parent,[side*.12,.19,0],[side*.23,.13,.008],.027,steel);
        this.mesh(parent,'sphere',gold,[side*.23,.13,.008],[.068,.074,.068]);
      }
      const key=`blade:${length}`;
      if(!this.geometries.has(key)){
        const vertices=[],indices=[];
        // Forged diamond cross-section: broad faces, sharp edges and one taper.
        for(const [height,width,thick] of [[.23,.068,.025],[.23+length*.72,.05,.019],[.23+length,0,.001]]){
          vertices.push(-width,height,0, 0,height,thick, width,height,0, 0,height,-thick);
        }
        for(let row=0;row<2;row++)for(let j=0;j<4;j++){
          const a=row*4+j,b=row*4+(j+1)%4,c=a+4,d=b+4;indices.push(a,b,c,b,d,c);
        }
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();this.geometries.set(key,this.keep(g));
      }
      const blade=new THREE.Mesh(this.geometries.get(key),steel);blade.castShadow=true;parent.add(blade);
      for(const face of [-1,1]){
        this.mesh(parent,'box',this.material(0x303744,.42,.77),[0,.29+length*.28,face*.025],[.012,length*.53,.002]);
        this.mesh(parent,'box',gold,[0,.255,face*.027],[.035,.012,.002]);
      }

    }
  }

  _shield(parent,name='small shield') {
    const metal=this.material(0x535b70,.48,.75),gold=this.material(0x797085,.48,.72);
    this.mesh(parent,'sphere',this.woodMaterial,[0,0,0],[.7,.85,.15]);
    this.mesh(parent,'torus',metal,[0,0,.045],[.72,.85,.65]);
    this.mesh(parent,'sphere',metal,[0,0,.105],[.22,.24,.15]);
    this.mesh(parent,'box',gold,[0,0,.075],[.06,.75,.04]);
    this.mesh(parent,'box',gold,[0,.14,.075],[.6,.045,.04]);
    for(let i=0;i<10;i++)this.mesh(parent,'sphere',gold,[Math.sin(i*Math.PI/5)*.32,Math.cos(i*Math.PI/5)*.38,.09],[.032,.032,.021]);
  }

  holdMap(open,snapshot=this.snapshot,elapsed=0){
    this.mapHeld=!!open;
    if(!open)return;
    if(!this.parchment){
      const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=700;
      const texture=this.keep(new THREE.CanvasTexture(canvas));texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
      const geometry=this.keep(new THREE.PlaneGeometry(1.85,.81,36,18)),pos=geometry.attributes.position;
      for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);pos.setZ(i,.025*Math.sin(x*8)+.015*Math.cos(y*12)+.05*Math.pow(Math.abs(x)/.925,8));}
      geometry.computeVertexNormals();
      const material=this.keep(new THREE.MeshStandardMaterial({map:texture,roughness:1,metalness:0,side:THREE.DoubleSide}));
      const mesh=new THREE.Mesh(geometry,material);mesh.name='held-parchment';this.viewScene.add(mesh);
      this.parchment={canvas,texture,mesh};
    }
    this.mapRecord=mapRecord(snapshot,snapshot.multiplayer?(snapshot.cartography?.elapsed??elapsed):elapsed);drawParchment(this.parchment.canvas,this.mapRecord);this.parchment.texture.needsUpdate=true;
  }
  highlightPickup(id,door=null){
    const key=id!==null?`object:${id}`:door?`door:${door.x},${door.y}`:null;if(this.highlightKey===key)return;
    if(this.highlightGroup)this.highlightGroup.traverse(m=>{if(m.userData.highlightOriginal){m.material.dispose();m.material=m.userData.highlightOriginal;delete m.userData.highlightOriginal;}});
    this.highlightKey=key;this.highlightGroup=door?this.doorTargets?.get(`${door.x},${door.y}`):this.pickups.get(key)?.group;
    this.highlightGroup?.traverse(m=>{if(m.isMesh&&m.material.emissive){m.userData.highlightOriginal=m.material;m.material=m.material.clone();m.material.emissive.setHex(0x9daec8);m.material.emissiveIntensity=.1;}});
  }
  _buildViewModel() {
    this.viewScene=new THREE.Scene();this.viewCamera=new THREE.PerspectiveCamera(64,1,.01,8);
    const environment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(this.renderer);
    const reflection=this.keep(pmrem.fromScene(environment,.06));environment.dispose();pmrem.dispose();
    this.viewScene.environment=reflection.texture;this.viewScene.environmentIntensity=.12;
    this.scene.environment=reflection.texture;this.scene.environmentIntensity=.055;
    this.viewFill=new THREE.HemisphereLight(0x9aa7cb,0x211a30,.35);this.viewScene.add(this.viewFill);
    this.viewLamp=new THREE.PointLight(0xc0cae5,3,8);this.viewLamp.position.set(-.5,.7,1);this.viewScene.add(this.viewLamp);
    this.rightHand=new THREE.Group();this.leftHand=new THREE.Group();this.viewScene.add(this.rightHand,this.leftHand);
    this.rightHand.scale.setScalar(.7);this.leftHand.scale.setScalar(.6);
    this.weaponMount=new THREE.Group();this.rightHand.add(this.weaponMount);
    this.shieldMount=new THREE.Group();this.leftHand.add(this.shieldMount);
    // Weapon/shield mounts are the complete view model; no hands or arms.
    this.rightHand.name='weapon-rig';this.leftHand.name='shield-rig';
    this.equipmentSignature='';this.guarding=false;
  }

  _readEquipment(snapshot) {
    const inventory=snapshot.inventory||[];
    const weapon=snapshot.player?.weapon||inventory.find(i=>/weapon in hand|wielded/.test(i.name||''))?.name||'bare hands';
    const shield=snapshot.player?.shield||inventory.find(i=>/shield/.test(i.name||'')&&i.equipped)?.name||'';
    const signature=weapon+'|'+shield;if(signature===this.equipmentSignature)return;
    this.equipmentSignature=signature;this.weaponMount.clear();this.shieldMount.clear();this._weapon(this.weaponMount,weapon);
    this.weaponMount.rotation.set(0,0,0);this.weaponMount.scale.setScalar(.92);
    this.hasShield=!!shield;this.leftHand.visible=!!shield;
    if(shield){this._shield(this.shieldMount,shield);this.shieldMount.rotation.y=.24;this.shieldMount.scale.setScalar(.88);}
    this.weaponName=weapon;
  }

  _buildMotes() {
    const geometry=this.keep(new THREE.BufferGeometry());
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([],3));
    const material=this.keep(new THREE.ShaderMaterial({transparent:true,depthWrite:false,
      uniforms:{time:{value:0},eye:{value:new THREE.Vector3()},lamps:{value:Array.from({length:7},()=>new THREE.Vector3())},power:{value:Array(7).fill(0)},height:{value:900},blind:{value:0}},
      vertexShader:`uniform float time;uniform float height;uniform vec3 eye;uniform vec3 lamps[7];uniform float power[7];uniform float blind;
        varying float illumination;varying float distanceToEye;
        void main(){vec3 p=position;p.x+=sin(time*.19+position.z*2.)*.035;p.y+=sin(time*.24+position.x)*.065;
          distanceToEye=distance(p,eye);illumination=1.5/(1.+distanceToEye*distanceToEye*.45);
          for(int i=0;i<7;i++){float d=distance(p,lamps[i]);illumination+=power[i]/(1.+d*d)*.13;}
          illumination=clamp(illumination,0.,1.)*(1.-blind);
          vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(height*.018/-mv.z,1.,7.);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`varying float illumination;varying float distanceToEye;
        void main(){float r=length(gl_PointCoord-.5)*2.;float soft=1.-smoothstep(.05,1.,r);
          float alpha=soft*illumination*.28*exp(-distanceToEye*distanceToEye*.002);
          gl_FragColor=vec4(.55,.61,.78,alpha);}`
    }));
    this.motes=new THREE.Points(geometry,material);this.motes.name='world-space-dust';this.scene.add(this.motes);
  }

  _placeMotes(tiles){
    if(!this.motes)return;
    const positions=[];
    for(const t of tiles){
      if(!['floor','corridor','door_open'].includes(t.type))continue;
      for(let i=0;i<5;i++)positions.push((t.x+.5)*CELL+(hash(t.x*7+i,t.y,91)-.5)*2.35,.3+hash(t.x,t.y*5+i,92)*2.8,(t.y+.5)*CELL+(hash(t.x*5+i,t.y,93)-.5)*2.35);
    }
    this.motes.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.motes.geometry.computeBoundingSphere();
  }

  _dressing(p){
    const group=new THREE.Group();group.position.set(p.x,0,p.z);group.rotation.y=p.angle;group.name=`dressing-${p.theme}-${p.variant}`;group.userData.dressing=true;this.world.add(group);
    const stone=this.material(0x535768,0,.97),dark=this.material(0x202333,0,1),bone=this.material(0x9995a2,0,.95),iron=this.material(0x45485b,.35,.82),cloth=this.material(0x45344e,0,1);
    const animate=(type,object,extra={})=>{object.userData.decorativeMotion=true;this.features.push({type,group:object,phase:p.phase,...extra});};
    // Wall attachments stay within the unwalkable margin. Low fragments and
    // overhead features leave native routes, door approaches and stairs open.
    if(p.interior){
      // Step-height fragments and ceiling fittings occupy the room's volume
      // without invisible furniture colliders or obstructing native puzzles.
      for(let i=0;i<7;i++){
        const a=i*2.399+p.phase,r=.2+hash(i,p.cellX,p.cellY)*.65;
        this.mesh(group,'box',p.theme===4?this.woodMaterial:stone,[Math.cos(a)*r,.03,Math.sin(a)*r],[.15+hash(i,2)*.18,.035+hash(i,3)*.035,.14],[0,a,0]);
      }
      if(p.variant===0){
        const hanging=new THREE.Group();hanging.position.set(0,3.45,0);group.add(hanging);
        for(let i=0;i<5;i++)this.mesh(hanging,'torus',iron,[0,-i*.1,0],[.08,.13,.08],[0,i%2*Math.PI/2,0]);
        for(const side of [-1,1])this.mesh(hanging,'box',iron,[side*.18,-.53,0],[.38,.045,.045]);
        animate('hanging',hanging,{amplitude:.02});
      }else if(p.variant===1){
        this.mesh(group,'box',this.material(p.theme===6?0x462831:0x343345,0,1),[0,.006,0],[1.1,.009,.65],[0,.2,0]);
        for(let i=0;i<4;i++)this.mesh(group,'box',bone,[(i-1.5)*.22,.013,.05],[.035,.009,.21]);
      }
      return;
    }
    if(p.theme>=4){
      if(p.theme===4){
        // Gnomish mining timbers, exposed ore and suspended tools.
        for(const side of [-1,1])this.mesh(group,'box',this.woodMaterial,[side*.62,1.7,.09],[.13,3.4,.17]);
        this.mesh(group,'box',this.woodMaterial,[0,3.23,.1],[1.38,.19,.19]);
        for(let i=0;i<5;i++)this.mesh(group,'gem',this.material(0x777898,.25,.65,0x19172a),[(i-2)*.16,.35+(i%3)*.12,.12],[.13,.25,.13],[0,i*.8,.3]);
        this.mesh(group,'box',iron,[.25,1.8,.18],[.47,.07,.055],[0,0,.15]);this.mesh(group,'box',this.woodMaterial,[.25,1.52,.17],[.045,.58,.045]);
      }else if(p.theme===5){
        // Recessed puzzle inscriptions; absolutely no floor obstacles.
        for(let i=0;i<3;i++)this.mesh(group,'box',stone,[(i-1)*.28,1.8,.06],[.24,.58,.12]);
        for(let i=0;i<4;i++)this.mesh(group,'box',bone,[(i-1.5)*.17,1.8,.132],[.027,.21+(i%2)*.17,.015]);
      }else if(p.theme===6){
        const obsidian=this.material(0x382737,.35,.61),ember=this.material(0x8e4858,0,.8,0x4b1224);
        for(let i=0;i<5;i++)this.mesh(group,'box',obsidian,[(i-2)*.2,.8+Math.abs(i-2)*.17,.08],[.22,1.8,.14],[0,0,(i-2)*.06]);
        for(const side of [-1,1])this.mesh(group,'box',ember,[side*.15,1.9,.18],[.025,.7,.017],[0,0,side*.17]);
        this.features.push({type:'rune',material:ember});
      }else{
        const clothColor=this.material(p.theme===7?0x827898:0x3e3956,0,.85);
        const banner=new THREE.Group();banner.position.set(0,3.13,.12);group.add(banner);
        for(let i=0;i<5;i++)this.mesh(banner,'box',clothColor,[(i-2)*.15,-.65,0],[.15,1.5-Math.abs(i-2)*.1,.03]);
        this.mesh(banner,'gem',bone,[0,-.48,.035],[.17,.31,.018]);animate('hanging',banner,{amplitude:.014});
      }
      return;
    }
    if(p.theme===0){
      if(p.variant===0){
        this.mesh(group,'box',dark,[0,1.42,.03],[.78,2.18,.08]);
        for(const side of [-1,1])this.mesh(group,'box',stone,[side*.42,1.45,.07],[.12,2.32,.14]);
        for(const y of [.3,2.58])this.mesh(group,'box',stone,[0,y,.075],[.96,.15,.15]);
        this.mesh(group,'box',bone,[0,1.47,.13],[.06,.71,.04]);this.mesh(group,'box',bone,[0,1.61,.13],[.4,.06,.04]);
        for(let i=0;i<4;i++)this.mesh(group,'box',stone,[(i-1.5)*.19,2.73-Math.abs(i-1.5)*.06,.06],[.2,.18,.13]);
      }else if(p.variant===2){
        this.mesh(group,'box',dark,[0,1.42,.025],[.99,2.5,.055]);
        for(const side of [-1,1]){
          this.mesh(group,'box',stone,[side*.5,1.46,.07],[.1,2.6,.14]);
          this.mesh(group,'box',stone,[side*.2,1.84,.13],[.22,.27,.15]);
          this.mesh(group,'box',stone,[side*.16,.82,.12],[.16,.66,.13]);
          this.mesh(group,'box',stone,[side*.26,1.54,.13],[.13,.45,.15],[0,0,side*.13]);
        }
        this.mesh(group,'sphere',stone,[0,2.11,.12],[.32,.39,.18]);
        this.mesh(group,'box',dark,[0,2.13,.218],[.18,.035,.018]);
        this.mesh(group,'box',stone,[0,1.57,.13],[.37,.53,.17]);
        this.mesh(group,'box',iron,[0,1.24,.227],[.08,.53,.014]);
        this.mesh(group,'box',bone,[0,1.46,.236],[.28,.04,.018]);
        for(const y of [.2,2.77])this.mesh(group,'box',stone,[0,y,.08],[1.13,.17,.16]);
      }else{
        for(let row=0;row<3;row++){
          const y=.65+row*.69;this.mesh(group,'box',dark,[0,y,.045],[1.25,.51,.07]);
          this.mesh(group,'box',stone,[0,y-.27,.09],[1.4,.09,.18]);
          for(let j=0;j<3;j++){
            const x=(j-1)*.4;this.mesh(group,'sphere',bone,[x,y-.03,.12],[.2,.22,.15]);
            for(const side of [-1,1])this.mesh(group,'box',dark,[x+side*.043,y-.015,.205],[.038,.039,.013]);
          }
        }
      }
      for(let i=0;i<6;i++)this.mesh(group,'box',bone,[(i-2.5)*.18,.035+(i%2)*.015,.11],[.19,.035,.045],[0,i*.79,.13]);
    }else if(p.theme===1){
      // Splintered storage remains, flattened against the masonry rather than
      // presenting another lootable chest or blocking a passage.
      for(let i=0;i<7;i++)this.mesh(group,'box',this.woodMaterial,[(i-3)*.15,.31+(i%3)*.045,.08],[.11,.48+(i%3)*.12,.12],[0,0,(i-3)*.035]);
      for(const y of [.15,.56])this.mesh(group,'box',iron,[0,y,.16],[1.09,.045,.025]);
      this.mesh(group,'box',this.woodMaterial,[.04,.41,.17],[.87,.085,.075],[0,0,.27]);
      if(p.variant===0){
        this.mesh(group,'box',iron,[0,2.1,.06],[1.25,.1,.12]);
        for(let i=0;i<3;i++){
          const x=(i-1)*.34;this.mesh(group,'box',this.woodMaterial,[x,1.75,.13],[.045,.63,.045],[0,0,(i-1)*.1]);
          this.mesh(group,'box',iron,[x,1.98,.14],[.19,.14,.05]);
        }
      }else{
        const banner=new THREE.Group();banner.position.set(0,3.04,.1);group.add(banner);
        this.mesh(group,'box',iron,[0,3.09,.1],[1.1,.045,.045]);
        for(let i=0;i<6;i++)this.mesh(banner,'box',cloth,[(i-2.5)*.14,-.63+Math.abs(i-2.5)*.03,0],[.145,1.38-Math.abs(i-2.5)*.08,.035]);
        this.mesh(banner,'box',this.material(0x8c809b,0,.9),[0,-.52,.025],[.035,.53,.012]);
        this.mesh(banner,'box',this.material(0x8c809b,0,.9),[0,-.42,.025],[.31,.035,.012]);
        animate('hanging',banner,{amplitude:.018});
      }
    }else if(p.theme===2){
      for(let i=0;i<5;i++)this.mesh(group,'box',stone,[0,.34+i*.47,.07],[.82-i*.09,.44,.14]);
      const rune=this.material(0x7e6f9c,0,.85,0x413459);
      for(const side of [-1,1]){
        this.mesh(group,'box',rune,[side*.12,1.75,.156],[.047,.37,.017],[0,0,side*.42]);
        this.mesh(group,'box',rune,[side*.1,2.05,.156],[.034,.22,.017],[0,0,-side*.52]);
      }
      this.features.push({type:'rune',material:rune});
      for(let i=0;i<4;i++){
        const mote=this.mesh(group,'box',this.material(0x8f87b0,0,.9,0x53426b),[0,1.65,.25],[.013,.013,.013]);
        animate('wisp',mote,{index:i});
      }
      if(p.variant===2)for(const side of [-1,1])this.mesh(group,'box',dark,[side*.42,1.47,.045],[.1,2.27,.08]);
    }else{
      const leaf=this.material(0x364c4c,0,.97),stem=this.material(0x38434d,0,1);
      const roots=new THREE.Group();roots.position.set(0,3.34,.1);group.add(roots);
      for(let i=0;i<5;i++){
        const x=(i-2)*.19,len=.65+hash(i,p.cellX,p.cellY)*1.15;
        this.mesh(roots,'box',stem,[x,-len/2,0],[.035,len,.035],[0,0,Math.sin(i)*.12]);
        for(let j=0;j<3;j++)this.mesh(roots,'box',leaf,[x+(j%2?.06:-.06),-.25-j*len*.22,.04],[.12,.075,.035],[0,0,j%2?.6:-.6]);
      }
      animate('hanging',roots,{amplitude:.012});
      for(let i=0;i<5;i++){
        const x=(i-2)*.19,h=.06+(i%3)*.035;
        this.mesh(group,'box',bone,[x,h/2,.13],[.025,h,.025]);
        this.mesh(group,'sphere',this.material(0x647e85,0,.9,0x10252b),[x,h,.13],[.12,.052,.1]);
      }
      const water=this.material(0x61778f,.15,.4,0x121d2a);
      for(let i=0;i<3;i++){
        const drop=this.mesh(group,'box',water,[(i-1)*.14,2,.17],[.012,.08,.008]);animate('trickle',drop,{index:i});
      }
      this.mesh(group,'box',this.material(0x242e40,.18,.32),[0,.008,.18],[.82,.012,.35]);
    }
    if(p.variant===2){
      const chain=new THREE.Group();chain.position.set(.56,3.45,.12);group.add(chain);
      for(let i=0;i<8;i++)this.mesh(chain,'torus',iron,[0,-i*.083,0],[.075,.11,.06],[0,i%2*Math.PI/2,0]);
      animate('hanging',chain,{amplitude:.025});
    }
  }

  _batchDressing(){
    const batches=new Map(),roots=this.world.children.filter(o=>o.userData.dressing);
    this.world.updateMatrixWorld(true);
    for(const root of roots)root.traverse(mesh=>{
      if(!mesh.isMesh)return;
      for(let p=mesh;p&&p!==this.world;p=p.parent)if(p.userData.decorativeMotion)return;
      const key=mesh.geometry.uuid+mesh.material.uuid;
      if(!batches.has(key))batches.set(key,[]);batches.get(key).push(mesh);
    });
    for(const meshes of batches.values()){
      if(meshes.length<3)continue;
      const first=meshes[0],batch=new THREE.InstancedMesh(first.geometry,first.material,meshes.length);
      meshes.forEach((mesh,i)=>{batch.setMatrixAt(i,mesh.matrixWorld);mesh.removeFromParent();});
      batch.castShadow=batch.receiveShadow=true;batch.computeBoundingSphere();batch.name='dungeon-dressing-batch';this.world.add(batch);
    }
  }

  setPose(pose){Object.assign(this.pose,pose);this.cameraPlaced=true;}
  guard(value){this.guarding=!!value;}
  attack(kind='melee'){
    if(kind==='hit'){this.damageKick=.16;return;}
    this.attackTime=this.time;this.attackKind=kind;
    if(kind==='spell'||kind==='ranged'){
      const color=kind==='spell'?0x80cbff:0xffd397;
      const group=new THREE.Group();group.position.copy(this.camera.position);group.position.y-=.25;
      const mesh=this.mesh(group,kind==='spell'?'ico':'cone',this.material(color,.2,.3,color),[0,0,0],kind==='spell'?[.16,.16,.16]:[.06,.45,.06],[Math.PI/2,0,0]);
      const direction=new THREE.Vector3();this.camera.getWorldDirection(direction);group.quaternion.copy(this.camera.quaternion);
      if(kind==='spell'){const glow=new THREE.Sprite(this.flameMaterial);glow.material=this.keep(this.flameMaterial.clone());glow.material.color.setHex(color);glow.scale.set(.8,.8,.8);group.add(glow);}
      this.scene.add(group);this.effects.push({group,direction,life:.65});
    }
  }
  resize(){const width=this.canvas.clientWidth||innerWidth,height=this.canvas.clientHeight||innerHeight;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.viewCamera.aspect=width/height;this.viewCamera.updateProjectionMatrix();}
  update(dt){
    this.time+=dt;const p=this.pose;
    this.motionBlend=THREE.MathUtils.lerp(this.motionBlend,p.moving?1:0,Math.min(1,dt*7));
    this.bobPhase+=dt*(p.running?12:8);const bob=Math.sin(this.bobPhase)*.025*this.motionBlend;
    const eyeHeight=p.crouch?1.02:1.67;
    this.eyeHeight=THREE.MathUtils.lerp(this.eyeHeight??eyeHeight,eyeHeight,Math.min(1,dt*10));
    this.camera.position.set(p.x*CELL,(p.elevation||0)+this.eyeHeight+bob,p.y*CELL);
    this.camera.rotation.set(p.pitch+this.damageKick,p.yaw,Math.sin(this.bobPhase*.5)*.003*this.motionBlend);
    this.damageKick*=Math.exp(-dt*9);
    this.lantern.position.copy(this.camera.position);this.lantern.position.y-=.3;
    this.headlight.position.copy(this.camera.position);
    const look=new THREE.Vector3();this.camera.getWorldDirection(look);this.headlight.target.position.copy(this.camera.position).addScaledVector(look,6);
    const blind=!!this.snapshot?.player?.blind,ease=1-Math.exp(-dt*5);
    this.lantern.intensity=THREE.MathUtils.lerp(this.lantern.intensity,blind?0:17,ease);
    this.headlight.intensity=THREE.MathUtils.lerp(this.headlight.intensity,blind?0:13,ease);
    this.scene.fog.density=THREE.MathUtils.lerp(this.scene.fog.density,blind?.9:.043,ease);
    const nearby=this.torches.filter(t=>t.point.distanceToSquared(this.camera.position)<625&&this.collision.lineClear({x:this.camera.position.x,z:this.camera.position.z},{x:t.point.x,z:t.point.z},.01)).sort((a,b)=>a.point.distanceToSquared(this.camera.position)-b.point.distanceToSquared(this.camera.position)).slice(0,7);
    const claimed=new Set(this.torchLights.map(l=>l.userData.torch).filter(t=>nearby.includes(t)));
    this.torchLights.forEach(light=>{
      let torch=light.userData.torch;
      if(!nearby.includes(torch)){
        light.intensity*=Math.exp(-dt*8);
        if(light.intensity<.08){torch=nearby.find(t=>!claimed.has(t));light.userData.torch=torch;if(torch){claimed.add(torch);light.position.copy(torch.point);}}
        else return;
      }
      if(torch){const flicker=11+Math.sin(this.time*2.1+torch.phase)*.45+Math.sin(this.time*3.7+torch.phase)*.2;light.intensity=THREE.MathUtils.lerp(light.intensity,flicker,ease);}
    });
    const localWarmth=this.torchLights.reduce((sum,l)=>sum+l.intensity/(1+l.position.distanceToSquared(this.camera.position)),0);
    this.viewLamp.intensity=THREE.MathUtils.lerp(this.viewLamp.intensity,blind?0:2.7+Math.min(1.3,localWarmth*.3),ease);
    this.viewFill.intensity=THREE.MathUtils.lerp(this.viewFill.intensity,blind?.025:.3,ease);
    this.viewScene.environmentIntensity=THREE.MathUtils.lerp(this.viewScene.environmentIntensity,blind?0:.1+Math.min(.08,localWarmth*.02),ease);
    this.scene.environmentIntensity=THREE.MathUtils.lerp(this.scene.environmentIntensity,blind?0:.055,ease);
    const dust=this.motes.material.uniforms;dust.time.value=this.time;dust.eye.value.copy(this.camera.position);dust.blind.value=blind?1:0;dust.height.value=this.canvas.height;
    this.torchLights.forEach((l,i)=>{dust.lamps.value[i].copy(l.position);dust.power.value[i]=l.intensity;});
    for(const torch of this.torches){torch.flame.scale.set(1+Math.sin(this.time*5+torch.phase)*.06,1+Math.sin(this.time*3+torch.phase)*.09,1);torch.flame.rotation.z=Math.sin(this.time*2+torch.phase)*.04;}
    for(const [key,entity] of this.monsters){
      const age=this.time-(entity.hitAt??-10),flash=Math.max(0,1-age/.3);
      const focused=key===this.focusedActor;
      for(const m of entity.flashMaterials||[]){m.color.copy(m.userData.baseColor).lerp(new THREE.Color(0xff2620),flash*.8);m.emissive.copy(focused?new THREE.Color(0x9daec8):m.userData.baseEmissive).lerp(new THREE.Color(0xd51b0a),flash);m.emissiveIntensity=(focused?Math.max(.1,m.userData.baseIntensity):m.userData.baseIntensity)*(1-flash)+flash*.95;}
      if(entity.deathAt){const t=(this.time-entity.deathAt)/.38;entity.group.scale.y=Math.max(.08,1-t*.9);if(t>=1){this.creatures.remove(entity.group);this._disposeActor(entity);this.monsters.delete(key);}continue;}

      const g=entity.group,travel=g.position.distanceTo(entity.target);g.position.lerp(entity.target,1-Math.exp(-dt*18));
      const body=g.userData.body,base=g.userData.baseScale;
      entity.walkBlend=THREE.MathUtils.lerp(entity.walkBlend||0,entity.moving?1:0,1-Math.exp(-dt*10));
      entity.stride=(entity.stride||0)+dt*(profileSpeed(entity)*7);
      const stride=entity.stride+entity.phase,walk=entity.walkBlend;
      const attackAge=this.time-(entity.attackAt??-10),attack=attackAge<.6?Math.sin(Math.PI*Math.min(1,attackAge/.6)):0;
      const cut=attackAge<.6?Math.sin(Math.PI*Math.min(1,attackAge/.38)):0;
      if(body){body.position.y=Math.sin(this.time*2.4+entity.phase)*(g.userData.hover?.12:.01)+Math.abs(Math.sin(stride))*.055*walk;
        body.rotation.x=-attack*.13;body.position.z=attack*.15;body.rotation.z=Math.sin(stride)*walk*.022;}
      const desired=entity.moving&&Number.isFinite(entity.yaw)?entity.yaw:attack?Math.atan2(this.camera.position.x-g.position.x,this.camera.position.z-g.position.z):g.rotation.y;
      g.rotation.y+=Math.atan2(Math.sin(desired-g.rotation.y),Math.cos(desired-g.rotation.y))*Math.min(1,dt*9);
      (g.userData.legs||[]).forEach((leg,i)=>leg.rotation.x=Math.sin(stride+(i%2)*Math.PI)*.6*walk);
      (g.userData.arms||[]).forEach((arm,i)=>{arm.rotation.x=-Math.sin(stride+(i%2)*Math.PI)*.38*walk+(i?-(entity.rangedAttack?1.3:2.0)*cut:-.45*attack);});
      (g.userData.wings||[]).forEach((wing,i)=>wing.rotation.z=(Math.sin(this.time*6+entity.phase)*.25+attack*.55)*(i?1:-1));
      (g.userData.swirl||[]).forEach((piece,i)=>{piece.rotation.y=this.time*.45+i;piece.position.x=Math.sin(this.time*.6+i*2.4)*(.17+Math.sin(i*.4)*.2);});
      if(g.userData.cloak)g.userData.cloak.rotation.x=Math.sin(this.time*2+entity.phase)*.035+walk*.12;
      if(g.userData.slime)body.scale.y=base.y*(1+Math.sin(this.time*2+entity.phase)*.065+attack*.18);

    }
    for(const feature of this.features){
      const t=this.time,phase=feature.phase||0,g=feature.group;
      if(feature.type==='fountain'){
        feature.droplets.forEach((drop,i)=>{const fall=(t*1.6+phase+i/5)%1;drop.position.set(Math.sin(i*4.1)*.055,.95-.50*fall*fall,.18+.20*fall);});
        feature.ripples.forEach((ripple,i)=>{const age=(t*.65+phase+i/3)%1;ripple.group.scale.setScalar(.035+age*.31);ripple.material.opacity=(1-age)*.22;});
      }
      else if(feature.type==='hanging')g.rotation.z=Math.sin(t*.61+phase)*feature.amplitude+Math.sin(t*1.1+phase)*feature.amplitude*.2;
      else if(feature.type==='trickle'){g.position.y=2.65-((t*.36+feature.index*.31+phase)%1)*2.58;g.visible=g.position.y>.07;}
      else if(feature.type==='wisp'){const a=t*.18+phase+feature.index*1.57;g.position.set(Math.sin(a)*.23,1.62+Math.cos(a*.7)*.31,.25+Math.cos(a)*.08);}
      else if(feature.type==='rune')feature.material.emissiveIntensity=.24+Math.sin(t*.55)*.09;
    }
    const swing=swingPose(this.time-this.attackTime,this.weaponName||'sword');
    this.rightHand.position.set(swing[0]+Math.sin(this.bobPhase*.5)*.012*this.motionBlend,swing[1]+bob,swing[2]);
    this.rightHand.rotation.set(swing[3],swing[4],swing[5]);
    this.guardBlend=THREE.MathUtils.lerp(this.guardBlend||0,this.guarding?1:0,1-Math.exp(-dt*16));
    const guard=this.guardBlend;
    if(!this.hasShield){this.rightHand.position.lerp(new THREE.Vector3(.1,-.28,-.85),guard);this.rightHand.rotation.x=THREE.MathUtils.lerp(this.rightHand.rotation.x,-.15,guard);this.rightHand.rotation.z=THREE.MathUtils.lerp(this.rightHand.rotation.z,1.15,guard);}
    this.leftHand.position.set(this.guarding?-.15:-.49,this.guarding?-.17:(this.hasShield?-.59:-.7)+bob,-.95);
    this.leftHand.position.set(-.49+guard*.34,-.59+guard*.42+bob,-.95);this.leftHand.rotation.set(.1,.15-guard*.4,-.12+guard*.12);
    for(let i=this.effects.length-1;i>=0;i--){const e=this.effects[i];e.life-=dt;e.group.position.addScaledVector(e.direction,dt*16);if(e.life<=0){this.scene.remove(e.group);this.effects.splice(i,1);}}
    this.mapBlend=THREE.MathUtils.lerp(this.mapBlend||0,this.mapHeld?1:0,1-Math.exp(-dt*10));
    this.rightHand.visible=this.mapBlend<.5;this.leftHand.visible=this.hasShield&&this.mapBlend<.5;
    if(this.parchment){const m=this.parchment.mesh,down=THREE.MathUtils.clamp(-p.pitch,0,1);m.visible=this.mapBlend>.01;
      m.position.set(Math.sin(this.bobPhase*.5)*.008,-.83+down*.58-(1-this.mapBlend)*.8+bob*.5,-1.22);
      m.rotation.set(-.8+down*.55,Math.sin(this.time*.7)*.008,Math.sin(this.time*.45)*.006);
    }
    this.renderer.clear();this.renderer.render(this.scene,this.camera);
    if(this.snapshot?.levelId!=='title'){this.renderer.clearDepth();this.renderer.render(this.viewScene,this.viewCamera);}
  }
  dispose(){for(const resource of this.resources)resource.dispose?.();this.world.traverse(o=>{if(o.isInstancedMesh)o.dispose();});this.renderer.dispose();}
}
