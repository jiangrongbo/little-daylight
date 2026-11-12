const assert = require('node:assert/strict');
const D = require('../daylight.js');
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`);
near(D.sample(0, 0).hours, 14.82, 0.04);
near(D.sample(Math.PI, 0).hours, 9.18, 0.04);
near(D.sample(Math.PI / 2, 0).hours, 12);
near(D.sample(3 * Math.PI / 2, 0).hours, 12);
for (let i = 0; i < 360; i++) {
  const phase = i * Math.PI / 180;
  const s = D.sample(phase, 0);
  assert.ok(Number.isFinite(s.hours) && s.hours > 0 && s.hours < 24);
  near(s.hours + D.sample(phase + Math.PI, 0).hours, 24);
  near(s.hours, D.sample(phase + 2 * Math.PI, 0).hours);
  assert.deepEqual(s.axis, D.sample(0, 0).axis);
  assert.equal(s.isDay, true);
  assert.equal(D.sample(phase, Math.PI).isDay, false);
  let lit = 0;
  for (let j = 0; j < 720; j++) {
    const p = D.sample(phase, j * 2 * Math.PI / 720);
    const dot = p.beijing.reduce((sum, v, k) => sum + v * p.sun[k], 0);
    assert.equal(p.isDay, dot >= 0);
    assert.equal(p.isFront, p.beijing[2] >= 0);
    near(Math.hypot(...p.beijing), 1);
    if (p.isDay) lit++;
  }
  near(lit / 720 * 24, s.hours, 0.07);
}
// Orbit and self-rotation must both be prograde about Earth's north axis.
const r0 = D.sample(0, 0).sun.map(v => -v);
const r1 = D.sample(0.001, 0).sun.map(v => -v);
const velocity = r1.map((v, i) => v - r0[i]);
const momentum = [r0[1]*velocity[2]-r0[2]*velocity[1], r0[2]*velocity[0]-r0[0]*velocity[2], r0[0]*velocity[1]-r0[1]*velocity[0]];
assert.ok(momentum.reduce((sum, v, i) => sum + v * D.sample(0, 0).axis[i], 0) > 0, 'Orbit must follow the north axis, like self-rotation');
const fixedPoint = D.sample(0, 0.4).beijing;
for (let degree=0;degree<360;degree+=5) {
  const phase=degree*Math.PI/180;
  const solarAngle=D.sample(phase,0).noonAngle;
  const point=D.sample(phase,0.4-solarAngle).beijing;
  point.forEach((v,i)=>near(v,fixedPoint[i]));
}
console.log('PASS: 360 seasonal positions × 720 daily positions; solstices, equinoxes, axis, lighting and periodicity');
