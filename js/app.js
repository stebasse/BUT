const map = L.map("map", {
  preferCanvas: true,
  updateWhenIdle: true,
  updateWhenZooming: false
}).setView([46.42, 8.40], 13);

map.createPane("basePane");
map.createPane("customPane");
map.createPane("tilePaneQGIS");
map.createPane("vectorOutlinePane");
map.createPane("vectorPane");

map.getPane("basePane").style.zIndex = 100;
map.getPane("customPane").style.zIndex = 180;
map.getPane("tilePaneQGIS").style.zIndex = 250;
map.getPane("vectorOutlinePane").style.zIndex = 480;
map.getPane("vectorPane").style.zIndex = 500;

const BASEMAPS = {
  osm: {
    label: "OpenStreetMap",
    type: "xyz",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  },
  carto: {
    label: "Carto Light",
    type: "xyz",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
  },
  none: {
    label: "Ombreggiatura",
    type: "none"
  }
};

let config;

const layersById = {};
const tileLayers = {};
const vectorLayers = {};
const activeLayerIds = new Set();
const activeStyleIds = {};
const activeButGroups = {};

const hillshadeOverlay = L.layerGroup();
let currentBasemapId = "none";
let labelBoxes = [];
let defaultVisibleLayerIds = new Set();
const userLayerStates = {};
const mapLayerOrder = {};

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function prettifyLabel(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";
  if (raw.toUpperCase() === "POI") return "Punti di Interesse";

  return raw
    .replace(/_/g, " ")
    .split(/\s+/)
    .map(part => {
      if (!part) return part;
      if (/^[A-Z0-9]+$/.test(part)) return part;
      if (/^but$/i.test(part)) return "BUT";
      if (/^poi$/i.test(part)) return "POI";
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

async function loadJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw Error(url);
  }

  return await response.json();
}

function setLoading(show) {
  document.getElementById("loading")?.classList.toggle("hidden", !show);
}

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

function buildLayerDrawOrder() {
  let idx = 0;

  function visit(nodes) {
    nodes.forEach(node => {
      if (node.type === "layer") {
        mapLayerOrder[node.id] = idx++;
      }

      if (node.type === "combo_layer") {
        (node.layer_ids || []).forEach(id => {
          mapLayerOrder[id] = idx;
        });
        idx++;
      }

      if (node.children) visit(node.children);
    });
  }

  visit(config.toc || []);
}

function getOrderedActiveLayerIds() {
  return [...activeLayerIds]
    .sort((a, b) => (mapLayerOrder[b] ?? 0) - (mapLayerOrder[a] ?? 0));
}

function bringAnyLayerToFront(layer) {
  if (!layer) return;

  if (layer.eachLayer) {
    layer.eachLayer(child => bringAnyLayerToFront(child));
  }

  if (layer.bringToFront) {
    layer.bringToFront();
  }
}

function bringAnyLayerToBack(layer) {
  if (!layer) return;

  if (layer.eachLayer) {
    layer.eachLayer(child => bringAnyLayerToBack(child));
  }

  if (layer.bringToBack) {
    layer.bringToBack();
  }
}

function bringLayerToFrontById(id) {
  bringAnyLayerToFront(tileLayers[`${id}_tilePaneQGIS`]);
  bringAnyLayerToFront(tileLayers[`${id}_customPane`]);
  bringAnyLayerToFront(vectorLayers[id]);
}

function enforceLayerOrder() {
  // TOC/QGIS: top in TOC = top in map.
  getOrderedActiveLayerIds().forEach(id => {
    bringLayerToFrontById(id);
  });

  // keep base layers below operational layers
  bringAnyLayerToBack(hillshadeOverlay);
  bringAnyLayerToBack(window._bm);
}

function rememberLayerState(id, state) {
  userLayerStates[id] = state;
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

function isHillshadeLayer(layer) {
  return norm(layer.name).includes("hillshade");
}

function tocRowForLayerId(id) {
  return document.querySelector(`.toc-layer[data-layer-id="${id}"]`);
}

function setTocOnlyButMode(onlyBut) {
  const toc = document.getElementById("toc");
  if (!toc) return;

  toc.classList.toggle("toc-only-but", onlyBut);

  toc.querySelectorAll(".toc-group-main").forEach(group => {
    const hasBut = !!group.querySelector('.toc-layer[data-layer-id="but_tracciati"]');
    group.classList.toggle("hidden-by-basemap", onlyBut && !hasBut);
    group.classList.toggle("toc-but-only-group", onlyBut && hasBut);
  });

  toc.querySelectorAll(".toc-item").forEach(item => {
    const isBut = !!item.querySelector('.toc-layer[data-layer-id="but_tracciati"]');
    item.classList.toggle("hidden-by-basemap", onlyBut && !isBut);
  });
}

async function applyBasemapLayerPolicy(id) {
  currentBasemapId = id;

  if (map.hasLayer(hillshadeOverlay)) {
    map.removeLayer(hillshadeOverlay);
  }

  const onlyBut = id === "osm" || id === "carto";

  setTocOnlyButMode(onlyBut);

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

function initBasemaps() {
  const box = document.getElementById("basemap-options");
  box.innerHTML = "";

  Object.keys(BASEMAPS).forEach(id => {
    const label = document.createElement("label");
    label.className = "basemap-option";

    label.innerHTML = `
      <input type="radio" name="bm" ${id === "none" ? "checked" : ""}>
      ${BASEMAPS[id].label}
    `;

    label.querySelector("input").onchange = () => setBasemap(id);
    box.appendChild(label);
  });

  setBasemap("none");
}

L.control.scale({
  metric: true,
  imperial: false
}).addTo(map);

function popup(layer, feature) {
  const props = feature.properties || {};
  const layerName = norm(layer.name);

  const hiddenFields = new Set([
    "FID",
    "fid",
    "Icon",
    "icon"
  ]);

  if (layerName.includes("poi")) {
    hiddenFields.add("Tipo");
    hiddenFields.add("tipo");
  }

  if (layerName.includes("but_tracciati")) {
    [
      "seq",
      "SEQ",
      "slp_pc",
      "SLP_PC",
      "slp_pct",
      "SLP_PCT",
      "sun_class",
      "SUN_CLASS",
      "aspect_deg",
      "ASPECT_DEG"
    ].forEach(field => hiddenFields.add(field));
  }

  if (layerName.includes("isoipse")) {
    return `<svg class="legend-svg" viewBox="0 0 38 24"><line x1="4" y1="12" x2="34" y2="12" stroke="#8b6f4e" stroke-width="1" stroke-dasharray="4 3" stroke-linecap="round"/></svg>`;
  }

  if (layerName.includes("selle")) {
    hiddenFields.add("osm_id");
    hiddenFields.add("OSM_ID");
  }

  let html = "<table>";

  Object.keys(props).forEach(key => {
    const value = props[key];

    if (
      !key.startsWith("__") &&
      !hiddenFields.has(key) &&
      value !== null &&
      value !== ""
    ) {
      html += `
        <tr>
          <td><b>${prettifyLabel(key)}</b></td>
          <td>${value}</td>
        </tr>
      `;
    }
  });

  html += "</table>";
  return html;
}

function firstValue(props, names) {
  for (const name of names) {
    if (props[name] !== undefined && props[name] !== null && props[name] !== "") {
      return props[name];
    }
  }

  return null;
}

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

function styleItem(layer, id) {
  return (layer.style_items || []).find(item => item.id === id);
}

function activeStyle(layer, id) {
  return !activeStyleIds[layer.id] || activeStyleIds[layer.id].has(id);
}

function activeBut(layer, feature) {
  const set = activeButGroups[layer.id];
  const group = feature.properties?.Tracciato || feature.properties?.tracciato || feature.properties?.__toc_group;

  return !set || !group || set.has(group);
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

function point(layer, feature, latlng) {
  const customIcon = qgisLikePointIcon(layer, feature);

  if (customIcon) {
    return L.marker(latlng, {
      pane: "vectorPane",
      icon: customIcon
    });
  }

  const item = styleItem(layer, feature.properties?.__style_id);
  const style = item?.style || {};

  return L.circleMarker(latlng, {
    pane: "vectorPane",
    radius: style.radius ?? 5,
    color: style.color ?? "#555",
    fillColor: style.fillColor ?? style.color ?? "#555",
    weight: style.weight ?? 1,
    opacity: style.opacity ?? 1,
    fillOpacity: style.fillOpacity ?? 0.85
  });
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

function symbolSvg(layer, item = null) {
  const layerName = norm(layer.name);
  const label = norm(item?.label || "");
  const style = item?.style || {};

  if (layerName.includes("isoipse")) {
    return `<svg class="legend-svg" viewBox="0 0 38 24"><line x1="4" y1="12" x2="34" y2="12" stroke="#8b6f4e" stroke-width="1" stroke-dasharray="4 3" stroke-linecap="round"/></svg>`;
  }

  if (layerName.includes("selle")) {
    return `<svg class="legend-svg" viewBox="0 0 38 24"><path d="M15 7 L19 12 L15 17" fill="none" stroke="#9a6a3a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M23 7 L19 12 L23 17" fill="none" stroke="#9a6a3a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  if (layerName.includes("vette")) {
    return `<svg class="legend-svg" viewBox="0 0 38 24"><path d="M19 7 L25 18 L13 18 Z" fill="#9a6a3a" stroke="#9a6a3a" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
  }

  if (layerName.includes("sentieri")) {
    return `<svg class="legend-svg" viewBox="0 0 38 24"><line x1="4" y1="12" x2="34" y2="12" stroke="#8a3ffc" stroke-width="1" stroke-dasharray="3 4" stroke-linecap="round"/></svg>`;
  }

  if (layerName.includes("strade")) {
    return `<svg class="legend-svg" viewBox="0 0 38 24"><line x1="4" y1="12" x2="34" y2="12" stroke="#2f2f2f" stroke-width="1.8" stroke-linecap="round"/><line x1="4" y1="12" x2="34" y2="12" stroke="#ffffff" stroke-width="0.9" stroke-linecap="round"/></svg>`;
  }

  if (layerName.includes("sbarramenti")) {
    return `<svg class="legend-svg" viewBox="0 0 38 24"><line x1="4" y1="12" x2="34" y2="12" stroke="#d8a2b8" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  }

  if (layerName.includes("reticolo_idrografico")) {
    return `<svg class="legend-svg" viewBox="0 0 38 24"><line x1="4" y1="12" x2="34" y2="12" stroke="#5aa9d6" stroke-width="1.2" stroke-linecap="round"/></svg>`;
  }

  if (layerName.includes("confine_nazionale")) {
    return `<svg class="legend-svg" viewBox="0 0 38 24">
      <line x1="4" y1="12" x2="34" y2="12" stroke="#d400c5" stroke-width="1.2" stroke-dasharray="7 4 1 4" stroke-linecap="round"/>
      <path d="M15 8 L21 16 M21 8 L15 16" fill="none" stroke="#d400c5" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`;
  }

  if (layerName.includes("but_tracciati")) {
    const styleMap = qgisLikeLineStyle(layer, style, item);
    const c = styleMap.color || "#555";
    const oc = styleMap.outlineColor || "#fff";
    return `<svg class="legend-svg" viewBox="0 0 38 24"><line x1="4" y1="12" x2="34" y2="12" stroke="${oc}" stroke-width="7.5" stroke-linecap="round"/><line x1="4" y1="12" x2="34" y2="12" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/></svg>`;
  }

  if (style.svg) {
    return `<img class="legend-icon" src="../${style.svg}">`;
  }

  if (item?.icon) {
    return `<img class="legend-icon" src="../${item.icon}">`;
  }

  if (layerName.includes("edifici")) {
    return `<svg class="legend-svg" viewBox="0 0 38 24"><rect x="12" y="6" width="14" height="12" fill="#69c94f" stroke="#397b2c" stroke-width="1"/></svg>`;
  }

  if (layerName.includes("laghi")) {
    return `<svg class="legend-svg" viewBox="0 0 38 24"><path d="M8 14 C12 7 20 8 24 11 C28 14 31 13 33 16 C27 20 16 20 8 14Z" fill="#9fd7ff" stroke="#5aa9d6" stroke-width="1"/></svg>`;
  }

  if (layerName.includes("ghiacciai")) {
    return `<svg class="legend-svg" viewBox="0 0 38 24"><rect x="11" y="6" width="16" height="12" fill="#a7eeee" stroke="#63bdbd" stroke-width="1"/></svg>`;
  }

  const fill = style.fillColor || style.color || "#999";
  const border = style.color || fill;
  return `<span class="toc-swatch small" style="background:${fill};border-color:${border}"></span>`;
}

function updateLegend() {
  const box = document.getElementById("active-legend");
  if (box) box.innerHTML = "";
}


function butRaceLabel(value) {
  const n = norm(value);
  if (n.includes("ultra")) return "Ultra";
  if (n.includes("marathon")) return "Marathon";
  if (n.includes("race")) return "Race";
  if (n.includes("mini")) return "Mini";
  return prettifyLabel(value);
}

function butSlopeItems(layer) {
  const seen = new Set();

  return (layer.style_items || []).filter(item => {
    const label = norm(item.label);
    if (label.startsWith("but_")) return false;
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

function butRaceChildren(node) {
  return (node.children || []).filter(child => child.type === "but_group");
}


function flattenTocNodes(nodes, out = []) {
  (nodes || []).forEach(node => {
    if (node.type === "group") {
      flattenTocNodes(node.children || [], out);
    } else {
      out.push(node);
    }
  });
  return out;
}

function buildGroupedTocForDisplay(nodes) {
  const all = flattenTocNodes(nodes);
  const byId = new Map();

  all.forEach(node => {
    if (node.id) byId.set(node.id, node);
  });

  const groupDefs = [
    ["Rilievi e punti", ["vette", "selle", "poi"]],
    ["Percorsi e infrastrutture", ["but_tracciati", "sentieri", "strade", "edifici", "sbarramenti_artificiali"]],
    ["Acque e ghiacci", ["laghi", "ghiacciai", "reticolo_idrografico"]],
    ["Cartografia e limiti", ["isoipse_combo", "confine_nazionale"]]
  ];

  const used = new Set();
  const grouped = groupDefs
    .map(([name, ids]) => {
      const children = ids
        .map(id => byId.get(id))
        .filter(Boolean);

      children.forEach(node => used.add(node.id));

      return {
        type: "group",
        name,
        open: true,
        children
      };
    })
    .filter(group => group.children.length > 0);

  const other = all.filter(node => node.id && !used.has(node.id));
  if (other.length) {
    grouped.push({
      type: "group",
      name: "Altri layer",
      open: false,
      children: other
    });
  }

  return grouped;
}

function renderTree(nodes, container) {
  nodes.forEach(node => {
    if (node.type === "group") {
      const details = document.createElement("details");
      details.open = node.open ?? true;
      details.className = "toc-group-main";
      details.innerHTML = `<summary>${prettifyLabel(node.name)}</summary>`;

      const children = document.createElement("div");
      details.appendChild(children);
      container.appendChild(details);

      renderTree(node.children || [], children);
      return;
    }


    if (node.type === "combo_layer") {
      const wrapper = document.createElement("div");
      wrapper.className = "toc-item";

      const label = document.createElement("label");
      label.className = "toc-layer";
      label.dataset.layerId = node.id;
      label.innerHTML = `
        <input type="checkbox" ${node.visible ? "checked" : ""}>
        <span class="isoipse-double-symbol">
          <svg class="legend-svg" viewBox="0 0 38 12"><line x1="4" y1="6" x2="34" y2="6" stroke="#8b6f4e" stroke-width="1" stroke-dasharray="4 3" stroke-linecap="round"/></svg>
          <svg class="legend-svg" viewBox="0 0 38 12"><line x1="4" y1="6" x2="34" y2="6" stroke="#66bfc6" stroke-width="1" stroke-dasharray="2 3" stroke-linecap="round"/></svg>
        </span>
        ${prettifyLabel(node.name)}
      `;

      label.querySelector("input").onchange = async event => {
        const checked = event.target.checked;

        for (const id of node.layer_ids || []) {
          rememberLayerState(id, checked);
          checked ? await addLayer(id) : removeLayer(id);
        }

        enforceLayerOrder();
        updateLegend();
      };

      wrapper.appendChild(label);
      container.appendChild(wrapper);
      return;
    }

    if (node.type !== "layer") return;

    const layer = layersById[node.id];
    if (layer?.hidden_from_toc || isUsoSuoloLayer(layer)) return;

    if (norm(layer.name).includes("but_tracciati")) {
      const wrapper = document.createElement("div");
      wrapper.className = "toc-item toc-but";

      const mainLabel = document.createElement("label");
      mainLabel.className = "toc-layer toc-but-main";
      mainLabel.dataset.layerId = node.id;
      mainLabel.innerHTML = `
        <input type="checkbox" ${node.visible ? "checked" : ""}>
        <span>${prettifyLabel(node.name)}</span>
      `;

      mainLabel.querySelector("input").onchange = event => {
        rememberLayerState(node.id, event.target.checked);
        event.target.checked ? addLayer(node.id) : removeLayer(node.id);
      };

      wrapper.appendChild(mainLabel);

      const races = document.createElement("div");
      races.className = "toc-but-races";

      butRaceChildren(node).forEach(rule => {
        const raceLabel = document.createElement("label");
        raceLabel.className = "toc-but-race";
        raceLabel.innerHTML = `
          <input type="checkbox" checked>
          <span>${butRaceLabel(rule.name)}</span>
        `;

        raceLabel.querySelector("input").onchange = async event => {
          if (!activeButGroups[node.id]) activeButGroups[node.id] = new Set(layer.but_groups || []);
          event.target.checked ? activeButGroups[node.id].add(rule.id) : activeButGroups[node.id].delete(rule.id);
          await refreshLayer(node.id);
          enforceLayerOrder();
        };

        races.appendChild(raceLabel);
      });

      wrapper.appendChild(races);

      const slopeBox = document.createElement("div");
      slopeBox.className = "toc-but-slopes";

      butSlopeItems(layer).forEach(item => {
        const row = document.createElement("div");
        row.className = "toc-but-slope";
        row.innerHTML = `${symbolSvg(layer, item)}<span>${prettifyLabel(item.label)}</span>`;
        slopeBox.appendChild(row);
      });

      wrapper.appendChild(slopeBox);
      container.appendChild(wrapper);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "toc-item";
    const hasChildren = (node.children || []).length > 0;
    const firstStyle = (layer.style_items || [])[0];

    const label = document.createElement("label");
    label.className = "toc-layer";
    label.dataset.layerId = node.id;
    label.innerHTML = `
      <input type="checkbox" ${node.visible ? "checked" : ""}>
      ${hasChildren ? "" : symbolSvg(layer, firstStyle)}
      ${prettifyLabel(node.name)}
    `;

    label.querySelector("input").onchange = event => {
      rememberLayerState(node.id, event.target.checked);
      event.target.checked ? addLayer(node.id) : removeLayer(node.id);
    };

    wrapper.appendChild(label);

    (node.children || []).forEach(rule => {
      const ruleLabel = document.createElement("label");
      ruleLabel.className = "toc-rule";

      const item = styleItem(layer, rule.id);
      const groupItem = rule.type === "but_group"
        ? (layer.style_items || []).find(x => (x.toc_group || "") === rule.id && !norm(x.label).startsWith("but_"))
        : null;
      const icon = rule.type === "but_group"
        ? (groupItem ? symbolSvg(layer, groupItem) : "")
        : item
          ? symbolSvg(layer, item)
          : "";

      ruleLabel.innerHTML = `
        <input type="checkbox" checked>
        ${icon}
        ${prettifyLabel(rule.name)}
      `;

      ruleLabel.querySelector("input").onchange = async event => {
        if (rule.type === "but_group") {
          if (!activeButGroups[node.id]) activeButGroups[node.id] = new Set(layer.but_groups || []);
          event.target.checked ? activeButGroups[node.id].add(rule.id) : activeButGroups[node.id].delete(rule.id);
        } else {
          if (!activeStyleIds[node.id]) activeStyleIds[node.id] = new Set((node.children || []).map(child => child.id));
          event.target.checked ? activeStyleIds[node.id].add(rule.id) : activeStyleIds[node.id].delete(rule.id);
        }

        await refreshLayer(node.id);
      };

      wrapper.appendChild(ruleLabel);
    });

    container.appendChild(wrapper);
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
  const sourcesToggle = document.getElementById("sources-toggle");
  const sourcesPanel = document.getElementById("sources-panel");
  const sourcesClose = document.getElementById("sources-close");

  sourcesToggle.onclick = () => sourcesPanel.classList.toggle("hidden");
  sourcesClose.onclick = () => sourcesPanel.classList.add("hidden");

  document.getElementById("sidebar-toggle").onclick = event => {
    const sidebar = document.getElementById("sidebar");
    sidebar.classList.toggle("closed");
    event.currentTarget.classList.toggle("closed", sidebar.classList.contains("closed"));
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
  renderTree(buildGroupedTocForDisplay(config.toc), document.getElementById("toc"));
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
