/* Ni: the supplied GLB, neutral nickel, and pointer-driven rotation. */
(() => {
  'use strict';
  const viewer = document.getElementById('logo-viewer');
  if (!viewer) return;
  const canvas = viewer.querySelector('canvas');
  const resetButton = viewer.querySelector('.logo-reset');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const REST = {yaw: -.24, pitch: -.07};
  const INERTIA_DECAY = 1.6; // A natural glide that settles over several seconds.
  const AUTO_ROTATE_SPEED = Math.PI * 2 / 90; // One turn in 90 seconds.
  const AUTO_RESUME_DELAY = 1400;
  const state = {...REST, velocityX: 0, velocityY: 0, frame: 0, last: 0,
    autoSpeed: 0, autoResumeAt: 0,
    visible: true, ready: false, pointer: null, tween: null, width: 1, height: 1};
  let gl, resources, model;

  const vertexSource = `
    precision highp float;
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat3 uRotation;
    uniform float uAspect;
    uniform vec3 uCenter;
    uniform float uScale;
    uniform mediump float uDistance;
    varying mediump vec3 vPosition;
    varying mediump vec3 vNormal;
    void main() {
      vPosition = uRotation * ((aPosition - uCenter) * uScale);
      vNormal = uRotation * aNormal;
      vec3 p = vPosition - vec3(0.0, 0.0, uDistance);
      gl_Position = vec4(p.x * 3.7320508 / uAspect, p.y * 3.7320508,
        -1.0100503 * p.z - .201005, -p.z);
    }
  `;

  const fragmentSource = `
    precision mediump float;
    uniform vec3 uBaseColor;
    uniform float uMetallic;
    uniform float uRoughness;
    uniform mediump float uDistance;
    varying mediump vec3 vPosition;
    varying mediump vec3 vNormal;
    float softbox(vec3 ray, vec3 direction, vec2 size, float softness) {
      vec3 center = normalize(direction);
      vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), center));
      vec3 up = cross(center, right);
      float facing = dot(ray, center);
      vec2 uv = vec2(dot(ray, right), dot(ray, up)) / max(.03, facing);
      vec2 edge = vec2(1.0) - smoothstep(size, size + vec2(softness), abs(uv));
      return edge.x * edge.y * smoothstep(.05, .3, facing);
    }
    vec3 studio(vec3 ray) {
      float blur = .06 + uRoughness * .85;
      vec3 color = vec3(.055) + vec3(.16) * smoothstep(-.7, .9, ray.y);
      color += vec3(1.15) * softbox(ray, vec3(-1.0, .9, 2.5), vec2(.72, .65), blur);
      color += vec3(2.25) * softbox(ray, vec3(2.0, .15, 1.1), vec2(.15, 1.1), blur * .7);
      color += vec3(1.58) * softbox(ray, vec3(.0, 2.0, .5), vec2(1.2, .18), blur);
      color += vec3(1.15) * softbox(ray, vec3(-1.0, -.3, -1.5), vec2(.32, .9), blur);
      return color;
    }
    vec3 toneMap(vec3 x) {
      return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0.0, 1.0);
    }
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 view = normalize(vec3(0.0, 0.0, uDistance) - vPosition);
      vec3 reflection = reflect(-view, normal);
      vec3 silver = mix(vec3(.04), uBaseColor, uMetallic);
      float facing = clamp(dot(normal, view), 0.0, 1.0);
      vec3 fresnel = silver + (vec3(1.0) - silver) * pow(1.0 - facing, 5.0);
      vec3 light = normalize(vec3(-1.0, 1.4, 2.0));
      vec3 halfway = normalize(light + view);
      float highlight = pow(max(dot(normal, halfway), 0.0), mix(256.0, 8.0, uRoughness)) * .15;
      vec3 diffuse = uBaseColor * (1.0 - uMetallic) * max(dot(normal, light), 0.0);
      vec3 color = studio(reflection) * fresnel + silver * .04 + diffuse + highlight;
      gl_FragColor = vec4(pow(toneMap(color), vec3(1.0 / 2.2)), 1.0);
    }
  `;

  function rotation(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    return new Float32Array([cy, 0, -sy, sy*sx, cx, cy*sx, sy*cx, -sx, cy*cx]);
  }

  // Read the supplied self-contained GLB directly. Its positions, normals, triangle
  // indices and material remain intact; centering and sizing happen in the shader.
  function readModel(buffer) {
    const header = new DataView(buffer);
    if (buffer.byteLength < 20 || header.getUint32(0, true) !== 0x46546c67 ||
        header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== buffer.byteLength) {
      throw new Error('Invalid GLB');
    }
    let document, binaryOffset, binaryLength;
    for (let offset = 12; offset < buffer.byteLength;) {
      if (offset + 8 > buffer.byteLength) throw new Error('Incomplete GLB chunk');
      const length = header.getUint32(offset, true), type = header.getUint32(offset + 4, true);
      if (offset + 8 + length > buffer.byteLength) throw new Error('Incomplete GLB data');
      if (type === 0x4e4f534a) document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset + 8, length)));
      if (type === 0x004e4942) {binaryOffset = offset + 8; binaryLength = length;}
      offset += 8 + length;
    }
    if (!document || binaryOffset === undefined || document.extensionsRequired?.length) throw new Error('Unsupported GLB');
    function accessor(index, type) {
      const data = document.accessors[index], view = document.bufferViews[data?.bufferView];
      const components = type === 'VEC3' ? 3 : 1;
      const ArrayType = {5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array}[data?.componentType];
      if (!data || data.type !== type || !view || view.buffer !== 0 || !ArrayType || data.sparse || data.normalized ||
          (type === 'VEC3' && data.componentType !== 5126)) throw new Error('Unsupported GLB accessor');
      const stride = components * ArrayType.BYTES_PER_ELEMENT;
      const start = (view.byteOffset || 0) + (data.byteOffset || 0);
      const length = data.count * stride;
      if ((view.byteStride && view.byteStride !== stride) || (data.byteOffset || 0) + length > view.byteLength ||
          start + length > binaryLength || start % ArrayType.BYTES_PER_ELEMENT) throw new Error('Invalid GLB buffer');
      return new ArrayType(buffer, binaryOffset + start, data.count * components);
    }
    const parts = [], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    function visit(index) {
      const node = document.nodes[index];
      if (!node || node.matrix || node.translation || node.rotation || node.scale) throw new Error('Unexpected GLB transform');
      if (node.mesh !== undefined) for (const primitive of document.meshes[node.mesh].primitives) {
        if ((primitive.mode ?? 4) !== 4) throw new Error('Unsupported GLB primitive');
        const positions = accessor(primitive.attributes.POSITION, 'VEC3');
        const normals = accessor(primitive.attributes.NORMAL, 'VEC3');
        const indices = accessor(primitive.indices, 'SCALAR');
        if (positions.length !== normals.length || indices.length % 3) throw new Error('Invalid GLB mesh');
        for (let i = 0; i < positions.length; i++) {
          if (!Number.isFinite(positions[i]) || !Number.isFinite(normals[i])) throw new Error('Invalid GLB vertex');
          min[i % 3] = Math.min(min[i % 3], positions[i]);
          max[i % 3] = Math.max(max[i % 3], positions[i]);
        }
        for (const vertex of indices) if (vertex >= positions.length / 3) throw new Error('Invalid GLB index');
        const material = document.materials[primitive.material]?.pbrMetallicRoughness;
        if (!material) throw new Error('GLB material missing');
        parts.push({positions, normals, indices, color: material.baseColorFactor.slice(0, 3),
          metallic: material.metallicFactor ?? 1, roughness: material.roughnessFactor ?? 1});
      }
      for (const child of node.children || []) visit(child);
    }
    for (const node of document.scenes[document.scene || 0].nodes) visit(node);
    if (!parts.length) throw new Error('GLB contains no geometry');
    const center = min.map((value, i) => (value + max[i]) / 2);
    const scale = 2.05 / Math.max(...max.map((value, i) => value - min[i]));
    let radius = 0;
    for (const {positions} of parts) for (let i = 0; i < positions.length; i += 3) {
      radius = Math.max(radius, Math.hypot(positions[i] - center[0], positions[i+1] - center[1], positions[i+2] - center[2]) * scale);
    }
    return {parts, center, scale, radius};
  }

  function buildResources() {
    const shaders = [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].map((type, i) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, i === 0 ? vertexSource : fragmentSource);
      gl.compileShader(shader);
      return shader;
    });
    const program = gl.createProgram();
    shaders.forEach(shader => gl.attachShader(program, shader));
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      shaders.forEach(shader => gl.deleteShader(shader));
      gl.deleteProgram(program);
      throw new Error('The 3D program could not initialize');
    }
    shaders.forEach(shader => gl.deleteShader(shader));
    gl.useProgram(program);
    const uintIndices = gl.getExtension('OES_element_index_uint');
    const upload = (target, data) => {
      const buffer = gl.createBuffer(); gl.bindBuffer(target, buffer); gl.bufferData(target, data, gl.STATIC_DRAW); return buffer;
    };
    const parts = model.parts.map(part => {
      let {positions, normals, indices} = part;
      const count = indices.length;
      // WebGL 1 without 32-bit index support still renders every original triangle.
      if (indices instanceof Uint32Array && !uintIndices) {
        const expandedPositions = new Float32Array(count * 3), expandedNormals = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) for (let axis = 0; axis < 3; axis++) {
          expandedPositions[i*3+axis] = positions[indices[i]*3+axis];
          expandedNormals[i*3+axis] = normals[indices[i]*3+axis];
        }
        positions = expandedPositions; normals = expandedNormals; indices = null;
      }
      return {...part, positions: upload(gl.ARRAY_BUFFER, positions), normals: upload(gl.ARRAY_BUFFER, normals),
        indices: indices ? upload(gl.ELEMENT_ARRAY_BUFFER, indices) : null, count,
        indexType: indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT};
    });
    const position = gl.getAttribLocation(program, 'aPosition'), normal = gl.getAttribLocation(program, 'aNormal');
    gl.enableVertexAttribArray(position); gl.enableVertexAttribArray(normal);
    gl.uniform3fv(gl.getUniformLocation(program, 'uCenter'), model.center);
    gl.uniform1f(gl.getUniformLocation(program, 'uScale'), model.scale);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);
    return {program, parts, position, normal,
      rotation: gl.getUniformLocation(program, 'uRotation'), aspect: gl.getUniformLocation(program, 'uAspect'),
      distance: gl.getUniformLocation(program, 'uDistance'), color: gl.getUniformLocation(program, 'uBaseColor'),
      metallic: gl.getUniformLocation(program, 'uMetallic'), roughness: gl.getUniformLocation(program, 'uRoughness')};
  }

  function showFallback() {
    state.ready = false;
    cancelAnimationFrame(state.frame); state.frame = 0;
    state.pointer = null; state.tween = null;
    state.autoSpeed = 0;
    viewer.classList.remove('is-ready', 'is-dragging');
    viewer.tabIndex = -1;
    viewer.removeAttribute('aria-describedby');
    resetButton.hidden = true;
  }

  function schedule() {
    if (!state.frame && state.ready && state.visible && !document.hidden) state.frame = requestAnimationFrame(render);
  }

  function render(time) {
    state.frame = 0;
    const dt = Math.min((time - (state.last || time)) / 1000, .05);
    state.last = time;
    let moving = false;
    if (state.tween) {
      const progress = Math.min(1, (time - state.tween.start) / state.tween.duration);
      const ease = 1 - Math.pow(1-progress, 3);
      state.yaw = state.tween.fromYaw + (state.tween.yaw-state.tween.fromYaw)*ease;
      state.pitch = state.tween.fromPitch + (state.tween.pitch-state.tween.fromPitch)*ease;
      if (progress === 1) state.tween = null; else moving = true;
    } else if (!state.pointer && !reducedMotion.matches) {
      const damping = Math.exp(-INERTIA_DECAY * dt);
      const travel = (1 - damping) / INERTIA_DECAY;
      state.yaw += state.velocityX * travel;
      state.pitch = Math.max(-1.15, Math.min(1.15, state.pitch + state.velocityY * travel));
      state.velocityX *= damping; state.velocityY *= damping;
      if (Math.abs(state.pitch) === 1.15) state.velocityY = 0;
      moving = Math.abs(state.velocityX) + Math.abs(state.velocityY) > .004;
      if (!moving) state.velocityX = state.velocityY = 0;
    }
    if (!state.pointer && !reducedMotion.matches) {
      const canResume = !state.tween && time >= state.autoResumeAt &&
        Math.abs(state.velocityX) + Math.abs(state.velocityY) < .12;
      const target = canResume ? AUTO_ROTATE_SPEED : 0;
      const decay = Math.exp(-1.4 * dt);
      state.yaw += target * dt + (state.autoSpeed - target) * (1 - decay) / 1.4;
      state.autoSpeed = target + (state.autoSpeed - target) * decay;
      moving = true;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix3fv(resources.rotation, false, rotation(state.yaw, state.pitch));
    const aspect = canvas.width/canvas.height;
    const distance = Math.max(4.7, model.radius / Math.sin(Math.atan(Math.min(1, aspect) / 3.7320508)) * 1.03);
    gl.uniform1f(resources.aspect, aspect);
    gl.uniform1f(resources.distance, distance);
    for (const part of resources.parts) {
      gl.bindBuffer(gl.ARRAY_BUFFER, part.positions);
      gl.vertexAttribPointer(resources.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, part.normals);
      gl.vertexAttribPointer(resources.normal, 3, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(resources.color, part.color);
      gl.uniform1f(resources.metallic, part.metallic);
      gl.uniform1f(resources.roughness, part.roughness);
      if (part.indices) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.indices);
        gl.drawElements(gl.TRIANGLES, part.count, part.indexType, 0);
      } else gl.drawArrays(gl.TRIANGLES, 0, part.count);
    }
    if (moving) schedule(); else state.last = 0;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.width = Math.max(1, rect.width); state.height = Math.max(1, rect.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 2, 1400/state.width, 1400/state.height);
    const width = Math.max(1, Math.round(state.width*ratio));
    const height = Math.max(1, Math.round(state.height*ratio));
    if (canvas.width !== width || canvas.height !== height) {canvas.width = width; canvas.height = height;}
    schedule();
  }

  function turnTo(yaw, pitch, duration=320) {
    state.velocityX = state.velocityY = 0;
    state.autoSpeed = 0; state.autoResumeAt = performance.now() + duration + AUTO_RESUME_DELAY;
    if (reducedMotion.matches) {state.yaw = yaw; state.pitch = pitch; state.tween = null;}
    else state.tween = {fromYaw: state.yaw, fromPitch: state.pitch, yaw, pitch, start: performance.now(), duration};
    schedule();
  }

  function markInteraction() {
    viewer.classList.add('has-interacted');
    resetButton.hidden = false;
  }

  viewer.addEventListener('pointerdown', event => {
    if (!state.ready || event.button !== 0 || !event.isPrimary || event.target.closest('button')) return;
    state.tween = null; state.velocityX = state.velocityY = 0; state.last = 0;
    state.autoSpeed = 0;
    viewer.classList.add('is-pointer-active');
    state.pointer = {id: event.pointerId, type: event.pointerType, x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY, time: event.timeStamp, moved: false};
    viewer.setPointerCapture(event.pointerId);
    viewer.classList.add('is-dragging');
    if (event.pointerType === 'mouse') viewer.focus({preventScroll: true});
  });

  viewer.addEventListener('pointermove', event => {
    const pointer = state.pointer;
    if (!pointer || event.pointerId !== pointer.id) return;
    const totalX = event.clientX-pointer.startX, totalY = event.clientY-pointer.startY;
    if (!pointer.moved && Math.hypot(totalX, totalY) < 5) return;
    if (pointer.type === 'touch' && !pointer.moved && Math.abs(totalY) > Math.abs(totalX)) {
      release(event, true); return;
    }
    pointer.moved = true;
    const dx = (event.clientX-pointer.x) / state.width * Math.PI*2;
    const dy = pointer.type === 'touch' ? 0 : (event.clientY-pointer.y) / state.height * Math.PI;
    const seconds = Math.max(.008, (event.timeStamp-pointer.time)/1000);
    state.yaw += dx;
    state.pitch = Math.max(-1.15, Math.min(1.15, state.pitch + dy));
    state.velocityX = Math.max(-5, Math.min(5, dx/seconds))*.65 + state.velocityX*.35;
    state.velocityY = Math.max(-3, Math.min(3, dy/seconds))*.65 + state.velocityY*.35;
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.time = event.timeStamp;
    markInteraction(); schedule();
  });

  function release(event, cancel=false) {
    const pointer = state.pointer;
    if (!pointer || event.pointerId !== pointer.id) return;
    state.pointer = null;
    viewer.classList.remove('is-dragging');
    if (viewer.hasPointerCapture(event.pointerId)) viewer.releasePointerCapture(event.pointerId);
    state.last = 0;
    state.autoResumeAt = performance.now() + AUTO_RESUME_DELAY;
    const held = Math.max(0, event.timeStamp - pointer.time);
    if (cancel || held > 220 || reducedMotion.matches) state.velocityX = state.velocityY = 0;
    else {
      const releaseDamping = Math.exp(-8 * Math.max(0, held - 40) / 1000);
      state.velocityX *= releaseDamping; state.velocityY *= releaseDamping;
    }
    if (!cancel && !pointer.moved) {
      markInteraction();
      if (reducedMotion.matches) turnTo(state.yaw + .4, state.pitch);
      else {state.velocityX = 1.1; schedule();}
    }
    else schedule();
  }
  viewer.addEventListener('pointerup', event => release(event));
  viewer.addEventListener('pointercancel', event => release(event, true));
  viewer.addEventListener('lostpointercapture', event => release(event, true));
  viewer.addEventListener('dragstart', event => event.preventDefault());
  viewer.addEventListener('dblclick', event => {
    if (!state.ready || event.target.closest('button')) return;
    turnTo(REST.yaw, REST.pitch);
  });
  viewer.addEventListener('keydown', event => {
    if (!state.ready || event.target !== viewer) return;
    viewer.classList.remove('is-pointer-active');
    const turns = {ArrowLeft: [-.18, 0], ArrowRight: [.18, 0], ArrowUp: [0, -.14], ArrowDown: [0, .14], Enter: [.4, 0], ' ': [.4, 0]};
    if (event.key === 'Home' || event.key === 'Escape') {
      event.preventDefault(); turnTo(REST.yaw, REST.pitch); return;
    }
    if (!turns[event.key]) return;
    event.preventDefault(); markInteraction();
    const [x, y] = turns[event.key];
    turnTo(state.yaw+x, Math.max(-1.15, Math.min(1.15, state.pitch+y)), 160);
  });
  viewer.addEventListener('blur', () => viewer.classList.remove('is-pointer-active'));
  resetButton.addEventListener('click', () => {turnTo(REST.yaw, REST.pitch); viewer.focus({preventScroll: true});});
  reducedMotion.addEventListener('change', () => {
    state.tween = null; state.velocityX = state.velocityY = state.autoSpeed = 0; schedule();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {cancelAnimationFrame(state.frame); state.frame = 0; state.velocityX = state.velocityY = 0;}
    else {state.last = 0; schedule();}
  });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(viewer);
  else window.addEventListener('resize', resize, {passive: true});
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    state.visible = entries[0].isIntersecting;
    if (!state.visible) {cancelAnimationFrame(state.frame); state.frame = 0; state.velocityX = state.velocityY = 0;}
    else {state.last = 0; schedule();}
  }).observe(viewer);

  canvas.addEventListener('webglcontextlost', event => {event.preventDefault(); showFallback();});
  canvas.addEventListener('webglcontextrestored', () => {
    try {resources = buildResources(); activate(false);} catch {showFallback();}
  });

  function activate(intro) {
    state.ready = true; state.last = 0;
    viewer.tabIndex = 0;
    viewer.setAttribute('aria-describedby', 'logo-help');
    viewer.classList.add('is-ready');
    if (intro && !reducedMotion.matches) {
      state.yaw = .18; state.pitch = -.04;
      turnTo(REST.yaw, REST.pitch, 1100);
    }
    resize(); schedule();
  }

  async function initialize() {
    gl = canvas.getContext('webgl', {alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: 'low-power'});
    if (!gl) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {controller.abort(); showFallback();}, 30000);
    try {
      const response = await fetch('/assets/ni-logo.glb', {signal: controller.signal});
      if (!response.ok) throw new Error('Logo model unavailable');
      const buffer = await response.arrayBuffer();
      if (controller.signal.aborted) return;
      model = readModel(buffer);
      resources = buildResources();
      activate(true);
    } catch {showFallback();}
    finally {clearTimeout(timeout);}
  }
  initialize().catch(showFallback);
})();
