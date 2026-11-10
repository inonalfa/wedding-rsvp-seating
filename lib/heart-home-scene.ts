import {
  ACESFilmicToneMapping, BufferGeometry, CanvasTexture, CircleGeometry, Color,
  DirectionalLight, Float32BufferAttribute, Group, HemisphereLight, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, OrthographicCamera, PlaneGeometry,
  PMREMGenerator, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, WebGLRenderer,
  type Material, type Texture,
} from "three";
import { createHeartHomeGeometry, heartHomeFrame, LOVE_DURATION, smoothProgress } from "./heart-home-geometry";

/** Loaded only in the browser, independently of the invitation and RSVP code. */
export async function createHeartHomeScene(canvas: HTMLCanvasElement) {
  const [{ RoomEnvironment }, { RoundedBoxGeometry }] = await Promise.all([
    import("three/addons/environments/RoomEnvironment.js"),
    import("three/addons/geometries/RoundedBoxGeometry.js"),
  ]);
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new Scene();
  const camera = new OrthographicCamera(-2.5, 2.5, 1.35, -1.35, .1, 30);
  camera.position.set(0, .22, 6);
  camera.lookAt(0, -.015, 0);
  const textures: Texture[] = [];
  let environmentTarget: ReturnType<PMREMGenerator["fromScene"]> | undefined;
  let disposed = false;

  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    scene.traverse(object => {
      if (object instanceof Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    environmentTarget?.dispose();
    renderer.dispose();
  }

  try {
    // Studio reflections are generated locally: no HDR download or texture request.
    const room = new RoomEnvironment();
    const pmrem = new PMREMGenerator(renderer);
    try { environmentTarget = pmrem.fromScene(room, .06); scene.environment = environmentTarget.texture; }
    finally { room.dispose(); pmrem.dispose(); }
    scene.add(new HemisphereLight(0xfff4de, 0x364a40, 2.0));
    const key = new DirectionalLight(0xffedd6, 3.8);
    key.position.set(-3, 4, 5);
    const rim = new DirectionalLight(0xffffff, 2.8);
    rim.position.set(3, 1, -2);
    scene.add(key, rim);

    const topology = createHeartHomeGeometry();
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(topology.heart, 3));
    geometry.setIndex(topology.indices);
    geometry.computeVertexNormals();
    const target = new BufferGeometry();
    target.setAttribute("position", new Float32BufferAttribute(topology.house, 3));
    target.setIndex(topology.indices);
    target.computeVertexNormals();
    geometry.morphAttributes.position = [target.getAttribute("position")];
    geometry.morphAttributes.normal = [target.getAttribute("normal")];
    geometry.computeBoundingSphere();
    target.dispose();

    const champagne = new Color("#dcb681"), porcelain = new Color("#f0d8b0");
    const material = new MeshPhysicalMaterial({
      color: champagne, metalness: .72, roughness: .26,
      clearcoat: .7, clearcoatRoughness: .2, envMapIntensity: 1.15,
    });
    const sculpture = new Group();
    const body = new Mesh(geometry, material);
    sculpture.add(body);
    scene.add(sculpture);

    // The windows and doorway resolve after the silhouette has become a house.
    const details = new Group();
    const trim = new MeshPhysicalMaterial({ color: "#edca8d", metalness: .78, roughness: .28, transparent: true });
    const inset = new MeshPhysicalMaterial({ color: "#16372b", metalness: .15, roughness: .36, transparent: true });
    const glass = new MeshPhysicalMaterial({ color: "#d4ab6a", emissive: "#c88635", emissiveIntensity: .24, metalness: .25, roughness: .22, transparent: true });
    const detailMaterials = [trim, inset, glass];
    function rounded(width: number, height: number, depth: number, radius: number, x: number, y: number, z: number, surface: Material) {
      const mesh = new Mesh(new RoundedBoxGeometry(width, height, depth, 3, radius), surface);
      mesh.position.set(x, y, z);
      details.add(mesh);
      return mesh;
    }
    rounded(.40, .66, .06, .045, .22, -.47, .366, trim);
    rounded(.32, .58, .035, .017, .22, -.47, .403, inset);
    const knob = new Mesh(new SphereGeometry(.025, 12, 8), trim);
    knob.position.set(.315, -.49, .442);
    details.add(knob);
    rounded(.36, .36, .06, .03, -.39, -.15, .368, trim);
    rounded(.29, .29, .035, .016, -.39, -.15, .405, glass);
    rounded(.026, .29, .025, .008, -.39, -.15, .432, trim);
    rounded(.29, .026, .025, .008, -.39, -.15, .432, trim);
    const attic = new Mesh(new CircleGeometry(.108, 40), inset);
    attic.position.set(0, .51, .368);
    const atticFrame = new Mesh(new TorusGeometry(.108, .018, 10, 40), trim);
    atticFrame.position.set(0, .51, .385);
    details.add(attic, atticFrame);
    sculpture.add(details);

    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 128;
    const context = shadowCanvas.getContext("2d");
    let shadow: Mesh<PlaneGeometry, MeshBasicMaterial> | undefined;
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, "rgba(0,0,0,.42)");
      gradient.addColorStop(.42, "rgba(0,0,0,.2)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
      const texture = new CanvasTexture(shadowCanvas);
      textures.push(texture);
      shadow = new Mesh(new PlaneGeometry(3.4, 2.1), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: .72 }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = -1.05;
      scene.add(shadow);
    }

    let lastTime = 0;
    function render(milliseconds: number) {
      if (disposed || renderer.getContext().isContextLost()) return;
      lastTime = milliseconds;
      const frame = heartHomeFrame(milliseconds);
      body.morphTargetInfluences![0] = frame.morph;
      material.color.lerpColors(champagne, porcelain, frame.morph * .62);
      material.metalness = .72 - .2 * frame.morph;
      const turn = smoothProgress(frame.time, 0, 3_700);
      sculpture.rotation.set(-.11 + .035 * turn, -.38 + .76 * turn, -.055 * (1 - turn));
      const pulse = Math.exp(-(((frame.time - 380) / 115) ** 2)) + .65 * Math.exp(-(((frame.time - 665) / 100) ** 2));
      sculpture.scale.setScalar(1 + .032 * pulse * (1 - frame.morph));
      sculpture.position.y = .025 + .055 * Math.sin(Math.PI * Math.min(1, frame.time / LOVE_DURATION));
      details.visible = frame.details > 0;
      details.scale.setScalar(.96 + .04 * frame.details);
      detailMaterials.forEach(surface => { surface.opacity = frame.details; });
      if (shadow) shadow.scale.setScalar(.92 + .08 * frame.morph);
      renderer.render(scene, camera);
    }

    function resize() {
      if (disposed) return;
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const ratio = width / height;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.matchMedia("(pointer: coarse)").matches ? 1.5 : 2));
      renderer.setSize(width, height, false);
      camera.left = -1.35 * ratio;
      camera.right = 1.35 * ratio;
      camera.updateProjectionMatrix();
      render(lastTime);
    }

    // Compile before revealing the canvas so the first visible frame is complete.
    resize();
    await renderer.compileAsync(scene, camera);
    return { render, resize, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
