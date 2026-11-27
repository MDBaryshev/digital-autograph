import {
  ACESFilmicToneMapping,
  BoxGeometry,
  DirectionalLight,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { WallCubeFinish } from '@digital-autograph/domain';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCrown, type CrownMetal } from './crown-model';

const glassVisibility: Partial<Record<WallCubeFinish, number>> = {
  glass: 0.78,
  'satin-glass': 0.49,
  'smoked-glass': 0.32,
};

function shadeThroughGlass(
  material: ReturnType<typeof buildCrown>['materials'][number],
  eye: Vector3,
  visibility: number,
) {
  material.premultipliedAlpha = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cubeEye = { value: eye };
    shader.uniforms.glassVisibility = { value: visibility };
    shader.vertexShader =
      'varying vec3 crownPosition;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n crownPosition = transformed + vec3(0.0, 0.5, 0.0);',
      );
    shader.fragmentShader =
      `
      uniform vec3 cubeEye;
      uniform float glassVisibility;
      varying vec3 crownPosition;
    ` +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
      #include <opaque_fragment>
      // Intersect the camera-to-fragment segment with the cube in model space.
      vec3 ray = crownPosition - cubeEye;
      vec3 inverseRay = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), ray))
                        / max(abs(ray), vec3(0.00001));
      vec3 nearPlanes = (-vec3(0.499) - cubeEye) * inverseRay;
      vec3 farPlanes = (vec3(0.499) - cubeEye) * inverseRay;
      vec3 entering = min(nearPlanes, farPlanes);
      vec3 leaving = max(nearPlanes, farPlanes);
      float entry = max(max(entering.x, entering.y), max(entering.z, 0.0));
      float exitPoint = min(min(leaving.x, leaving.y), min(leaving.z, 1.0));
      float throughGlass = step(entry + 0.00001, exitPoint);
      gl_FragColor.a *= mix(1.0, glassVisibility, throughGlass);
    `,
      );
  };
}

export function mountCrownScene(
  canvas: HTMLCanvasElement,
  metal: CrownMetal,
  finish?: WallCubeFinish,
) {
  const options = { alpha: true, antialias: true };
  const context = canvas.getContext(
    'webgl2',
    options,
  ) as WebGL2RenderingContext | null;
  if (!context || context.isContextLost()) throw Error('WebGL 2 unavailable');
  const renderer = new WebGLRenderer({ canvas, context, ...options });
  try {
    return startCrownScene(renderer, metal, finish && glassVisibility[finish]);
  } catch (error) {
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
}

function startCrownScene(
  renderer: WebGLRenderer,
  metal: CrownMetal,
  visibility: number | undefined,
) {
  renderer.setClearColor(0, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));

  const scene = new Scene();
  const environment = new RoomEnvironment();
  const lighting = new PMREMGenerator(renderer);
  const environmentMap = lighting.fromScene(environment, 0.025);
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = 0.98;
  environment.dispose();
  lighting.dispose();

  const keyLight = new DirectionalLight(0xf1f6ff, 2.25);
  keyLight.position.set(-2, 6, 4);
  const warmRim = new DirectionalLight(0xffc996, metal === 'gold' ? 2.9 : 1.1);
  warmRim.position.set(3, 2, -4);
  scene.add(keyLight, warmRim);

  const camera = new PerspectiveCamera(35, 1, 10, 4000);
  const { model, materials, dispose } = buildCrown(metal);
  model.position.y = 0.5;
  const pose = new Group();
  pose.add(model);
  scene.add(pose);

  const eye = new Vector3();
  const depth =
    visibility === undefined
      ? new Mesh(
          new BoxGeometry(0.997, 0.997, 0.997),
          new MeshBasicMaterial({ colorWrite: false }),
        )
      : null;
  if (depth) {
    depth.renderOrder = -1;
    pose.add(depth);
  }
  if (visibility !== undefined) {
    for (const material of materials)
      shadeThroughGlass(material, eye, visibility);
  }
  const rotation = new Matrix4();
  let bufferWidth = 0;
  let bufferHeight = 0;

  return {
    draw(
      width: number,
      height: number,
      perspective: number,
      edge: number,
      css: DOMMatrixReadOnly,
      x: number,
      y: number,
    ) {
      if (width !== bufferWidth || height !== bufferHeight) {
        renderer.setSize(width, height, false);
        bufferWidth = width;
        bufferHeight = height;
      }
      camera.position.z = perspective;
      camera.fov = (2 * Math.atan(height / (2 * perspective)) * 180) / Math.PI;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      // CSS faces use a y-down coordinate system; the scene uses y-up.
      pose.quaternion.setFromRotationMatrix(
        rotation.set(
          css.m11,
          -css.m21,
          css.m31,
          0,
          -css.m12,
          css.m22,
          -css.m32,
          0,
          css.m13,
          -css.m23,
          css.m33,
          0,
          0,
          0,
          0,
          1,
        ),
      );
      pose.position.set(x, y, 0);
      pose.scale.setScalar(edge);
      if (visibility !== undefined)
        pose.worldToLocal(eye.copy(camera.position));
      renderer.render(scene, camera);
    },
    dispose() {
      dispose();
      depth?.geometry.dispose();
      depth?.material.dispose();
      environmentMap.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
