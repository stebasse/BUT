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

function renderTree(nodes, container) {
  nodes.forEach(node => {
    if (node.type === "group") {
      const details = document.createElement("details");
      details.open = node.open ?? true;
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
