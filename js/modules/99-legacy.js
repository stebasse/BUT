function tocRowForLayerId(id) {
  return document.querySelector(`.toc-layer[data-layer-id="${id}"]`);
}

async function applyBasemapLayerPolicy(id) {
  currentBasemapId = id;

  if (map.hasLayer(hillshadeOverlay)) {
    map.removeLayer(hillshadeOverlay);
  }

  const onlyBut = id === "osm" || id === "carto";

  config?.layers?.forEach(layer => {
    const row = tocRowForLayerId(layer.id);
    if (row) {
      row.closest(".toc-item")?.classList.toggle("hidden-by-basemap", onlyBut && !isButLayer(layer));
    }
  });

  if (onlyBut) {
    for (const layer of config.layers) {
      if (isTopoOnlyLayer(layer) && activeLayerIds.has(layer.id)) {
        removeLayer(layer.id);
      }
    }

    config.layers
      .filter(isHillshadeLayer)
      .forEach(layer => {
        if (layer.tile) hillshadeOverlay.addLayer(tile(layer, "customPane"));
      });

    hillshadeOverlay.addTo(map);

    for (const layer of config.layers.filter(isButLayer)) {
      if (shouldBeVisibleInNone(layer) && !activeLayerIds.has(layer.id)) {
        await addLayer(layer.id);
      }
    }

    enforceLayerOrder();
    updatePeakLabelsOnZoom();
    updateLegend();
    return;
  }

  for (const layer of config.layers) {
    if (isHillshadeLayer(layer)) continue;

    if (shouldBeVisibleInNone(layer) && !activeLayerIds.has(layer.id)) {
      await addLayer(layer.id);
    }

    if (!shouldBeVisibleInNone(layer) && activeLayerIds.has(layer.id)) {
      removeLayer(layer.id);
    }
  }

  config.layers
    .filter(isHillshadeLayer)
    .forEach(layer => {
      if (layer.tile) hillshadeOverlay.addLayer(tile(layer, "customPane"));
    });

  hillshadeOverlay.addTo(map);
  enforceLayerOrder();
  updatePeakLabelsOnZoom();
  updateLegend();
}

async function setBasemap(id) {
  clearBasemapLayers();

  const basemap = BASEMAPS[id];

  if (!basemap || basemap.type === "none") {
    await applyBasemapLayerPolicy(id);
    return;
  }

  if (basemap.type === "xyz") {
    window._bm = xyzLayer(id);
    window._bm?.addTo(map);
    await applyBasemapLayerPolicy(id);
  }
}

function featureElevation(feature) {
  const props = feature.properties || {};
  const elevation = firstValue(props, [
    "quota",
    "Quota",
    "QUOTA",
    "ele",
    "Ele",
    "ELE",
    "elevation",
    "Elevation",
    "ELEVATION",
    "altitude",
    "Altitude",
    "ALTITUDE"
  ]);

  const value = parseFloat(String(elevation || "").replace(",", "."));
  return Number.isFinite(value) ? value : -Infinity;
}

function labelBBox(latlng, text) {
  const p = map.latLngToLayerPoint(latlng);
  const clean = String(text).replace(/<br>/g, " ");
  const width = Math.min(120, Math.max(36, clean.length * 5.2));
  const height = text.includes("<br>") ? 24 : 14;

  return {
    left: p.x - width / 2,
    right: p.x + width / 2,
    top: p.y - height - 18,
    bottom: p.y - 4
  };
}

function intersects(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function activeStyle(layer, id) {
  return !activeStyleIds[layer.id] || activeStyleIds[layer.id].has(id);
}

function qgisLikePointIcon(layer, feature) {
  const name = norm(layer.name);
  const styleId = feature.properties?.__style_id;
  const item = styleItem(layer, styleId);
  const style = item?.style || {};

  if (name.includes("selle")) {
    return L.divIcon({
      className: "qgis-point-icon",
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      html: `<svg width="16" height="16" viewBox="0 0 24 24"><path d="M8 7 L12 12 L8 17" fill="none" stroke="#9a6a3a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 7 L12 12 L16 17" fill="none" stroke="#9a6a3a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    });
  }

  if (name.includes("vette")) {
    return L.divIcon({
      className: "qgis-point-icon",
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      html: `<svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 6 L18 18 L6 18 Z" fill="#9a6a3a" stroke="#9a6a3a" stroke-width="1.2" stroke-linejoin="round"/></svg>`
    });
  }

  if (style.svg) {
    const size = style.size || 24;
    return L.icon({
      iconUrl: `../${style.svg}`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  return null;
}

function qgisLikeLineStyle(layer, style, item = null) {
  const name = norm(layer.name);
  const label = norm(item?.label || "");

  if (name.includes("but_tracciati")) {
    const base = {
      weight: 4.7,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
      outlineColor: "#ffffff",
      outlineWeight: 7.9,
      outlineOpacity: 1
    };

    if (label.includes("salita_estrema")) return { ...base, color: "#76263b" };
    if (label.includes("salita_ripida")) return { ...base, color: "#cc4a3d" };
    if (label.includes("salita_impegnativa")) return { ...base, color: "#e69037" };
    if (label.includes("salita_moderata")) return { ...base, color: "#f4cf52" };
    if (label.includes("piano") || label.includes("lieve")) return { ...base, color: "#b4b4aa" };
    if (label.includes("discesa_forte")) return { ...base, color: "#315596" };
    if (label.includes("discesa_25_10")) return { ...base, color: "#608bc4" };

    return { ...style, opacity: 0 };
  }

  if (name.includes("sentieri")) {
    return {
      color: "#8a3ffc",
      weight: 0.8,
      opacity: 0.65,
      dashArray: "3,4"
    };
  }

  if (name.includes("strade")) {
    return {
      color: "#ffffff",
      weight: 0.9,
      opacity: 0.75,
      outlineColor: "#2f2f2f",
      outlineWeight: 1.7,
      outlineOpacity: 0.65
    };
  }

  if (name.includes("sbarramenti")) {
    return {
      color: "#d8a2b8",
      weight: 2.2,
      opacity: 1
    };
  }

  if (name.includes("reticolo_idrografico")) {
    return {
      color: "#5aa9d6",
      weight: 1.1,
      opacity: 0.9
    };
  }

  if (name.includes("confine_nazionale")) {
    return {
      color: "#d400c5",
      weight: 1.2,
      opacity: 0.75,
      dashArray: "7,4,1,4"
    };
  }

  return style;
}

function outlineStyle(layer, feature) {
  const item = styleItem(layer, feature.properties?.__style_id);
  const style = qgisLikeLineStyle(layer, item?.style || {}, item);

  return {
    pane: "vectorOutlinePane",
    color: style.outlineColor || style.color || "#111",
    weight: style.outlineWeight || ((style.weight || 2) + 2),
    opacity: style.outlineOpacity ?? style.opacity ?? 1,
    lineCap: style.lineCap || "round",
    lineJoin: style.lineJoin || "round"
  };
}

function hasOutline(layer) {
  return (layer.style_items || []).some(item => {
    const st = qgisLikeLineStyle(layer, item.style || {}, item);
    return !!st.outlineColor;
  });
}

function pathStyle(layer, feature) {
  const item = styleItem(layer, feature.properties?.__style_id);
  let style = item?.style || {
    color: "#555",
    weight: 1,
    fillOpacity: 0.15
  };

  style = qgisLikeLineStyle(layer, style, item);

  return {
    ...style,
    pane: "vectorPane"
  };
}

function filterFeature(layer, feature) {
  const id = feature.properties?.__style_id;

  return (!id || activeStyle(layer, id)) && activeBut(layer, feature);
}
