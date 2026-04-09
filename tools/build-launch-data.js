const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "..", "dist");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "launches.json");
const TEMPLATE_FILE = path.join(__dirname, "..", "index.html");
const OUTPUT_HTML_FILE = path.join(OUTPUT_DIR, "index.html");

const PRIMARY_API_URL =
  "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=20&ordering=net";
const FALLBACK_API_URL = "https://fdo.rocketlaunch.live/json/launches/next/20";

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIso(date) {
  return date.toISOString();
}

function normalizePrimaryLaunches(data) {
  if (!Array.isArray(data.results)) {
    return [];
  }

  return data.results
    .map((item) => {
      const net = parseDate(item.net);
      if (!net) {
        return null;
      }

      return {
        mission: item.mission?.name || item.name || "Mission pending",
        rocket:
          item.rocket?.configuration?.full_name ||
          item.rocket?.configuration?.name ||
          "Rocket pending",
        site:
          [item.pad?.name, item.pad?.location?.name, item.pad?.location?.country_code]
            .filter(Boolean)
            .join(" • ") || "Site pending",
        net: formatIso(net),
      };
    })
    .filter(Boolean);
}

function normalizeFallbackLaunches(data) {
  if (!Array.isArray(data.result)) {
    return [];
  }

  return data.result
    .map((item) => {
      const candidate = item.t0 || item.win_open || item.sort_date * 1000;
      const net = parseDate(candidate);
      if (!net) {
        return null;
      }

      const firstMission = Array.isArray(item.missions) ? item.missions[0] : null;
      const locationName = item.pad?.location?.name || item.pad?.location || "";

      return {
        mission: firstMission?.name || item.name || "Mission pending",
        rocket: item.vehicle?.name || "Rocket pending",
        site: [item.pad?.name, locationName].filter(Boolean).join(" • ") || "Site pending",
        net: formatIso(net),
      };
    })
    .filter(Boolean);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`API responded with ${response.status} for ${url}`);
  }

  return response.json();
}

async function build() {
  let source = "Space Devs";
  let launches = [];

  try {
    const primaryData = await fetchJson(PRIMARY_API_URL);
    launches = normalizePrimaryLaunches(primaryData);
    if (!launches.length) {
      throw new Error("Primary API returned no usable launch data");
    }
  } catch (primaryError) {
    const fallbackData = await fetchJson(FALLBACK_API_URL);
    launches = normalizeFallbackLaunches(fallbackData);
    source = "RocketLaunch Live";

    if (!launches.length) {
      throw new Error("Fallback API returned no usable launch data");
    }

    console.error(primaryError);
  }

  const payload = {
    source,
    generatedAt: new Date().toISOString(),
    launches,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const template = fs.readFileSync(TEMPLATE_FILE, "utf8");
  const safeJson = JSON.stringify(payload, null, 2).replace(/</g, "\\u003c");
  const renderedHtml = template.replace(
    '{"source":"Build pending","generatedAt":"","launches":[]}',
    safeJson
  );

  if (renderedHtml === template) {
    throw new Error("Could not locate inline launch data placeholder in index.html");
  }

  fs.writeFileSync(OUTPUT_HTML_FILE, renderedHtml, "utf8");
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${launches.length} launches to ${OUTPUT_FILE}`);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
