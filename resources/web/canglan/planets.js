const MATERIALS = {
  life: { label: '生命古星', ocean: [16, 57, 76], land: [94, 123, 92], high: [165, 153, 113], atmosphere: '#8abaca', water: .52, clouds: true },
  tide: { label: '潮汐古星', ocean: [14, 57, 87], land: [82, 144, 156], high: [164, 195, 190], atmosphere: '#81b6c9', water: .68, clouds: true },
  forge: { label: '熔火古星', ocean: [40, 23, 20], land: [127, 58, 30], high: [232, 139, 67], atmosphere: '#d18554', water: .42 },
  ruin: { label: '遗迹古星', ocean: [45, 37, 30], land: [131, 103, 72], high: [188, 161, 123], atmosphere: '#bda481', water: .28 },
  rift: { label: '裂界古星', ocean: [28, 33, 55], land: [82, 93, 123], high: [166, 176, 190], atmosphere: '#a1b0cf', water: .46, rings: true },
  dead: { label: '寂灭古星', ocean: [35, 35, 35], land: [95, 87, 76], high: [147, 134, 115], atmosphere: '#908f85', water: .23 },
  rock: { label: '岩质古星', ocean: [43, 37, 31], land: [119, 101, 79], high: [165, 146, 117], atmosphere: '#ac9e89', water: .29 },
  mystery: { label: '未探明古星', ocean: [12, 16, 20], land: [24, 29, 33], high: [31, 35, 39], atmosphere: '#49545e', water: .5 },
};

export function planetMaterial(node) {
  if (!node || !['observed', 'explored', 'anchored', 'cleared', 'sensed', 'visited'].includes(node.status)) return { ...MATERIALS.mystery, key: 'mystery' };
  const kind = String(node.kind || '');
  let key = /life|origin|harbor|生命|祖星|生机|古渡/.test(kind) ? 'life'
    : /tide|abyss|潮汐|海洋|重力/.test(kind) ? 'tide'
      : /forge|赤焰|熔|炉|燃烧/.test(kind) ? 'forge'
        : /rift|gate|anchor|observatory|裂|空间|双生/.test(kind) ? 'rift'
          : /ruin|archive|palace|citadel|civilization|文明|遗|古城/.test(kind) ? 'ruin'
            : /dead|tomb|寂灭|葬|衰变/.test(kind) ? 'dead' : 'rock';
  return { ...MATERIALS[key], key };
}

const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const clamp = value => Math.max(0, Math.min(1, value));
function hash(x, y, z, seed) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
}
function noise(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const sx = smooth(x - ix), sy = smooth(y - iy), sz = smooth(z - iz);
  const floor = dz => mix(
    mix(hash(ix, iy, iz + dz, seed), hash(ix + 1, iy, iz + dz, seed), sx),
    mix(hash(ix, iy + 1, iz + dz, seed), hash(ix + 1, iy + 1, iz + dz, seed), sx), sy);
  return mix(floor(0), floor(1), sz);
}
function terrain(x, y, z, seed) {
  return noise(x * 2.7, y * 2.7, z * 2.7, seed) * .53
    + noise(x * 5.4, y * 5.4, z * 5.4, seed + 13) * .27
    + noise(x * 11, y * 11, z * 11, seed + 47) * .14
    + noise(x * 23, y * 23, z * 23, seed + 91) * .06;
}

// 球面纹理只在材质/清晰度变化时生成；动画帧只合成缓存，不逐帧重算噪声。
export function createPlanetPainter() {
  const textures = new Map();
  function texture(node, size) {
    const material = planetMaterial(node);
    const seed = material.key === 'mystery' ? 0 : Number(node.seed) | 0;
    const key = `${material.key}:${seed}:${size}`;
    if (textures.has(key)) return textures.get(key);
    const surface = document.createElement('canvas');
    surface.width = surface.height = size;
    const ctx = surface.getContext('2d');
    const pixels = ctx.createImageData(size, size);
    for (let py = 0; py < size; py += 1) for (let px = 0; px < size; px += 1) {
      const x = (px + .5) / size * 2 - 1;
      const y = (py + .5) / size * 2 - 1;
      const distance = x * x + y * y;
      if (distance >= 1) continue;
      const z = Math.sqrt(1 - distance);
      const elevation = terrain(x + (seed % 97), y, z, seed);
      const land = clamp((elevation - material.water) * 17);
      const ridge = clamp((elevation - material.water - .12) * 3.5);
      const diffuse = Math.max(0, -x * .6 - y * .4 + z * .69);
      const light = .09 + Math.pow(diffuse, 1.2) * 1.04;
      const cloud = material.clouds ? clamp((terrain(x * 1.7 + 35, y * 2.6, z * 1.7, seed + 97) - .55) * 9) * .8 : 0;
      const pole = material.clouds ? clamp((Math.abs(y) - .84 + elevation * .11) * 8) : 0;
      const roughness = .77 + noise(x * 90, y * 90, z * 90, seed) * .37;
      const rim = Math.pow(1 - z, 4) * diffuse * 22;
      const offset = (py * size + px) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        let value = mix(material.ocean[channel], mix(material.land[channel], material.high[channel], ridge), land) * roughness;
        value = mix(value, 205 + channel * 8, Math.max(cloud, pole));
        if (material.key === 'forge' && elevation > .6 && elevation < .635) value += [140, 54, 10][channel];
        pixels.data[offset + channel] = Math.min(255, value * light + rim * (channel === 0 ? .5 : 1));
      }
      pixels.data[offset + 3] = Math.min(255, z * size * 35);
    }
    ctx.putImageData(pixels, 0, 0);
    if (textures.size >= 90) textures.delete(textures.keys().next().value);
    textures.set(key, surface);
    return surface;
  }

  function draw(ctx, node, x, y, radius, { quality = 112, opacity = 1 } = {}) {
    const material = planetMaterial(node);
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= opacity;
    const halo = ctx.createRadialGradient(-radius * .14, -radius * .14, radius * .72, 0, 0, radius * 1.4);
    halo.addColorStop(0, material.atmosphere + '00');
    halo.addColorStop(.4, material.atmosphere + '28');
    halo.addColorStop(1, material.atmosphere + '00');
    ctx.fillStyle = halo;
    ctx.fillRect(-radius * 1.5, -radius * 1.5, radius * 3, radius * 3);
    function ring(start, end) {
      ctx.save();
      ctx.rotate(-.42);
      for (let i = 0; i < 5; i += 1) {
        ctx.strokeStyle = material.atmosphere + (i % 2 ? '50' : '85');
        ctx.lineWidth = radius * .025;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * (1.45 + i * .065), radius * (.32 + i * .021), 0, start, end);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (material.rings) ring(Math.PI, Math.PI * 2);
    ctx.drawImage(texture(node, quality), -radius, -radius, radius * 2, radius * 2);
    ctx.strokeStyle = material.atmosphere + 'a0';
    ctx.lineWidth = Math.max(.45, radius * .007);
    ctx.beginPath(); ctx.arc(0, 0, radius, Math.PI * .9, Math.PI * 1.85); ctx.stroke();
    if (material.rings) ring(0, Math.PI);
    ctx.restore();
  }
  return { draw };
}
