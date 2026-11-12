'use strict';

const SpaceView = (() => {
  const ORBIT_RADIUS = 4.4;
  const EARTH_RADIUS = 0.66;
  const SUN_RADIUS = 0.85;
  const TAN_FOV = Math.tan(25 * Math.PI / 180);
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const scale = (v, n) => v.map(x => x * n);
  const unit = v => scale(v, 1 / Math.hypot(...v));
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

  function basis(camera) {
    const origin = scale([Math.cos(camera.pitch)*Math.sin(camera.yaw), Math.sin(camera.pitch), Math.cos(camera.pitch)*Math.cos(camera.yaw)], camera.distance);
    const forward = unit(scale(origin, -1));
    const right = unit(cross(forward, [0, 1, 0]));
    return {origin, forward, right, up: cross(right, forward)};
  }

  function project(world, camera, width, height) {
    const b = basis(camera);
    const delta = add(world, scale(b.origin, -1));
    const depth = dot(delta, b.forward);
    if (depth <= 0) return null;
    const focal = height / (2 * TAN_FOV);
    return {x: width / 2 + dot(delta, b.right) * focal / depth, y: height / 2 - dot(delta, b.up) * focal / depth, depth};
  }

  function ray(x, y, camera, width, height) {
    const b = basis(camera);
    const focal = height / (2 * TAN_FOV);
    return {origin: b.origin, direction: unit(add(add(b.forward, scale(b.right, (x - width/2)/focal)), scale(b.up, (height/2 - y)/focal)))};
  }

  function orbitHit(r) {
    if (Math.abs(r.direction[1]) < 1e-7) return null;
    const t = -r.origin[1] / r.direction[1];
    return t > 0 ? add(r.origin, scale(r.direction, t)) : null;
  }

  function sphereHit(r, center, radius) {
    const delta = add(r.origin, scale(center, -1));
    const b = dot(delta, r.direction);
    const discriminant = b*b - dot(delta, delta) + radius*radius;
    if (discriminant < 0) return null;
    const near = -b - Math.sqrt(discriminant);
    const far = -b + Math.sqrt(discriminant);
    return near > 0 ? near : (far > 0 ? far : null);
  }

  const phaseAt = position => Math.atan2(position[2], -position[0]);
  const defaultCamera = (width, height) => ({yaw: 0.45, pitch: 0.6, distance: Math.max(13, 14.5 * height / Math.max(1, width))});

  const vertexSource = `
    attribute vec2 position;
    void main() { gl_Position = vec4(position, 0.0, 1.0); }
  `;
  const fragmentSource = `
    precision highp float;
    uniform vec2 resolution;
    uniform vec3 eye, forward, right, up, earth, axis, noon, tangent, beijing;
    uniform float rotation;
    float sphere(vec3 ro, vec3 rd, vec3 center, float radius) {
      vec3 v=ro-center; float b=dot(v,rd); float h=b*b-dot(v,v)+radius*radius;
      if(h<0.0) return 10000.0;
      float t=-b-sqrt(h); if(t>0.0) return t;
      t=-b+sqrt(h); return t>0.0 ? t : 10000.0;
    }
    float ellipse(float lon, float lat, vec4 area) {
      float dx=atan(sin(lon-area.x),cos(lon-area.x));
      vec2 p=vec2(dx,lat-area.y)/area.zw;
      return 1.0-smoothstep(0.95,1.05,dot(p,p));
    }
    void main() {
      vec2 uv=(gl_FragCoord.xy-resolution*0.5)/resolution.y*${2 * TAN_FOV};
      vec3 rd=normalize(forward+right*uv.x+up*uv.y);
      float vignette=clamp(length(uv)*0.45,0.0,0.65);
      vec3 color=mix(vec3(0.075,0.14,0.19),vec3(0.025,0.065,0.11),vignette);
      vec2 starCell=floor(gl_FragCoord.xy/5.0);
      float star=fract(sin(dot(starCell,vec2(127.1,311.7)))*43758.5453);
      vec2 starPixel=fract(gl_FragCoord.xy/5.0)-0.5;
      color+=vec3(0.34,0.40,0.42)*step(0.997,star)*(1.0-smoothstep(0.05,0.3,length(starPixel)));
      float closest=10000.0;
      if(abs(rd.y)>0.00001) {
        float plane=-eye.y/rd.y;
        if(plane>0.0) {
          vec3 p=eye+rd*plane;
          float distanceToRing=abs(length(p.xz)-${ORBIT_RADIUS.toFixed(2)});
          float ring=1.0-smoothstep(0.014,0.032,distanceToRing);
          if(ring>0.0) { color=mix(color,vec3(0.32,0.49,0.47),ring*0.8); closest=plane; }
        }
      }
      float t=sphere(eye,rd,vec3(0.0),${SUN_RADIUS.toFixed(2)});
      if(t<closest) {
        vec3 n=normalize(eye+rd*t);
        float edge=pow(max(0.0,dot(n,-rd)),0.5);
        color=mix(vec3(1.0,0.47,0.13),vec3(1.0,0.86,0.43),edge);
        closest=t;
      }
      t=sphere(eye,rd,earth,${EARTH_RADIUS.toFixed(2)});
      if(t<closest) {
        vec3 n=normalize(eye+rd*t-earth);
        float lat=asin(clamp(dot(n,axis),-1.0,1.0));
        float lon=atan(dot(n,tangent),dot(n,noon))-rotation;
        float land=max(max(ellipse(lon,lat,vec4(-0.15,0.85,0.95,0.4)),ellipse(lon,lat,vec4(-0.65,0.25,0.4,0.65))),max(ellipse(lon,lat,vec4(0.7,0.5,0.55,0.25)),ellipse(lon,lat,vec4(1.0,-0.5,0.35,0.25))));
        land=max(land,max(ellipse(lon,lat,vec4(-2.1,0.8,0.45,0.55)),ellipse(lon,lat,vec4(-1.8,-0.2,0.28,0.65))));
        vec3 surface=mix(vec3(0.22,0.55,0.72),vec3(0.55,0.73,0.39),land);
        surface=mix(surface,vec3(0.81,0.87,0.85),smoothstep(1.23,1.38,abs(lat)));
        // Sunlight is parallel at the planet, as in the shared daylight model.
        float incidence=dot(n,normalize(-earth));
        float daylight=smoothstep(-0.012,0.012,incidence);
        color=surface*(0.16+daylight*(0.48+0.36*sqrt(max(0.0,incidence))));
        color+=vec3(0.08,0.25,0.34)*pow(1.0-max(0.0,dot(n,-rd)),3.0)*0.65;
        float latitudeLine=1.0-smoothstep(0.009,0.021,abs(lat-${(39.9*Math.PI/180).toFixed(8)}));
        color=mix(color,mix(vec3(0.30,0.59,0.78),vec3(1.0,0.84,0.37),daylight),latitudeLine*0.92);
        closest=t;
      }
      t=sphere(eye,rd,beijing,0.058);
      if(t<closest) { color=vec3(1.0,0.94,0.65); closest=t; }
      if(closest>9999.0) {
        float toSun=dot(-eye,rd);
        if(toSun>0.0) {
          float distanceToSun=length(eye+rd*toSun);
          color+=vec3(0.27,0.13,0.025)*exp(-distanceToSun*distanceToSun/2.4);
        }
      }
      gl_FragColor=vec4(color,1.0);
    }
  `;

  function create({canvas, hud, labels, status, onPhaseChange}) {
    const defaults = defaultCamera(canvas.clientWidth, canvas.clientHeight);
    const camera = {...defaults};
    let lastFit = defaults.distance;
    let current = {phase: 0, rotation: -0.65};
    let visible = false;
    let lost = false;
    let gl;
    let program;
    let uniforms;
    const pointers = new Map();
    let gesture = null;
    const context = hud.getContext('2d');

    function initialize() {
      gl = canvas.getContext('webgl', {antialias: false, alpha: false, preserveDrawingBuffer: true});
      if (!gl) throw new Error('这台设备暂不支持 WebGL，请使用讲解示意图。');
      const shaders = [];
      try {
        for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
          const shader = gl.createShader(type);
          shaders.push(shader);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('3D 光照无法启动，请使用讲解示意图。');
        }
        program = gl.createProgram();
        shaders.forEach(shader => gl.attachShader(program, shader));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('3D 画面无法启动，请使用讲解示意图。');
      } finally {
        shaders.forEach(shader => gl.deleteShader(shader));
      }
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const attribute = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(['resolution','eye','forward','right','up','earth','axis','noon','tangent','beijing','rotation'].map(name => [name, gl.getUniformLocation(program, name)]));
      status.hidden = true;
      lost = false;
    }

    function report(error) {
      status.textContent = error.message;
      status.hidden = false;
      lost = true;
    }
    try { initialize(); } catch (error) { report(error); }

    function place(node, world, width, height, show = true) {
      const p = project(world, camera, width, height);
      node.hidden = !show || !p || p.x < -20 || p.y < -20 || p.x > width+20 || p.y > height+20;
      if (p) { node.style.left = `${p.x}px`; node.style.top = `${p.y}px`; }
      return p;
    }

    function render() {
      if (!visible || lost) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const fit = defaultCamera(width, height).distance;
      if (fit !== lastFit) {
        camera.distance *= fit / lastFit;
        lastFit = fit;
      }
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(width*dpr), pixelHeight = Math.round(height*dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = hud.width = pixelWidth;
        canvas.height = hud.height = pixelHeight;
      }
      const sample = Daylight.sample(current.phase, current.rotation);
      const b = basis(camera);
      const earth = scale(sample.sun, -ORBIT_RADIUS);
      const beijing = add(earth, scale(sample.beijing, EARTH_RADIUS*1.015));
      const latitude = 39.9*Math.PI/180;
      const noon = Daylight.sample(current.phase, 0).beijing.map((v,i)=>(v-Math.sin(latitude)*sample.axis[i])/Math.cos(latitude));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      for (const [name, value] of Object.entries({eye:b.origin, forward:b.forward, right:b.right, up:b.up, earth, axis:sample.axis, noon, tangent:cross(sample.axis,noon), beijing})) gl.uniform3fv(uniforms[name], value);
      gl.uniform1f(uniforms.rotation, current.rotation);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      context.setTransform(dpr,0,0,dpr,0,0);
      context.clearRect(0,0,width,height);
      const axisStart = project(add(earth,scale(sample.axis,-1.08)),camera,width,height);
      const axisEnd = project(add(earth,scale(sample.axis,1.08)),camera,width,height);
      if (axisStart && axisEnd) {
        context.beginPath(); context.moveTo(axisStart.x,axisStart.y); context.lineTo(axisEnd.x,axisEnd.y);
        context.strokeStyle='#e4b58c'; context.lineWidth=1.5; context.setLineDash([4,4]); context.stroke(); context.setLineDash([]);
      }
      const lightStart = project(scale(sample.sun,-SUN_RADIUS*1.2),camera,width,height);
      const lightEnd = project(add(earth,scale(sample.sun,EARTH_RADIUS*1.3)),camera,width,height);
      if (lightStart && lightEnd) {
        context.beginPath(); context.moveTo(lightStart.x,lightStart.y); context.lineTo(lightEnd.x,lightEnd.y);
        context.strokeStyle='rgba(240,198,92,.4)'; context.lineWidth=1; context.setLineDash([3,7]); context.stroke(); context.setLineDash([]);
      }
      place(labels.sun,[0,-1.1,0],width,height);
      place(labels.earth,earth,width,height);
      place(labels.north,add(earth,scale(sample.axis,1.2)),width,height);
      const toCamera = add(b.origin,scale(beijing,-1));
      const markerRay = {origin:b.origin,direction:unit(add(beijing,scale(b.origin,-1)))};
      const sunObstruction = sphereHit(markerRay,[0,0,0],SUN_RADIUS);
      const markerDistance = Math.hypot(...toCamera);
      place(labels.beijing,beijing,width,height,dot(sample.beijing,toCamera)>0 && (sunObstruction===null || sunObstruction>markerDistance));
      labels.beijing.textContent = `北京 · ${sample.isDay ? '白天' : '黑夜'}`;
      for (let i=0;i<4;i++) {
        const phase=i*Math.PI/2;
        place(labels.seasons[i],[-ORBIT_RADIUS*Math.cos(phase),0,ORBIT_RADIUS*Math.sin(phase)],width,height);
      }
    }

    function pointerPosition(event) {
      const rect=canvas.getBoundingClientRect();
      return {x:event.clientX-rect.left,y:event.clientY-rect.top};
    }
    const pinchDistance=()=>{const [a,b]=[...pointers.values()]; return Math.hypot(a.x-b.x,a.y-b.y);};
    canvas.addEventListener('pointerdown',event=>{
      if ((event.pointerType==='mouse' && event.button!==0) || pointers.size>=2 || lost) return;
      canvas.setPointerCapture(event.pointerId);
      const p=pointerPosition(event);
      pointers.set(event.pointerId,p);
      if (pointers.size===2) gesture={kind:'pinch',distance:pinchDistance(),zoom:camera.distance};
      else {
        const earth=scale(Daylight.sample(current.phase,current.rotation).sun,-ORBIT_RADIUS);
        const r=ray(p.x,p.y,camera,canvas.clientWidth,canvas.clientHeight);
        const hit=sphereHit(r,earth,EARTH_RADIUS*1.35);
        const sunHit=sphereHit(r,[0,0,0],SUN_RADIUS);
        gesture={kind:hit!==null && (sunHit===null || hit<sunHit) ? 'earth':'camera',start:p,yaw:camera.yaw,pitch:camera.pitch};
        if (gesture.kind==='earth') onPhaseChange(current.phase);
      }
      canvas.classList.add('interacting');
      event.preventDefault();
    });
    canvas.addEventListener('pointermove',event=>{
      if (!pointers.has(event.pointerId) || !gesture) return;
      const p=pointerPosition(event); pointers.set(event.pointerId,p);
      if (gesture.kind==='pinch' && pointers.size===2) camera.distance=Math.max(8.5,Math.min(22,gesture.zoom*gesture.distance/Math.max(1,pinchDistance())));
      else if (gesture.kind==='camera') {
        camera.yaw=gesture.yaw-(p.x-gesture.start.x)*0.008;
        camera.pitch=Math.max(0.28,Math.min(1.4,gesture.pitch+(p.y-gesture.start.y)*0.007));
      } else if (gesture.kind==='earth') {
        const hit=orbitHit(ray(p.x,p.y,camera,canvas.clientWidth,canvas.clientHeight));
        if (hit && Math.hypot(hit[0],hit[2])>0.2) onPhaseChange(phaseAt(hit));
      }
      render();
    });
    function release(event) {
      if (!pointers.has(event.pointerId)) return;
      const ids=[...pointers.keys()];
      pointers.clear(); gesture=null; canvas.classList.remove('interacting');
      ids.forEach(id=>{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);});
    }
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>canvas.addEventListener(type,release));
    canvas.addEventListener('wheel',event=>{
      event.preventDefault(); camera.distance=Math.max(8.5,Math.min(22,camera.distance*Math.exp(Math.max(-100,Math.min(100,event.deltaY))*0.002))); render();
    },{passive:false});
    function moveCamera(action) {
      if(action==='reset') Object.assign(camera,defaultCamera(canvas.clientWidth,canvas.clientHeight));
      if(action==='left') camera.yaw-=0.2;
      if(action==='right') camera.yaw+=0.2;
      if(action==='up') camera.pitch=Math.min(1.4,camera.pitch+0.15);
      if(action==='down') camera.pitch=Math.max(0.28,camera.pitch-0.15);
      if(action==='in') camera.distance=Math.max(8.5,camera.distance/1.15);
      if(action==='out') camera.distance=Math.min(22,camera.distance*1.15);
      render();
    }
    canvas.addEventListener('keydown',event=>{
      const action={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down','+':'in','=':'in','-':'out',Home:'reset'}[event.key];
      if(action){event.preventDefault();moveCamera(action);}
    });
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();report(new Error('3D 画面暂时中断，恢复后会继续；也可切换到讲解示意图。'));});
    canvas.addEventListener('webglcontextrestored',()=>{try{initialize();render();}catch(error){report(error);}});
    new ResizeObserver(render).observe(canvas);
    return {
      update(value){current={phase:value.phase,rotation:value.rotation};render();},
      setVisible(value){visible=value;render();},
      moveCamera
    };
  }
  return {ORBIT_RADIUS,EARTH_RADIUS,project,ray,orbitHit,sphereHit,phaseAt,defaultCamera,create};
})();

if(typeof module!=='undefined' && module.exports) module.exports=SpaceView;
