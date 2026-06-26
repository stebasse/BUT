function styleItem(layer, id) {
  return (layer.style_items || []).find(item => item.id === id);
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
    return `<img class="legend-icon" src="${style.svg}">`;
  }

  if (item?.icon) {
    return `<img class="legend-icon" src="${item.icon}">`;
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
