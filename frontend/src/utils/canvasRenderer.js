import { createFabricPath } from './svgParser';

export function renderTemplate(canvas, regions) {
  canvas.clear();
  regions.forEach(region => {
    const pathObj = createFabricPath(region.d, region.regionId);
    canvas.add(pathObj);
  });
  canvas.renderAll();
}

export function applyColorToRegion(region, color, glassType) {
  region.set({ fill: color });
  region.glassType = glassType;
  // Optionally apply texture overlay here
  region.dirty = true;
}
