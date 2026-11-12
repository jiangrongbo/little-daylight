'use strict';

const Daylight = (() => {
  const tilt = 23.44 * Math.PI / 180;
  const latitude = 39.9 * Math.PI / 180;
  const axis = [Math.sin(tilt), Math.cos(tilt), 0];
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  function sample(phase, rotation) {
    const sun = [Math.cos(phase), 0, -Math.sin(phase)];
    const sinDeclination = dot(axis, sun);
    const raw = sun.map((v, i) => v - sinDeclination * axis[i]);
    const length = Math.hypot(...raw);
    const noon = raw.map(v => v / length);
    const tangent = cross(axis, noon);
    const beijing = axis.map((v, i) => Math.sin(latitude) * v + Math.cos(latitude) * (noon[i] * Math.cos(rotation) + tangent[i] * Math.sin(rotation)));
    const limit = Math.max(-1, Math.min(1, -Math.tan(latitude) * Math.tan(Math.asin(sinDeclination))));
    return {
      hours: 24 / Math.PI * Math.acos(limit),
      noonAngle: Math.atan2(-noon[2], dot(noon, [axis[1], -axis[0], 0])),
      sun, axis: [...axis], beijing,
      isDay: dot(beijing, sun) >= 0,
      isFront: beijing[2] >= 0
    };
  }

  return {sample};
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Daylight;
