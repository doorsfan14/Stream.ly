(() => {
  if (!window.THREE || !window.html2canvas) return;
  const MAX_TEXTURE_SIZE = 4096;
  const canvas = document.createElement("canvas");
  canvas.id = "liquidGlassCanvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const searchOverlayCanvas = document.createElement("canvas");
  searchOverlayCanvas.id = "liquidGlassSearchOverlay";
  searchOverlayCanvas.setAttribute("aria-hidden", "true");
  const searchForm = document.querySelector(".search");
  if (!searchForm) return;
  searchForm.prepend(searchOverlayCanvas);

  let renderer;
  let backdropTexture;
  let searchOverlayContext = null;
  let previousSearchRect = null;
  let frame = 0;
  let captureFrame = 0;
  let capturing = false;
  let captureDirty = true;
  let changeVersion = 0;
  let targets = [];
  let targetRadii = [];
  let visibleTargets = [];
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
    renderer.autoClear = false;
    searchOverlayCanvas.width = canvas.width;
    searchOverlayCanvas.height = canvas.height;
    searchOverlayContext = searchOverlayCanvas.getContext("2d", { alpha: true });

    const uniforms = {
      uBackdrop: { value: backdropTexture },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uDocumentResolution: { value: new THREE.Vector2(
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth),
        Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight)
      ) },
      uScroll: { value: new THREE.Vector2(window.scrollX, window.scrollY) },
      uRect: { value: new THREE.Vector4() },
      uRadius: { value: 0 },
      uTime: { value: 0 }
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
        uniform sampler2D uBackdrop;
        uniform vec2 uResolution;
        uniform vec2 uDocumentResolution;
        uniform vec2 uScroll;
        uniform vec4 uRect;
        uniform float uRadius;
        uniform float uTime;
        varying vec2 vUv;

        float roundedSdf(vec2 p, vec2 b, float r) {
          vec2 q = abs(p) - b + vec2(r);
          return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
        }

        void main() {
          vec2 screen = vec2(vUv.x * uResolution.x, (1.0 - vUv.y) * uResolution.y);
          vec2 halfSize = uRect.zw * 0.5;
          vec2 centered = screen - uRect.xy - halfSize;
          float distanceToEdge = roundedSdf(centered, halfSize, uRadius);
          if (distanceToEdge > 0.8) {
            gl_FragColor = vec4(0.0);
            return;
          }

          vec2 gradient = vec2(
            roundedSdf(centered + vec2(1.0, 0.0), halfSize, uRadius) - roundedSdf(centered - vec2(1.0, 0.0), halfSize, uRadius),
            roundedSdf(centered + vec2(0.0, 1.0), halfSize, uRadius) - roundedSdf(centered - vec2(0.0, 1.0), halfSize, uRadius)
          );
          vec2 normal = gradient / max(length(gradient), 0.0001);
          float coverage = 1.0 - smoothstep(-0.8, 0.8, distanceToEdge);
          float edge = smoothstep(-8.0, -0.5, distanceToEdge);
          float lens = 1.0 - smoothstep(0.0, max(halfSize.x, halfSize.y), length(centered));
          vec2 ripple = vec2(
            sin(centered.y * 0.024 + uTime * 0.38),
            cos(centered.x * 0.021 - uTime * 0.31)
          ) * 0.72;
          vec2 radial = centered / max(halfSize, vec2(1.0));
          vec2 bend = normal * (1.15 + edge * 3.4) + ripple * (0.45 + lens * 0.8) + radial * 0.9;
          vec2 documentPoint = screen + uScroll;
          vec2 baseUv = vec2(
            documentPoint.x / uDocumentResolution.x,
            1.0 - documentPoint.y / uDocumentResolution.y
          );
          vec2 uv = baseUv + vec2(
            bend.x / uDocumentResolution.x,
            -bend.y / uDocumentResolution.y
          );
          vec2 fringe = vec2(
            normal.x / uDocumentResolution.x,
            -normal.y / uDocumentResolution.y
          ) * edge * 1.15;

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
          gl_FragColor = vec4(color, coverage * 0.72);
        }
      `
    });

    scene.add(new THREE.Mesh(geometry, material));
    document.body.classList.add("glass-ready");

    const getDocumentSize = () => ({
      width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth),
      height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight)
    });

    const refreshTargets = () => {
      const next = [...document.querySelectorAll(".search")];
      for (const element of targets) {
        if (!next.includes(element)) element.classList.remove("glass-target");
      }
      for (const element of next) element.classList.add("glass-target");
      targets = next;
      targetRadii = targets.map(element => {
        const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
        const box = element.getBoundingClientRect();
        return Math.max(0, Math.min(radius, box.width / 2, box.height / 2));
      });
      updateRects();
    };

    const updateRects = () => {
      visibleTargets = [];
      for (let i = 0; i < targets.length; i++) {
        const box = targets[i].getBoundingClientRect();
        if (!box.width || !box.height) continue;
        visibleTargets.push({
          element: targets[i],
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
          radius: targetRadii[i] || 0
        });
      }
    };

    const buildTexture = screenshot => {
      const texture = new THREE.CanvasTexture(screenshot);
      if ("colorSpace" in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
      else if ("encoding" in texture && THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      return texture;
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

    const capturePage = async (width, height, scale) => window.html2canvas(document.documentElement, {
      backgroundColor: null,
      scale,
      width,
      height,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      scrollX: 0,
      scrollY: 0,
      useCORS: true,
      logging: false,
      ignoreElements: element => {
        if (element.id === "liquidGlassCanvas" || element.id === "liquidGlassSearchOverlay" || element.id === "status") return true;
        return Boolean(element.closest?.(".search"));
      }
    });

    const updateBackdrop = async () => {
      if (capturing || !captureDirty) return;
      capturing = true;
      captureDirty = false;
      const version = changeVersion;
      const { width, height } = getDocumentSize();
      const scale = Math.min(renderer.getPixelRatio(), 1.25, MAX_TEXTURE_SIZE / Math.max(width, height));
      try {
        const screenshot = await capturePage(width, height, scale);
        if (version !== changeVersion) {
          captureDirty = true;
          return;
        }

        const nextTexture = buildTexture(screenshot);
        uniforms.uBackdrop.value = nextTexture;
        uniforms.uDocumentResolution.value.set(width, height);
        const previous = backdropTexture;
        backdropTexture = nextTexture;
        previous.dispose();
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
      searchOverlayCanvas.width = canvas.width;
      searchOverlayCanvas.height = canvas.height;
      previousSearchRect = null;
      refreshTargets();
      markChanged();
    };

    const updateSearchOverlay = () => {
      if (!searchOverlayContext) return;
      const ratio = renderer.getPixelRatio();
      const rect = visibleTargets[0];
      if (previousSearchRect) {
        searchOverlayContext.clearRect(
          previousSearchRect.left * ratio,
          previousSearchRect.top * ratio,
          previousSearchRect.width * ratio,
          previousSearchRect.height * ratio
        );
      }
      if (!rect || !rect.width || !rect.height) {
        previousSearchRect = null;
        return;
      }
      const sourceX = rect.left * ratio;
      const sourceY = rect.top * ratio;
      const sourceWidth = rect.width * ratio;
      const sourceHeight = rect.height * ratio;
      searchOverlayContext.drawImage(
        canvas,
        sourceX, sourceY, sourceWidth, sourceHeight,
        sourceX, sourceY, sourceWidth, sourceHeight
      );
      previousSearchRect = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };
    };

    const render = time => {
      if (document.hidden) {
        frame = 0;
        return;
      }
      uniforms.uScroll.value.set(window.scrollX, window.scrollY);
      if (!reducedMotion) uniforms.uTime.value = time * 0.001;
      updateRects();

      renderer.setScissorTest(false);
      renderer.clear(true, true, true);
      renderer.setScissorTest(true);
      for (let i = visibleTargets.length - 1; i >= 0; i--) {
        const target = visibleTargets[i];
        const left = Math.max(0, Math.floor(target.left) - 1);
        const top = Math.max(0, Math.floor(target.top) - 1);
        const right = Math.min(window.innerWidth, Math.ceil(target.right) + 1);
        const bottom = Math.min(window.innerHeight, Math.ceil(target.bottom) + 1);
        if (right <= left || bottom <= top) continue;

        uniforms.uRect.value.set(target.left, target.top, target.width, target.height);
        uniforms.uRadius.value = target.radius;
  
        renderer.setScissor(left, window.innerHeight - bottom, right - left, bottom - top);
        renderer.render(scene, camera);
      }
      renderer.setScissorTest(false);
      updateSearchOverlay();
      frame = window.requestAnimationFrame(render);
    };

    const observer = new MutationObserver(records => {
      const meaningful = records.some(record => {
        const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        return !node?.closest?.(".search, .account, .status, #liquidGlassCanvas, #liquidGlassSearchOverlay");
      });
      if (meaningful) {
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
      uniforms.uScroll.value.set(window.scrollX, window.scrollY);
      updateRects();
    }, { passive: true });
    window.addEventListener("load", markChanged, { once: true });
    window.addEventListener("pageshow", markChanged);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        markChanged();
        if (!frame) frame = window.requestAnimationFrame(render);
      }
    });
    document.addEventListener("load", event => {
      const node = event.target;
      if (node?.closest?.(".search, .account, .status")) return;
      markChanged();
    }, true);

    if (document.fonts?.ready) document.fonts.ready.then(markChanged);
    refreshTargets();
    markChanged();
    frame = window.requestAnimationFrame(render);
  } catch (error) {
    document.body.classList.remove("glass-ready");
    canvas.remove();
    searchOverlayCanvas.remove();
    if (renderer) renderer.dispose();
    console.warn("Stream.ly liquid glass is unavailable in this browser.", error);
  }
})();
