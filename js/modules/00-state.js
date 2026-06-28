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
    label: "Personalizzata",
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
