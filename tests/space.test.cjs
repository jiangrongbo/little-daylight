'use strict';
const assert = require('node:assert/strict');
const S = require('../space.js');
const D = require('../daylight.js');
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const camera = {yaw: 0.45, pitch: 0.6, distance: 13};
for (let degree = 0; degree < 360; degree += 5) {
  const phase = degree * Math.PI / 180;
  const sample = D.sample(phase, 0.8);
  const world = sample.sun.map(v => -v * S.ORBIT_RADIUS);
  const screen = S.project(world, camera, 900, 500);
  assert.ok(screen && Number.isFinite(screen.x) && Number.isFinite(screen.y));
  const ray = S.ray(screen.x, screen.y, camera, 900, 500);
  const plane = S.orbitHit(ray);
  assert.ok(plane);
  world.forEach((v, i) => near(plane[i], v));
  const recovered = S.phaseAt(plane);
  near(Math.cos(recovered), Math.cos(phase));
  near(Math.sin(recovered), Math.sin(phase));
  const direction = world.map((v, i) => v - ray.origin[i]);
  const length = Math.hypot(...direction);
  assert.ok(S.sphereHit({origin:ray.origin, direction:direction.map(v=>v/length)}, world, S.EARTH_RADIUS));
}
assert.equal(S.orbitHit({origin:[0,1,0], direction:[1,0,0]}), null);
assert.equal(S.orbitHit({origin:[0,1,0], direction:[0,1,0]}), null);
assert.equal(S.sphereHit({origin:[0,0,4], direction:[0,0,1]}, [0,0,0], 1), null);
for (const [width,height] of [[740,440],[324,360],[254,360]]) {
  const fitted=S.defaultCamera(width,height);
  for(let degree=0;degree<360;degree+=5) {
    const sample=D.sample(degree*Math.PI/180,0);
    const earth=sample.sun.map(v=>-v*S.ORBIT_RADIUS);
    for(const offset of [[0,0,0],sample.axis.map(v=>v*1.2),sample.axis.map(v=>-v*1.2),[S.EARTH_RADIUS,0,0],[-S.EARTH_RADIUS,0,0]]) {
      const p=S.project(earth.map((v,i)=>v+offset[i]),fitted,width,height);
      assert.ok(p && p.x>10 && p.x<width-10 && p.y>10 && p.y<height-10,'Default camera must keep Earth and its axis in frame');
    }
  }
}
console.log('PASS: 3D camera projection, screen rays, orbit dragging and sphere picking at 72 orbital positions');
