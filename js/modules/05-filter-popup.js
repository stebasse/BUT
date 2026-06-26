function activeBut(layer, feature) {
  const set = activeButGroups[layer.id];
  const group = feature.properties?.Tracciato || feature.properties?.tracciato || feature.properties?.__toc_group;

  return !set || !group || set.has(group);
}

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
