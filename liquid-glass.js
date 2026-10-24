(() => {
  if (!window.THREE || !window.html2canvas) return;

  const MAX_GLASS = 12;
  const canvas = document.createElement("canvas");
  canvas.id = "liquidGlassCanvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  let renderer;
  let backdropTexture;
  let frame = 0;
  let captureFrame = 0;
  let capturing = false;
  let captureDirty = true;
  let changeVersion = 0;
  let targets = [];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const blank = document.createElement("canvas");
  blank.width = blank.height = 2;
  backdropTexture = new THREE.CanvasTexture(blank);

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      premultipliedAlpha: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x000000, 0);

    const uniforms = {
      uBackdrop: { value: backdropTexture },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uTime: { value: 0 },
      uCount: { value: 0 },
      uRects: { value: Array.from({ length: MAX_GLASS }, () => new THREE.Vector4()) },
      uRadii: { value: new Float32Array(MAX_GLASS) }
    };

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        #define MAX_GLASS 12
        uniform sampler2D uBackdrop;
        uniform vec2 uResolution;
        uniform float uTime;
        uniform int uCount;
        uniform vec4 uRects[MAX_GLASS];
        uniform float uRadii[MAX_GLASS];
        varying vec2 vUv;

        float roundedSdf(vec2 p, vec2 b, float r) {
          vec2 q = abs(p) - b + vec2(r);
          return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
        }

        void main() {
          vec2 screen = vec2(vUv.x * uResolution.x, (1.0 - vUv.y) * uResolution.y);
          vec4 rect = vec4(0.0);
          float radius = 0.0;
          float distanceToEdge = 9999.0;
          bool insideGlass = false;

          for (int i = 0; i < MAX_GLASS; i++) {
            if (i >= uCount) break;
            vec4 candidate = uRects[i];
            vec2 halfSize = candidate.zw * 0.5;
            vec2 centered = screen - candidate.xy - halfSize;
            float d = roundedSdf(centered, halfSize, uRadii[i]);
            if (d <= 0.8) {
              rect = candidate;
              radius = uRadii[i];
              distanceToEdge = d;
              insideGlass = true;
              break;
            }
          }

          if (!insideGlass) {
            gl_FragColor = vec4(0.0);
            return;
          }

          vec2 halfSize = rect.zw * 0.5;
          vec2 centered = screen - rect.xy - halfSize;
          vec2 gradient = vec2(
            roundedSdf(centered + vec2(1.0, 0.0), halfSize, radius) - roundedSdf(centered - vec2(1.0, 0.0), halfSize, radius),
            roundedSdf(centered + vec2(0.0, 1.0), halfSize, radius) - roundedSdf(centered - vec2(0.0, 1.0), halfSize, radius)
          );
          float normalLength = max(length(gradient), 0.0001);
          vec2 normal = gradient / normalLength;
          float coverage = 1.0 - smoothstep(-0.8, 0.8, distanceToEdge);
          float edge = smoothstep(-8.0, -0.5, distanceToEdge);
          float lens = 1.0 - smoothstep(0.0, max(halfSize.x, halfSize.y), length(centered));
          vec2 ripple = vec2(
            sin(centered.y * 0.024 + uTime * 0.38),
            cos(centered.x * 0.021 - uTime * 0.31)
          ) * 0.72;
          vec2 radial = centered / max(halfSize, vec2(1.0));
          vec2 bend = normal * (1.15 + edge * 3.4) + ripple * (0.45 + lens * 0.8) + radial * 0.9;
          vec2 uv = vUv + vec2(bend.x / uResolution.x, -bend.y / uResolution.y);
          vec2 fringe = vec2(normal.x / uResolution.x, -normal.y / uResolution.y) * edge * 1.15;

          vec4 redSample = texture2D(uBackdrop, uv + fringe);
          vec4 greenSample = texture2D(uBackdrop, uv);
          vec4 blueSample = texture2D(uBackdrop, uv - fringe);
          vec3 color = vec3(redSample.r, greenSample.g, blueSample.b);

          vec2 keyLight = normalize(vec2(-0.66, -0.75));
          vec2 fillLight = normalize(vec2(0.72, 0.69));
          float specular = pow(max(dot(normal, keyLight), 0.0), 5.0) * edge;
          float lowerRim = pow(max(dot(normal, fillLight), 0.0), 7.0) * edge;
          float glintPosition = sin(uTime * 0.42) * halfSize.x * 0.55;
          float glint = pow(max(0.0, 1.0 - abs(centered.x - glintPosition) / 2.5), 14.0) * edge * 0.18;

          color = mix(color, vec3(1.0, 0.965, 0.985), 0.065 + edge * 0.08);
          color += vec3(1.0, 0.95, 0.99) * (specular * 0.72 + lowerRim * 0.2 + glint);
          gl_FragColor = vec4(color, coverage);
        }
      `
    });

    scene.add(new THREE.Mesh(geometry, material));
    document.body.classList.add("glass-ready");

    const refreshTargets = () => {
      const next = [...document.querySelectorAll(".search, .video, .account")];
      for (const element of targets) {
        if (!next.includes(element)) element.classList.remove("glass-target");
      }
      for (const element of next) element.classList.add("glass-target");
      targets = next.slice(0, MAX_GLASS);
      updateRects();
    };

    const updateRects = () => {
      let count = 0;
      for (let i = 0; i < MAX_GLASS; i++) {
        if (i >= targets.length) {
          uniforms.uRects.value[i].set(0, 0, 0, 0);
          uniforms.uRadii.value[i] = 0;
          continue;
        }
        const element = targets[i];
        const box = element.getBoundingClientRect();
        if (!box.width || !box.height || getComputedStyle(element).display === "none") {
          uniforms.uRects.value[i].set(0, 0, 0, 0);
          uniforms.uRadii.value[i] = 0;
          continue;
        }
        const css = getComputedStyle(element);
        uniforms.uRects.value[count].set(box.left, box.top, box.width, box.height);
        uniforms.uRadii.value[count] = Math.max(0, Math.min(
          parseFloat(css.borderTopLeftRadius) || 0,
          box.width / 2,
          box.height / 2
        ));
        count++;
      }
      uniforms.uCount.value = count;
    };

    const queueBackdrop = () => {
      captureDirty = true;
      if (capturing || captureFrame) return;
      captureFrame = window.requestAnimationFrame(() => {
        captureFrame = 0;
        updateBackdrop();
      });
    };

    const markChanged = () => {
      changeVersion++;
      queueBackdrop();
    };

    const updateBackdrop = async () => {
      if (capturing || !captureDirty) return;
      capturing = true;
      captureDirty = false;
      const version = changeVersion;
      try {
        const screenshot = await window.html2canvas(document.documentElement, {
          backgroundColor: null,
          scale: Math.min(renderer.getPixelRatio(), 1.25),
          width: window.innerWidth,
          height: window.innerHeight,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          scrollX: -window.scrollX,
          scrollY: -window.scrollY,
          useCORS: true,
          logging: false,
          ignoreElements: element =>
            element.id === "liquidGlassCanvas" ||
            Boolean(element.closest?.(".glass-target"))
        });
        if (version === changeVersion) {
          const nextTexture = new THREE.CanvasTexture(screenshot);
          if ("colorSpace" in nextTexture && THREE.SRGBColorSpace) nextTexture.colorSpace = THREE.SRGBColorSpace;
          else if ("encoding" in nextTexture && THREE.sRGBEncoding) nextTexture.encoding = THREE.sRGBEncoding;
          nextTexture.minFilter = THREE.LinearFilter;
          nextTexture.magFilter = THREE.LinearFilter;
          nextTexture.generateMipmaps = false;
          nextTexture.needsUpdate = true;
          uniforms.uBackdrop.value = nextTexture;
          const previous = backdropTexture;
          backdropTexture = nextTexture;
          previous.dispose();
        } else {
          captureDirty = true;
        }
      } catch (error) {
        console.warn("Stream.ly liquid glass could not refresh its background.", error);
      } finally {
        capturing = false;
        if (captureDirty) queueBackdrop();
      }
    };

    const resize = () => {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
      updateRects();
      markChanged();
    };

    const render = time => {
      if (document.hidden) {
        frame = 0;
        return;
      }
      if (!reducedMotion) uniforms.uTime.value = time * 0.001;
      updateRects();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };

    const observer = new MutationObserver(records => {
      let layoutChanged = false;
      for (const record of records) {
        if (record.type === "childList") {
          layoutChanged = true;
          break;
        }
        if (record.type === "characterData") {
          layoutChanged = true;
          break;
        }
        if (record.type === "attributes") {
          layoutChanged = true;
          break;
        }
      }
      if (layoutChanged) {
        refreshTargets();
        markChanged();
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden", "style", "src", "aria-pressed", "aria-label"]
    });

    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("scroll", () => {
      updateRects();
      markChanged();
    }, { passive: true });
    document.addEventListener("input", markChanged, { passive: true });
    document.addEventListener("click", () => {
      window.requestAnimationFrame(() => {
        refreshTargets();
        markChanged();
      });
    }, { passive: true });
    window.addEventListener("load", markChanged, { once: true });
    window.addEventListener("pageshow", markChanged);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        markChanged();
        if (!frame) frame = window.requestAnimationFrame(render);
      }
    });
    document.addEventListener("load", markChanged, true);

    if (document.fonts?.ready) document.fonts.ready.then(markChanged);
    refreshTargets();
    markChanged();
    frame = window.requestAnimationFrame(render);
  } catch (error) {
    document.body.classList.remove("glass-ready");
    canvas.remove();
    if (renderer) renderer.dispose();
    console.warn("Stream.ly liquid glass is unavailable in this browser.", error);
  }
})();
