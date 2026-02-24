export function parseSVG(svgContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) throw new Error('Invalid SVG');
  const viewBox = svg.getAttribute('viewBox');
  const regions = extractRegions(svg);
  return { viewBox, regions };
}

export function extractRegions(svgElement) {
  const paths = Array.from(svgElement.querySelectorAll('path[id]'));
  return paths.map(path => {
    const regionId = path.getAttribute('id');
    const d = path.getAttribute('d');
    return { regionId, d };
  });
}

export function createFabricPath(pathData, regionId) {
  // eslint-disable-next-line
  const { fabric } = window;
  const path = new fabric.Path(pathData, {
    stroke: '#222',
    strokeWidth: 2.5,
    fill: '#fff',
    selectable: true,
    objectCaching: false,
  });
  path.regionId = regionId;
  path.glassType = null;
  path.color = '#fff';
  return path;
}
