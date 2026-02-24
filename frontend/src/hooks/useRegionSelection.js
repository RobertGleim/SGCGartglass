import { useState } from 'react';

export default function useRegionSelection() {
  const [selectedRegion, setSelectedRegion] = useState(null);

  function handleRegionClick(region) {
    setSelectedRegion(region);
    if (region) {
      region.set({
        stroke: 'yellow',
        strokeWidth: 3,
        strokeDashArray: null,
        opacity: 0.5,
      });
      region.canvas?.renderAll();
    }
  }

  function clearSelection() {
    if (selectedRegion) {
      selectedRegion.set({
        stroke: '#222',
        strokeWidth: 2.5,
        opacity: 1,
      });
      selectedRegion.canvas?.renderAll();
    }
    setSelectedRegion(null);
  }

  return {
    selectedRegion,
    handleRegionClick,
    clearSelection,
  };
}
