'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const TAU = Math.PI * 2;
  const state = {phase: 0, rotation: -0.65, orbitPlaying: false, spinPlaying: !matchMedia('(prefers-reduced-motion: reduce)').matches};
  const svgNS = 'http://www.w3.org/2000/svg';
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  // An elevated camera makes the daily path an ellipse instead of an edge-on line.
  const cameraAngle = Math.PI / 6;
  const turn = (v, angle) => [v[0], v[1] * Math.cos(angle) - v[2] * Math.sin(angle), v[1] * Math.sin(angle) + v[2] * Math.cos(angle)];
  const view = v => turn(v, cameraAngle);
  const project = v => { const p = view(v); return [250 + 123 * p[0], 185 - 123 * p[1]]; };
  const point = v => project(v).map(n => n.toFixed(2)).join(',');
  const normalize = value => ((value % TAU) + TAU) % TAU;
  const mesh = [];
  const latitude = [];

  function element(tag, attributes, parent) {
    const node = document.createElementNS(svgNS, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    parent.appendChild(node);
    return node;
  }

  // Fixed observer-facing patches keep the light calculation on the actual sphere.
  const vector = (lat, lon) => turn([Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)], -cameraAngle);
  for (let row = 0; row < 28; row++) {
    const bottom = -Math.PI / 2 + row * Math.PI / 28;
    const top = bottom + Math.PI / 28;
    for (let col = 0; col < 52; col++) {
      const left = -Math.PI / 2 + col * Math.PI / 52;
      const right = left + Math.PI / 52;
      const vertices = [vector(bottom, left), vector(top, left), vector(top, right), vector(bottom, right)];
      const node = element('path', {d: `M${vertices.map(point).join('L')}Z`, 'stroke-width': 0.6}, $('sphere-mesh'));
      mesh.push({node, normal: vector((bottom + top) / 2, (left + right) / 2)});
    }
  }
  for (let i = 0; i < 144; i++) latitude.push(element('path', {}, $('latitude')));
  for (let i = 0; i < 3; i++) element('path', {}, $('light-rays'));

  const axis = Daylight.sample(0, 0).axis;
  const axisEnd = axis.map(v => v * 1.25);
  const axisStart = axisEnd.map(v => -v);
  $('globe-axis').setAttribute('d', `M${point(axisStart)}L${point(axisEnd)}`);
  const north = project(axisEnd);
  $('north-label').setAttribute('x', north[0] + 7);
  $('north-label').setAttribute('y', north[1] - 6);

  const equatorBasis = [axis[1], -axis[0], 0];
  for (let i = 0; i < 90; i++) {
    const v = angle => equatorBasis.map((n, k) => n * Math.cos(angle) + [0, 0, 1][k] * Math.sin(angle));
    const a = v(i * TAU / 90);
    const b = v((i + 1) * TAU / 90);
    element('path', {d: `M${point(a)}L${point(b)}`, 'stroke-dasharray': (view(a)[2] < 0 ? '2 4' : '')}, $('equator'));
  }

  let lastPhase = null;
  let previous = null;
  let frameId = null;
  let activePointer = null;
  let space = null;
  let spaceVisible = false;

  function seasonAt(phase) {
    const marks = ['夏至', '秋分', '冬至', '春分'];
    const nearest = Math.round(phase / (Math.PI / 2)) % 4;
    const delta = Math.abs(Math.atan2(Math.sin(phase - nearest * Math.PI / 2), Math.cos(phase - nearest * Math.PI / 2)));
    return delta < 0.025 ? marks[nearest] : ['夏天', '秋天', '冬天', '春天'][Math.floor(phase / (Math.PI / 2)) % 4];
  }

  const timeLabel = minutes => `约 ${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}`;

  function renderSeason(sample) {
    const earthX = 300 - sample.sun[0] * 160;
    const earthY = 220 - sample.sun[2] * 160;
    $('earth-handle').setAttribute('transform', `translate(${earthX},${earthY})`);
    $('sun-connection').setAttribute('d', `M${300 - sample.sun[0] * 58},${220 - sample.sun[2] * 58}L${earthX},${earthY}`);
    const degrees = state.phase * 180 / Math.PI;
    $('year-position').value = degrees;
    const season = seasonAt(state.phase);
    $('year-position').setAttribute('aria-valuetext', `${season}，北京白天${timeLabel(Math.round(sample.hours * 60))}`);
    $('season-name').textContent = season;
    const summer = Math.abs(sample.hours - Daylight.sample(0, 0).hours) < 0.004;
    const winter = Math.abs(sample.hours - Daylight.sample(Math.PI, 0).hours) < 0.004;
    for (const [id, selected] of [['summer', summer], ['winter', winter]]) {
      $(id).classList.toggle('active', selected);
      $(id).setAttribute('aria-pressed', String(selected));
    }
    const dayMinutes = Math.round(sample.hours * 60);
    $('day-hours').textContent = timeLabel(dayMinutes);
    $('night-hours').textContent = timeLabel(1440 - dayMinutes);
    $('day-bar').style.width = `${sample.hours / 24 * 100}%`;
    $('length-bar').setAttribute('aria-label', `北京一天24小时，白天${timeLabel(dayMinutes)}，黑夜${timeLabel(1440 - dayMinutes)}`);

    const balanced = Math.abs(sample.hours - 12) < 0.2;
    const longer = sample.hours > 12;
    $('discovery-heading').textContent = balanced ? '发现啦！这时候，白天黑夜差不多长。' : `发现啦！${longer ? '夏半年' : '冬半年'}，北京在亮处待得${longer ? '更久' : '更短'}。`;
    $('explanation').textContent = balanced ? '太阳直照赤道附近，北京转一圈，经过亮处和暗处的时间差不多。' : `北半球${longer ? '朝向' : '背向'}太阳倾斜，北京转一圈，经过白天的时间就${longer ? '更长' : '更短'}。`;
    $('discovery-tag').textContent = balanced ? '白天黑夜 · 差不多长' : (longer ? '白天长 · 黑夜短' : '白天短 · 黑夜长');

    const sunlight = view(sample.sun);
    const directionX = sunlight[0];
    const depth = sunlight[2];
    $('light-direction').textContent = Math.abs(directionX) < 0.18 ? `阳光从${depth > 0 ? '前方' : '后方'}照来` : `阳光从${directionX > 0 ? '右' : '左'}${Math.abs(depth) > 0.3 ? (depth > 0 ? '前' : '后') : '侧'}照来`;
    const projectedLength = Math.hypot(sunlight[0], sunlight[1]);
    $('light-rays').setAttribute('visibility', projectedLength < 0.18 ? 'hidden' : 'visible');
    [...$('light-rays').children].forEach((node, i) => {
      const dx = sunlight[0] / projectedLength;
      const dy = -sunlight[1] / projectedLength;
      const offset = (i - 1) * 20;
      node.setAttribute('d', `M${250 + dx * 223 - dy * offset},${185 + dy * 223 + dx * offset}L${250 + dx * 157 - dy * offset},${185 + dy * 157 + dx * offset}`);
    });
    for (let i = 0; i < latitude.length; i++) {
      const a = Daylight.sample(state.phase, i * TAU / latitude.length);
      const b = Daylight.sample(state.phase, (i + 1) * TAU / latitude.length);
      latitude[i].setAttribute('d', `M${point(a.beijing)}L${point(b.beijing)}`);
      latitude[i].setAttribute('stroke', a.isDay ? '#ffdb69' : '#77b9e1');
      const isFront = view(a.beijing)[2] >= 0;
      latitude[i].setAttribute('stroke-dasharray', isFront ? '' : '2 4');
      latitude[i].setAttribute('opacity', isFront ? '1' : '.65');
    }
  }

  // shortcut: land is illustrative, use geographic data only if teaching geography.
  function isLand(lat, lon) {
    const ellipse = (x, y, rx, ry) => {
      const distance = Math.atan2(Math.sin(lon - x), Math.cos(lon - x));
      return (distance / rx) ** 2 + ((lat - y) / ry) ** 2 < 1;
    };
    return ellipse(-0.15, 0.85, 0.95, 0.4) || ellipse(-0.65, 0.25, 0.4, 0.65) || ellipse(0.7, 0.5, 0.55, 0.25) || ellipse(1, -0.5, 0.35, 0.25) || ellipse(-2.1, 0.8, 0.45, 0.55) || ellipse(-1.8, -0.2, 0.28, 0.65);
  }

  function render() {
    const sample = Daylight.sample(state.phase, state.rotation);
    if (lastPhase !== state.phase) {
      renderSeason(sample);
      lastPhase = state.phase;
    }
    const noonPoint = Daylight.sample(state.phase, 0).beijing;
    const latitudeRadians = 39.9 * Math.PI / 180;
    const noon = noonPoint.map((v, i) => (v - Math.sin(latitudeRadians) * axis[i]) / Math.cos(latitudeRadians));
    const tangent = [axis[1] * noon[2], -axis[0] * noon[2], axis[0] * noon[1] - axis[1] * noon[0]];
    for (const patch of mesh) {
      const n = patch.normal;
      const light = Math.max(0, Math.min(1, dot(n, sample.sun) * 5 + 0.45));
      const lat = Math.asin(Math.max(-1, Math.min(1, dot(n, axis))));
      const lon = Math.atan2(dot(n, tangent), dot(n, noon)) - state.rotation;
      const land = isLand(lat, lon);
      const dark = land ? [39, 82, 77] : [30, 64, 87];
      const bright = land ? [151, 192, 126] : [101, 177, 194];
      const color = `rgb(${dark.map((v, i) => Math.round(v + (bright[i] - v) * light)).join(',')})`;
      if (patch.node.getAttribute('fill') !== color) {
        patch.node.setAttribute('fill', color);
        patch.node.setAttribute('stroke', color);
      }
    }
    const marker = $('beijing-marker');
    const isFront = view(sample.beijing)[2] >= 0;
    marker.setAttribute('transform', `translate(${point(sample.beijing)})`);
    marker.setAttribute('opacity', isFront ? '1' : '.55');
    marker.setAttribute('stroke-dasharray', isFront ? '' : '2 2');
    $('beijing-label').textContent = isFront ? '北京' : '北京（背面）';
    // Keep the annotation inside the figure when Beijing is near its right edge.
    $('beijing-label').setAttribute('x', sample.beijing[0] > 0.65 ? '-12' : '12');
    $('beijing-label').setAttribute('text-anchor', sample.beijing[0] > 0.65 ? 'end' : 'start');
    $('day-state').textContent = sample.isDay ? '☀ 北京正在过白天' : '☾ 北京正在过黑夜';
    $('day-state').classList.toggle('night', !sample.isDay);
    $('orbit-play').textContent = state.orbitPlaying ? 'Ⅱ 暂停旅行' : '▶ 自动旅行';
    $('orbit-play').setAttribute('aria-pressed', String(state.orbitPlaying));
    $('spin-play').textContent = state.spinPlaying ? 'Ⅱ 暂停自转' : '▶ 看地球自转';
    $('spin-play').setAttribute('aria-pressed', String(state.spinPlaying));
    if (space && spaceVisible) space.update(state);
  }

  function schedule() {
    if (frameId === null && (state.orbitPlaying || state.spinPlaying)) frameId = requestAnimationFrame(animate);
  }

  function animate(now) {
    frameId = null;
    const dt = previous === null ? 0 : Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (state.orbitPlaying) movePhase(state.phase + dt * TAU / 60);
    if (state.spinPlaying) state.rotation = normalize(state.rotation + dt * TAU / 10);
    render();
    schedule();
    if (!state.orbitPlaying && !state.spinPlaying) previous = null;
  }

  function movePhase(value) {
    const next = normalize(value);
    // Keep rotation in space independent of the solar-noon reference moving with orbit.
    state.rotation = normalize(state.rotation + Daylight.sample(state.phase, 0).noonAngle - Daylight.sample(next, 0).noonAngle);
    state.phase = next;
  }

  function setPhase(value) {
    if (!Number.isFinite(value)) return;
    movePhase(value);
    state.orbitPlaying = false;
    render();
  }

  $('summer').addEventListener('click', () => setPhase(0));
  $('winter').addEventListener('click', () => setPhase(Math.PI));
  $('year-position').addEventListener('input', event => setPhase(Number(event.target.value) * Math.PI / 180));
  for (const [id, key] of [['orbit-play', 'orbitPlaying'], ['spin-play', 'spinPlaying']]) {
    $(id).addEventListener('click', () => {
      state[key] = !state[key];
      previous = null;
      render();
      schedule();
    });
  }

  const handle = $('earth-handle');
  const orbit = $('orbit');
  function movePointer(event) {
    if (activePointer !== event.pointerId) return;
    const matrix = orbit.getScreenCTM();
    if (!matrix) return;
    const location = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const dx = location.x - 300;
    const dy = location.y - 220;
    if (Math.hypot(dx, dy) > 8) setPhase(Math.atan2(dy, -dx));
  }
  handle.addEventListener('pointerdown', event => {
    if (activePointer !== null || !event.isPrimary || event.button !== 0) return;
    activePointer = event.pointerId;
    state.orbitPlaying = false;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('dragging');
    render();
    event.preventDefault();
  });
  handle.addEventListener('pointermove', movePointer);
  function endPointer(event) {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    handle.classList.remove('dragging');
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  }
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => handle.addEventListener(type, endPointer));
  function switchView(showSpace) {
    spaceVisible = showSpace;
    $('diagram-view').hidden = showSpace;
    $('space-view').hidden = !showSpace;
    $('exploration').classList.toggle('space-mode', showSpace);
    $('orbit-view-label').textContent = showSpace ? '可转动的三维模型' : '从轨道上方看';
    for (const [id, selected] of [['view-diagram', !showSpace], ['view-space', showSpace]]) {
      $(id).setAttribute('aria-pressed', String(selected));
      $(id).classList.toggle('selected', selected);
    }
    if (showSpace && !space) {
      space = SpaceView.create({
        canvas: $('space-canvas'), hud: $('space-hud'), status: $('space-status'), onPhaseChange: setPhase,
        labels: {sun: $('space-sun-label'), earth: $('space-earth-anchor'), north: $('space-north-label'), beijing: $('space-beijing-label'), seasons: [...document.querySelectorAll('.space-season')]}
      });
    }
    if (space) {
      space.update(state);
      space.setVisible(showSpace);
    }
  }
  $('view-diagram').addEventListener('click', () => switchView(false));
  $('view-space').addEventListener('click', () => switchView(true));
  document.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => space?.moveCamera(button.dataset.camera)));
  document.addEventListener('visibilitychange', () => { previous = null; });
  render();
  schedule();
})();
