function xyzLayer(id) {
  const basemap = BASEMAPS[id];

  if (!basemap || !basemap.url) {
    return null;
  }

  return L.tileLayer(basemap.url, {
    pane: "basePane",
    maxZoom: 20
  });
}

function clearBasemapLayers() {
  if (window._bm) {
    map.removeLayer(window._bm);
    window._bm = null;
  }

  if (map.hasLayer(hillshadeOverlay)) {
    map.removeLayer(hillshadeOverlay);
  }
}

function isButLayer(layer) {
  return norm(layer.name).includes("but_tracciati");
}

function isIsoipseLayer(layer) {
  return norm(layer.name).includes("isoipse");
}

function isTopoOnlyLayer(layer) {
  return !isButLayer(layer) && !isHillshadeLayer(layer);
}

function isHillshadeLayer(layer) {
  return norm(layer.name).includes("hillshade");
}

function isUsoSuoloLayer(layer) {
  const layerName = norm(layer.name);
  return layerName.includes("uso_suolo") || layerName.includes("uso_del_suolo");
}

function shouldBeVisibleInNone(layer) {
  if (isUsoSuoloLayer(layer)) return true;

  if (Object.prototype.hasOwnProperty.call(userLayerStates, layer.id)) {
    return userLayerStates[layer.id];
  }

  return defaultVisibleLayerIds.has(layer.id);
}
