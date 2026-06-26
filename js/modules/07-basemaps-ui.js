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
