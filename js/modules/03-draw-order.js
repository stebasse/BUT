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
