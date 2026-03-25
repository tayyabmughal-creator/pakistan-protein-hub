const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const ASSET_DIR = path.resolve(__dirname, "../assets");
const SIZE = 1024;

const colors = {
  bgTop: [3, 10, 6],
  bgBottom: [10, 26, 14],
  bgDeep: [2, 6, 4],
  accent: [38, 214, 110],
  accentWarm: [134, 255, 122],
  accentCool: [82, 255, 195],
  white: [245, 255, 249],
  shadow: [0, 0, 0],
};

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const lerp = (start, end, t) => start + (end - start) * t;

function blend(base, top) {
  const alpha = clamp(top[3] ?? 1);
  const inv = 1 - alpha;
  return [
    Math.round((top[0] * alpha) + (base[0] * inv)),
    Math.round((top[1] * alpha) + (base[1] * inv)),
    Math.round((top[2] * alpha) + (base[2] * inv)),
    1,
  ];
}

function mix(colorA, colorB, t) {
  return [
    Math.round(lerp(colorA[0], colorB[0], t)),
    Math.round(lerp(colorA[1], colorB[1], t)),
    Math.round(lerp(colorA[2], colorB[2], t)),
    1,
  ];
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function alphaFromDistance(distance, antialias = 1.3) {
  return smoothstep(antialias, -antialias, distance);
}

function sdCircle(x, y, cx, cy, radius) {
  return Math.hypot(x - cx, y - cy) - radius;
}

function sdRoundRect(x, y, cx, cy, halfWidth, halfHeight, radius) {
  const dx = Math.abs(x - cx) - halfWidth + radius;
  const dy = Math.abs(y - cy) - halfHeight + radius;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside + inside - radius;
}

function union(...distances) {
  return Math.min(...distances);
}

function intersect(...distances) {
  return Math.max(...distances);
}

function subtract(shape, cutout) {
  return Math.max(shape, -cutout);
}

function ring(distance, width) {
  return Math.abs(distance) - width;
}

function getMonogramDistance(x, y, scale = 1, offsetX = 0, offsetY = 0) {
  const px = (x - (SIZE / 2) - offsetX) / scale + (SIZE / 2);
  const py = (y - (SIZE / 2) - offsetY) / scale + (SIZE / 2);

  const stem = sdRoundRect(px, py, 356, 526, 80, 310, 78);
  const bowlOuter = intersect(
    sdCircle(px, py, 560, 348, 214),
    py - 554,
    338 - px
  );
  const bowlInner = intersect(
    sdCircle(px, py, 562, 348, 118),
    py - 468,
    414 - px
  );
  const bowl = subtract(bowlOuter, bowlInner);

  return union(stem, bowl);
}

function writePng(fileName, width, height, colorForPixel) {
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (width * y + x) << 2;
      const color = colorForPixel(x, y, width, height);
      png.data[index] = color[0];
      png.data[index + 1] = color[1];
      png.data[index + 2] = color[2];
      png.data[index + 3] = color[3];
    }
  }

  fs.writeFileSync(path.join(ASSET_DIR, fileName), PNG.sync.write(png));
}

function renderBackdrop(x, y, width, height) {
  const nx = x / width;
  const ny = y / height;
  let color = mix(colors.bgTop, colors.bgBottom, Math.pow(ny, 1.2));

  const glowOne = clamp(1 - (Math.hypot(nx - 0.28, ny - 0.16) / 0.72), 0, 1);
  const glowTwo = clamp(1 - (Math.hypot(nx - 0.82, ny - 0.8) / 0.88), 0, 1);
  const coreGlow = clamp(1 - (Math.hypot(nx - 0.5, ny - 0.36) / 0.45), 0, 1);
  const vignette = clamp((Math.hypot(nx - 0.5, ny - 0.5) - 0.18) / 0.6, 0, 1);

  color = blend(color, [...colors.accent, glowOne * 0.18]);
  color = blend(color, [...colors.accentCool, glowTwo * 0.1]);
  color = blend(color, [...colors.accentWarm, coreGlow * 0.12]);
  color = blend(color, [...colors.bgDeep, vignette * 0.48]);

  const ringDistance = ring(sdCircle(x, y, width * 0.62, height * 0.36, width * 0.2), 9);
  const ringAlpha = alphaFromDistance(ringDistance, 9) * 0.14;
  color = blend(color, [...colors.accentWarm, ringAlpha]);

  const highlight = clamp(1 - (Math.hypot(nx - 0.22, ny - 0.1) / 0.26), 0, 1);
  color = blend(color, [...colors.white, highlight * 0.06]);

  return [color[0], color[1], color[2], 255];
}

function renderMonogramPixel(x, y, withBackground) {
  const base = withBackground ? renderBackdrop(x, y, SIZE, SIZE) : [0, 0, 0, 0];
  let color = [base[0], base[1], base[2], base[3] / 255];

  const shadowDistance = getMonogramDistance(x - 24, y - 30, 1.02);
  const shadowAlpha = alphaFromDistance(shadowDistance, 32) * 0.28;
  color = blend(color, [...colors.shadow, shadowAlpha]);

  const glowDistance = getMonogramDistance(x, y, 1.08);
  const glowAlpha = alphaFromDistance(glowDistance, 40) * 0.22;
  color = blend(color, [...colors.accentWarm, glowAlpha]);

  const shapeDistance = getMonogramDistance(x, y);
  const shapeAlpha = alphaFromDistance(shapeDistance, 1.7);

  if (shapeAlpha > 0) {
    const gradientT = clamp(((x / SIZE) * 0.42) + ((y / SIZE) * 0.58), 0, 1);
    let fill = mix(colors.white, colors.accent, gradientT * 0.95);

    const shimmer = clamp(1 - Math.abs((x - y * 0.78) - 210) / 180, 0, 1);
    fill = blend(fill, [...colors.accentWarm, shimmer * 0.18]);

    const innerShadow = clamp((getMonogramDistance(x - 10, y - 12, 0.96) + 6) / 18, 0, 1);
    fill = blend(fill, [...colors.bgBottom, innerShadow * 0.12]);

    color = blend(color, [...fill.slice(0, 3), shapeAlpha]);
  }

  return [
    Math.round(color[0]),
    Math.round(color[1]),
    Math.round(color[2]),
    Math.round(clamp(color[3]) * 255),
  ];
}

function renderForegroundPixel(x, y) {
  const transparent = [0, 0, 0, 0];
  let color = [transparent[0], transparent[1], transparent[2], 0];

  const glowDistance = getMonogramDistance(x, y, 1.08);
  const glowAlpha = alphaFromDistance(glowDistance, 36) * 0.18;
  color = blend(color, [...colors.accentWarm, glowAlpha]);

  const shapeDistance = getMonogramDistance(x, y, 0.92, 0, -6);
  const shapeAlpha = alphaFromDistance(shapeDistance, 1.7);
  if (shapeAlpha > 0) {
    const t = clamp(((x / SIZE) * 0.38) + ((y / SIZE) * 0.62), 0, 1);
    const fill = mix(colors.white, colors.accent, t * 0.9);
    color = blend(color, [...fill.slice(0, 3), shapeAlpha]);
  }

  return [
    Math.round(color[0]),
    Math.round(color[1]),
    Math.round(color[2]),
    Math.round(clamp(color[3]) * 255),
  ];
}

function renderMonochromePixel(x, y) {
  const distance = getMonogramDistance(x, y, 0.9, 0, -4);
  const alpha = alphaFromDistance(distance, 1.5);
  return [255, 255, 255, Math.round(alpha * 255)];
}

function renderSplashPixel(x, y) {
  const shadowDistance = getMonogramDistance(x - 18, y - 24, 0.88);
  const shadowAlpha = alphaFromDistance(shadowDistance, 30) * 0.24;
  let color = [0, 0, 0, 0];
  color = blend(color, [...colors.shadow, shadowAlpha]);

  const glowDistance = getMonogramDistance(x, y, 0.94);
  const glowAlpha = alphaFromDistance(glowDistance, 34) * 0.24;
  color = blend(color, [...colors.accentWarm, glowAlpha]);

  const distance = getMonogramDistance(x, y, 0.88);
  const alpha = alphaFromDistance(distance, 1.7);
  if (alpha > 0) {
    const t = clamp(((x / SIZE) * 0.35) + ((y / SIZE) * 0.65), 0, 1);
    const fill = mix(colors.white, colors.accent, t * 0.92);
    color = blend(color, [...fill.slice(0, 3), alpha]);
  }

  return [
    Math.round(color[0]),
    Math.round(color[1]),
    Math.round(color[2]),
    Math.round(clamp(color[3]) * 255),
  ];
}

function main() {
  writePng("icon.png", SIZE, SIZE, (x, y) => renderMonogramPixel(x, y, true));
  writePng("android-icon-background.png", SIZE, SIZE, (x, y) => renderBackdrop(x, y, SIZE, SIZE));
  writePng("android-icon-foreground.png", SIZE, SIZE, (x, y) => renderForegroundPixel(x, y));
  writePng("android-icon-monochrome.png", SIZE, SIZE, (x, y) => renderMonochromePixel(x, y));
  writePng("splash-icon.png", SIZE, SIZE, (x, y) => renderSplashPixel(x, y));
}

main();
