import { useState } from 'react';

export default function usePaintBucket() {
  const [filledRegions, setFilledRegions] = useState({});

  function fillRegion(region, color, glassType, textureUrl) {
    region.set({ fill: color });
    region.glassType = glassType;
    if (textureUrl) {
      applyTexture(region, textureUrl);
    }
    region.dirty = true;
    region.canvas?.renderAll();
    updateRegionState(region.regionId, color, glassType);
  }

  function applyTexture(region, textureUrl) {
    if (!textureUrl) return;
    const img = new window.Image();
    img.src = textureUrl;
    img.onload = () => {
      const pattern = new window.fabric.Pattern({
        source: img,
        repeat: 'repeat',
      });
      region.set({ fill: pattern });
      region.canvas?.renderAll();
    };
  }

  function updateRegionState(regionId, color, glassType) {
    setFilledRegions(prev => ({
      ...prev,
      [regionId]: { color, glassType },
    }));
  }

  return {
    filledRegions,
    fillRegion,
    applyTexture,
    updateRegionState,
  };
}
