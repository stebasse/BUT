function peakLabelText(layer, feature) {
  const props = feature.properties || {};

  const name = firstValue(props, [
    layer.label_field,
    "Nome", "nome", "NOME",
    "name", "Name", "NAME",
    "label", "Label", "LABEL",
    "denominazione", "Denominazione",
    "toponym", "Toponym"
  ].filter(Boolean));

  if (!name) return null;

  // approx: 1:35000 -> z14; 1:10000 -> z16
  if (map.getZoom() < 16) return String(name);

  const elevation = firstValue(props, [
    "quota", "Quota", "QUOTA",
    "ele", "Ele", "ELE",
    "elev", "Elev", "ELEV",
    "elevation", "Elevation", "ELEVATION",
    "altitude", "Altitude", "ALTITUDE",
    "alt", "Alt", "ALT",
    "height", "Height", "HEIGHT"
  ]);

  return elevation ? `${name}<br>${elevation} m` : String(name);
}

function shouldShowPeakLabel(layer) {
  const layerName = norm(layer.name);
  // sopra 1:35000 spariscono; tra 1:35000 e 1:10000 solo nome; sotto 1:10000 nome + quota
  return (layerName.includes("vette") || layerName.includes("selle")) && map.getZoom() >= 14;
}

function bindPeakLabel(layer, feature, leafletLayer) {
  const layerName = norm(layer.name);

  if (!layerName.includes("vette") && !layerName.includes("selle")) {
    return;
  }

  leafletLayer._peakFeature = feature;
  leafletLayer._peakParentLayer = layer;

  if (!shouldShowPeakLabel(layer)) return;

  const text = peakLabelText(layer, feature);
  if (!text) return;

  leafletLayer.bindTooltip(text, {
    permanent: true,
    direction: "top",
    offset: [0, -8],
    className: "peak-label",
    opacity: 0.95
  });
}

function bindStandardHoverLabel(layer, feature, leafletLayer) {
  const layerName = norm(layer.name);

  if (layerName.includes("vette") || layerName.includes("selle")) return;

  const labelValue =
    feature.properties?.[layer.label_field] ??
    feature.properties?.Nome ??
    feature.properties?.nome ??
    feature.properties?.NOME ??
    feature.properties?.Name ??
    feature.properties?.name ??
    feature.properties?.NAME ??
    feature.properties?.label ??
    feature.properties?.Label;

  if (!labelValue) return;

  leafletLayer.bindTooltip(String(labelValue), {
    permanent: false,
    sticky: true,
    direction: "center",
    className: "hover-label",
    opacity: 0.95
  });
}

function eachLeafletLayer(layer, callback) {
  if (!layer) return;

  if (layer.eachLayer) {
    layer.eachLayer(child => eachLeafletLayer(child, callback));
    return;
  }

  callback(layer);
}

function clearPeakLabels() {
  Object.values(vectorLayers).forEach(group => {
    eachLeafletLayer(group, leafletLayer => {
      if (leafletLayer.getTooltip && leafletLayer.getTooltip()) {
        leafletLayer.unbindTooltip();
      }
    });
  });
}

function updatePeakLabelsOnZoom() {
  Object.values(vectorLayers).forEach(group => {
    eachLeafletLayer(group, leafletLayer => {
      const feature = leafletLayer._peakFeature;
      const layer = leafletLayer._peakParentLayer;

      if (!feature || !layer) return;

      if (leafletLayer.getTooltip && leafletLayer.getTooltip()) {
        leafletLayer.unbindTooltip();
      }

      if (!shouldShowPeakLabel(layer)) return;

      const text = peakLabelText(layer, feature);
      if (!text) return;

      leafletLayer.bindTooltip(text, {
        permanent: true,
        direction: "top",
        offset: [0, -8],
        className: "peak-label",
        opacity: 0.95
      });
    });
  });
}

map.on("zoomend moveend", () => {
  if (config) {
    enforceLayerOrder();
    updatePeakLabelsOnZoom();
  }
});

async function init() {
  document.getElementById("sidebar-toggle").onclick = () => {
    document.getElementById("sidebar").classList.toggle("closed");
  };

  document.getElementById("collapse-all").onclick = () => {
    document.querySelectorAll("details").forEach(details => details.open = false);
  };

  document.getElementById("expand-all").onclick = () => {
    document.querySelectorAll("details").forEach(details => details.open = true);
  };

  document.getElementById("toc-search").oninput = event => {
    const query = event.target.value.toLowerCase();

    document.querySelectorAll(".toc-layer,.toc-rule").forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(query) ? "flex" : "none";
    });
  };

  config = await loadJson("config/webgis_config.json");

  config.layers.forEach(layer => {
    layersById[layer.id] = layer;
    activeStyleIds[layer.id] = new Set((layer.style_items || []).map(item => item.id));

    if (layer.visible || isUsoSuoloLayer(layer)) {
      defaultVisibleLayerIds.add(layer.id);
      userLayerStates[layer.id] = true;
      layer.visible = true;
    } else {
      userLayerStates[layer.id] = false;
    }

    if (layer.but_groups) {
      activeButGroups[layer.id] = new Set(layer.but_groups);
    }
  });

  buildLayerDrawOrder();

  initBasemaps();
  renderTree(config.toc, document.getElementById("toc"));
  labelBoxes = [];

  const visibleLayers = config.layers
    .filter(layer => (layer.visible || isUsoSuoloLayer(layer)) && !isHillshadeLayer(layer))
    .slice()
    .reverse();

  for (const layer of visibleLayers) {
    await addLayer(layer.id);
  }

  await applyBasemapLayerPolicy("none");
  updatePeakLabelsOnZoom();
}

init().catch(error => {
  console.error(error);
  alert(error.message);
});
