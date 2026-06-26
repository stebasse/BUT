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

function firstValue(props, names) {
  for (const name of names) {
    if (props[name] !== undefined && props[name] !== null && props[name] !== "") {
      return props[name];
    }
  }

  return null;
}
