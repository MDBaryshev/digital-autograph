import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type CrownMetal = 'diamond' | 'gold' | 'silver' | 'bronze';
type Surface = MeshStandardMaterial | MeshPhysicalMaterial;
type MeshPart = Mesh<BufferGeometry, Surface>;

const tau = 2 * Math.PI;
const metals = {
  diamond: {
    body: '#879ab5',
    trim: '#bfcfe5',
    inset: '#364b70',
    gem: '#99c8f8',
  },
  gold: { body: '#a86824', trim: '#edbd66', inset: '#431021', gem: '#850a25' },
  silver: {
    body: '#8eabc3',
    trim: '#dcecff',
    inset: '#284169',
    gem: '#2e68d6',
  },
  bronze: {
    body: '#864c36',
    trim: '#d39a72',
    inset: '#35282a',
    gem: '#4b8a82',
  },
};

function point(angle: number, radius: number, height: number) {
  return new Vector3(
    Math.sin(angle) * radius,
    height,
    Math.cos(angle) * radius,
  );
}

function makeGem(cut: 'brilliant' | 'shield' | 'step') {
  const sides = cut === 'brilliant' ? 10 : cut === 'shield' ? 8 : 4;
  const oval = cut === 'shield' ? 1.39 : cut === 'step' ? 1.22 : 1;
  const vertices: number[] = [];
  const colors: number[] = [];
  const grades = [0.42, 0.62, 0.9, 1.04, 1.36, 0.74, 1.16, 0.48];
  function outline(index: number, radius: number, depth: number, offset = 0) {
    const angle = ((index + offset) * tau) / sides + Math.PI / sides;
    const taper = cut === 'shield' ? 1 - 0.22 * Math.sin(angle) : 1;
    return new Vector3(
      Math.cos(angle) * radius * taper,
      Math.sin(angle) * radius * oval,
      depth,
    );
  }
  function triangle(a: Vector3, b: Vector3, c: Vector3, grade: number) {
    const light = grades[grade % grades.length]!;
    for (const p of [a, b, c]) {
      vertices.push(p.x, p.y, p.z);
      colors.push(light * 0.93, light * 0.98, light);
    }
  }
  const table = new Vector3(0, 0, 0.43);
  const pavilion = new Vector3(0, 0, -0.55);
  for (let side = 0; side < sides; side++) {
    const next = side + 1;
    const a = outline(side, 1, 0);
    const b = outline(next, 1, 0);
    const ca = outline(side, 0.72, 0.24, 0.5);
    const cb = outline(next, 0.72, 0.24, 0.5);
    const ta = outline(side, 0.47, 0.43);
    const tb = outline(next, 0.47, 0.43);
    triangle(a, b, ca, side + 2);
    triangle(b, cb, ca, side + 5);
    triangle(ca, cb, tb, side + 3);
    triangle(ca, tb, ta, side + 1);
    triangle(table, ta, tb, 4);
    triangle(b, a, pavilion, side + 4);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function buildCrown(metal: CrownMetal) {
  const palette = metals[metal];
  const body = new MeshStandardMaterial({
    color: palette.body,
    metalness: 0.93,
    roughness: 0.25,
  });
  const trim = new MeshStandardMaterial({
    color: palette.trim,
    metalness: 0.86,
    roughness: 0.16,
  });
  const enamel = new MeshPhysicalMaterial({
    color: palette.inset,
    metalness: 0.32,
    roughness: 0.25,
    clearcoat: 0.9,
  });
  const stone = new MeshPhysicalMaterial({
    color: palette.gem,
    vertexColors: true,
    metalness: metal === 'diamond' ? 0.44 : 0.27,
    roughness: 0.08,
    ior: metal === 'diamond' ? 2.42 : 1.78,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    iridescence: metal === 'diamond' ? 0.28 : 0.07,
    envMapIntensity: 1.25,
  });
  const pavé = stone.clone();
  pavé.color = new Color(metal === 'gold' ? '#ffdcad' : '#dceffd');
  const source = new Group();
  const radius = metal === 'gold' ? 0.344 : 0.324;

  function add(geometry: BufferGeometry, material: Surface) {
    const mesh = new Mesh(geometry, material);
    source.add(mesh);
    return mesh;
  }

  function band(at: number, thickness: number, material: Surface, offset = 0) {
    const rim = add(
      new TorusGeometry(radius + offset, thickness, 10, 72),
      material,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = at;
  }

  function rail(
    points: Vector3[],
    thickness: number,
    material: Surface = trim,
  ) {
    add(
      new TubeGeometry(
        new CatmullRomCurve3(points),
        points.length === 2 ? 1 : 16,
        thickness,
        8,
        false,
      ),
      material,
    );
  }

  function bead(angle: number, at: number, size: number, offset = 0) {
    const mesh = add(new SphereGeometry(size, 8, 6), trim);
    mesh.position.copy(point(angle, radius + offset, at));
  }

  function setting(
    angle: number,
    at: number,
    size: number,
    cut: 'brilliant' | 'shield' | 'step',
    accented = false,
  ) {
    const socket = add(
      new CylinderGeometry(size * 0.56, size * 0.34, 0.044, 10),
      body,
    );
    socket.position.copy(point(angle, radius - 0.003, at));
    socket.rotation.set(Math.PI / 2, angle, 0, 'YXZ');
    const collar = add(new TorusGeometry(size * 0.8, size * 0.12, 7, 16), trim);
    collar.position.copy(point(angle, radius + 0.014, at));
    collar.rotation.y = angle;
    if (cut !== 'brilliant') collar.scale.y = cut === 'shield' ? 1.38 : 1.2;
    const gem = add(makeGem(cut), accented ? pavé : stone);
    gem.rotation.y = angle;
    gem.scale.setScalar(size);
    gem.position.copy(point(angle, radius + 0.026, at));
    for (let index = 0; index < 4; index++) {
      const offset = Math.PI / 4 + (index * Math.PI) / 2;
      const pin = add(new SphereGeometry(size * 0.135, 7, 6), trim);
      pin.position.copy(
        point(angle, radius + 0.04, at + Math.sin(offset) * size),
      );
      pin.position.addScaledVector(
        point(angle + Math.PI / 2, 1, 0),
        Math.cos(offset) * size,
      );
    }
  }

  const bandHeight = metal === 'gold' ? 0.104 : 0.068;
  add(
    new LatheGeometry(
      [
        new Vector2(radius - 0.026, 0.008),
        new Vector2(radius - 0.023, bandHeight),
        new Vector2(radius - 0.012, bandHeight + 0.006),
        new Vector2(radius + 0.008, bandHeight + 0.004),
        new Vector2(radius + 0.02, bandHeight - 0.008),
        new Vector2(radius + 0.02, 0.02),
        new Vector2(radius + 0.011, 0.008),
        new Vector2(radius - 0.026, 0.008),
      ],
      72,
    ),
    body,
  );
  band(0.015, 0.011, trim, 0.012);
  band(bandHeight - 0.001, 0.01, trim, 0.019);
  band(
    (bandHeight + 0.014) / 2,
    metal === 'gold' ? 0.018 : 0.011,
    enamel,
    0.02,
  );
  for (let i = 0; i < 32; i++) {
    bead((i * tau) / 32, (bandHeight + 0.014) / 2, 0.006, 0.033);
  }

  if (metal === 'diamond') {
    // A close-set tiara with open scrolls and tall pear-cut stones.
    for (let i = 0; i < 10; i++) {
      const angle = (i * tau) / 10;
      const height =
        i === 0 ? 0.381 : i === 1 || i === 9 ? 0.278 : i === 5 ? 0.26 : 0.208;
      for (const direction of [-1, 1]) {
        rail(
          [
            point(angle + direction * 0.31, radius, bandHeight),
            point(angle + direction * 0.19, radius - 0.002, 0.103),
            point(angle + direction * 0.092, radius - 0.012, height * 0.63),
            point(angle, radius - 0.018, height - 0.018),
          ],
          0.012,
        );
        rail(
          [
            point(
              angle + direction * 0.244,
              radius - 0.015,
              bandHeight + 0.014,
            ),
            point(angle + direction * 0.082, radius - 0.011, 0.126),
            point(angle + direction * 0.154, radius - 0.004, height * 0.67),
          ],
          0.007,
          body,
        );
        bead(angle + direction * 0.155, height * 0.67, 0.012);
      }
      setting(
        angle,
        height,
        i === 0 ? 0.071 : i === 1 || i === 9 ? 0.043 : 0.027,
        'shield',
      );
      setting(angle, bandHeight + 0.029, 0.014, 'brilliant', true);
    }
  } else if (metal === 'gold') {
    // Raised fleur-de-lis and a closed set of vaulted ribs.
    for (let i = 0; i < 8; i++) {
      const angle = (i * tau) / 8;
      const height = i % 2 === 0 ? 0.238 : 0.202;
      for (const direction of [-1, 1]) {
        rail(
          [
            point(angle + direction * 0.36, radius, bandHeight),
            point(angle + direction * 0.19, radius - 0.001, height + 0.013),
            point(angle + direction * 0.035, radius - 0.024, height - 0.029),
            point(angle, radius - 0.007, height + 0.035),
          ],
          0.014,
        );
      }
      setting(
        angle,
        height,
        i === 0 ? 0.058 : 0.035,
        i % 2 === 0 ? 'step' : 'brilliant',
      );
    }
    for (let i = 0; i < 4; i++) {
      const angle = (i * tau) / 4;
      rail(
        [
          point(angle, radius - 0.015, 0.26),
          point(angle, 0.22, 0.37),
          point(angle, 0.11, 0.406),
          point(angle, 0, 0.42),
        ],
        0.017,
      );
    }
    const orb = add(new SphereGeometry(0.045, 18, 12), trim);
    orb.position.y = 0.436;
    const finial = add(new SphereGeometry(0.021, 12, 8), enamel);
    finial.position.y = 0.475;
  } else if (metal === 'silver') {
    // Art Deco profile: low, angular steps around a blue enamel band.
    band(0.123, 0.008, trim, -0.008);
    for (let i = 0; i < 10; i++) {
      const angle = (i * tau) / 10;
      const height = i % 2 === 0 ? 0.235 : 0.19;
      for (const direction of [-1, 1]) {
        const steps = [
          [0.29, bandHeight],
          [0.225, 0.127],
          [0.144, 0.127],
          [0.109, height - 0.044],
          [0.048, height - 0.044],
          [0, height],
        ] as const;
        for (let j = 1; j < steps.length; j++) {
          const [from, y0] = steps[j - 1]!;
          const [to, y1] = steps[j]!;
          rail(
            [
              point(angle + direction * from, radius - 0.009, y0),
              point(angle + direction * to, radius - 0.009, y1),
            ],
            0.011,
          );
        }
      }
      setting(angle, height, i % 2 === 0 ? 0.038 : 0.029, 'step');
      bead(angle, 0.118, 0.01, 0.008);
    }
  } else {
    // The classic bronze circlet keeps a carved leaf silhouette.
    for (let i = 0; i < 7; i++) {
      const angle = (i * tau) / 7;
      const height = i === 0 ? 0.276 : 0.212;
      for (const direction of [-1, 1]) {
        rail(
          [
            point(angle + direction * 0.38, radius, bandHeight),
            point(angle + direction * 0.192, radius + 0.002, 0.112),
            point(angle + direction * 0.136, radius - 0.018, height * 0.81),
            point(angle, radius - 0.023, height),
          ],
          0.013,
        );
        bead(angle + direction * 0.13, height * 0.81, 0.011);
      }
      setting(angle, height, i === 0 ? 0.052 : 0.034, 'brilliant');
    }
  }

  // Merge by material so tubes, stones and individual prongs use a few draw calls.
  const groups = new Map<Surface, BufferGeometry[]>();
  for (const part of source.children as MeshPart[]) {
    part.updateMatrix();
    const geometry = part.geometry.index
      ? part.geometry.toNonIndexed()
      : part.geometry.clone();
    geometry.applyMatrix4(part.matrix);
    const list = groups.get(part.material) ?? [];
    if (!groups.has(part.material)) groups.set(part.material, list);
    list.push(geometry);
    part.geometry.dispose();
  }
  const model = new Group();
  for (const [material, geometries] of groups) {
    const geometry = mergeGeometries(geometries);
    for (const segment of geometries) segment.dispose();
    if (geometry) model.add(new Mesh(geometry, material));
  }

  const materials = [body, trim, enamel, stone, pavé];
  return {
    model,
    materials,
    dispose() {
      for (const part of model.children as MeshPart[]) part.geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
