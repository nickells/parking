// Car factory for NPC cars sized from image aspect ratio

export function createNpcCar(image, centerX, centerY, options = {}) {
  const {
    longSidePx = 90,
    angle = 0,
    collisionInsetX = 8,
    collisionInsetY = 6,
    // angle offset no longer needed if all sprites share orientation
  } = options;

  const iw = image?.naturalWidth || image?.width || 1;
  const ih = image?.naturalHeight || image?.height || 1;

  let width, height;
  if (iw >= ih) {
    // Landscape sprite: width is long side
    width = longSidePx;
    height = Math.max(1, Math.round((longSidePx * ih) / iw));
  } else {
    // Portrait sprite: height is long side
    width = longSidePx;
    height = Math.max(1, Math.round((longSidePx * iw) / ih));
  }

  console.log("car", { iw, ih, longSidePx, angle, width, height });

  return {
    x: centerX,
    y: centerY,
    width,
    height,
    angle,
    collisionInsetX,
    collisionInsetY,
    image,
  };
}
