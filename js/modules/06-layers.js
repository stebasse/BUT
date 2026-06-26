function tile(layer, pane = "tilePaneQGIS") {
  const key = `${layer.id}_${pane}`;

  if (tileLayers[key] || !layer.tile) {
    return tileLayers[key];
  }

  tileLayers[key] = L.tileLayer(`../${layer.tile}/{z}/{x}/{y}.png`, {
    pane,
    opacity: layer.opacity ?? 1,
    maxNativeZoom: config.zoom_max,
    maxZoom: 22,
    errorTileUrl: "",
    keepBuffer: 1,
    updateWhenIdle: true,
    updateWhenZooming: false
  });

  return tileLayers[key];
}

async function vector(layer) {
  if (vectorLayers[layer.id]) {
    return vectorLayers[layer.id];
  }

  const data = await loadJson(`../${layer.geojson}`);
  const group = L.layerGroup();

  if ((norm(layer.name).includes("vette") || norm(layer.name).includes("selle")) && data.features) {
    data.features.sort((a, b) => featureElevation(b) - featureElevation(a));
  }

  if (layer.geometry === "line" && hasOutline(layer)) {
    group.addLayer(L.geoJSON(data, {
      filter: feature => filterFeature(layer, feature),
      style: feature => outlineStyle(layer, feature)
    }));
  }

  group.addLayer(L.geoJSON(data, {
    filter: feature => filterFeature(layer, feature),
    style: feature => pathStyle(layer, feature),
    pointToLayer: (feature, latlng) => point(layer, feature, latlng),
    onEachFeature: (feature, leafletLayer) => {
      if (layer.popup) {
        leafletLayer.bindPopup(popup(layer, feature));
      }

      bindPeakLabel(layer, feature, leafletLayer);
      bindStandardHoverLabel(layer, feature, leafletLayer);
    }
  }));

  vectorLayers[layer.id] = group;
  return group;
}

async function addLayer(id) {
  const layer = layersById[id];

  if (!layer) {
    return;
  }

  setLoading(true);

  try {
    if (layer.tile) {
      const tileLayer = tile(layer);
      if (tileLayer && !map.hasLayer(tileLayer)) tileLayer.addTo(map);
    }

    if (layer.geojson) {
      const vectorLayer = await vector(layer);
      if (vectorLayer && !map.hasLayer(vectorLayer)) vectorLayer.addTo(map);
    }

    activeLayerIds.add(id);
    enforceLayerOrder();
    updatePeakLabelsOnZoom();
    updateLegend();
  } finally {
    setLoading(false);
  }
}

function rememberLayerState(id, state) {
  userLayerStates[id] = state;
}

function removeLayer(id) {
  ["tilePaneQGIS", "customPane"].forEach(pane => {
    const key = `${id}_${pane}`;
    if (tileLayers[key] && map.hasLayer(tileLayers[key])) {
      map.removeLayer(tileLayers[key]);
    }
  });

  if (vectorLayers[id] && map.hasLayer(vectorLayers[id])) map.removeLayer(vectorLayers[id]);

  activeLayerIds.delete(id);
  enforceLayerOrder();
  updatePeakLabelsOnZoom();
  updateLegend();
}

async function refreshLayer(id) {
  const layer = layersById[id];
  const wasVisible = vectorLayers[id] && map.hasLayer(vectorLayers[id]);

  if (vectorLayers[id]) {
    if (wasVisible) map.removeLayer(vectorLayers[id]);
    delete vectorLayers[id];
  }

  if (wasVisible) {
    const vectorLayer = await vector(layer);
    vectorLayer.addTo(map);
  }

  updateLegend();
}
