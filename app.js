const LOCAL_DATA_URLS = ["./launches.json", "./dist/launches.json"];
const PRIMARY_API_URL =
  "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=20&ordering=net";
const FALLBACK_API_URL = "https://fdo.rocketlaunch.live/json/launches/next/20";
const DATA_REFRESH_MS = 5 * 60 * 1000;
const MAX_VISIBLE_LAUNCHES = 10;
const DEFAULT_MAP_VIEW = [18, 10];
const DEFAULT_MAP_ZOOM = 2;
const FOCUS_MAP_ZOOM = 5;
const NEXT_LAUNCH_COLOR = "#66f0d0";
const SITE_SEPARATOR = " \u2022 ";
const CURATED_ROCKET_IMAGES = [
  {
    matchers: ["falcon heavy"],
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Falcon%20Heavy%20cropped.jpg",
  },
  {
    matchers: ["falcon 9"],
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/SpaceX%20Falcon%209.jpg",
  },
  {
    matchers: ["atlas v 551", "atlas v"],
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Atlas%20V%20551%20launches%20with%20New%20Horizons.jpg",
  },
  {
    matchers: ["soyuz 2.1a", "soyuz-5", "soyuz"],
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Soyuz%20rocket.jpg",
  },
];

const SITE_COORDINATE_LOOKUP = [
  {
    matchers: ["vandenberg", "space launch complex 4e"],
    latitude: 34.6321,
    longitude: -120.6106,
    precision: "launch site",
  },
  {
    matchers: [
      "cape canaveral sfs",
      "space launch complex 40",
      "launch complex 36a",
      "space launch complex 41",
    ],
    latitude: 28.5619,
    longitude: -80.5772,
    precision: "spaceport region",
  },
  {
    matchers: ["kennedy space center", "launch complex 39a"],
    latitude: 28.6084,
    longitude: -80.6043,
    precision: "launch site",
  },
  {
    matchers: ["guiana space centre", "ariane launch area 4", "ariane launch area 1"],
    latitude: 5.239,
    longitude: -52.768,
    precision: "spaceport region",
  },
  {
    matchers: ["jiuquan satellite launch center", "launch area 130", "launch area 94", "launch area 96a"],
    latitude: 40.9606,
    longitude: 100.2983,
    precision: "spaceport region",
  },
  {
    matchers: ["wenchang space launch site"],
    latitude: 19.6144,
    longitude: 110.9511,
    precision: "launch site",
  },
  {
    matchers: ["mahia peninsula", "rocket lab launch complex 1"],
    latitude: -39.2615,
    longitude: 177.8649,
    precision: "launch site",
  },
  {
    matchers: ["baikonur cosmodrome", "31/6", "45/1"],
    latitude: 45.9647,
    longitude: 63.305,
    precision: "spaceport region",
  },
  {
    matchers: ["haiyang oriental spaceport", "south china sea"],
    latitude: 36.5323,
    longitude: 121.1828,
    precision: "approximate region",
  },
];

const nextLaunchContent = document.getElementById("next-launch-content");
const launchList = document.getElementById("launch-list");
const launchCardTemplate = document.getElementById("launch-card-template");
const updatedAt = document.getElementById("updated-at");
const launchDataScript = document.getElementById("launch-data");
const mapElement = document.getElementById("mission-map");
const mapStatus = document.getElementById("map-status");

let launches = [];
let countdownInterval;
let map;
let markerLayer;
let markerByLaunchId = new Map();
let activeLaunchId = null;

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseCoordinate(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeSiteLabel(site) {
  return (site || "Site pending")
    .replaceAll("Ã¢â‚¬Â¢", SITE_SEPARATOR)
    .replaceAll("Äâ‚¬Â¢", SITE_SEPARATOR)
    .replaceAll("â€¢", SITE_SEPARATOR)
    .replaceAll("•", SITE_SEPARATOR)
    .replace(/\s+\|\s+/g, SITE_SEPARATOR)
    .trim();
}

function normalizeRocketImage(rocketImage) {
  if (typeof rocketImage !== "string") {
    return null;
  }

  const trimmed = rocketImage.trim();
  if (!trimmed) {
    return null;
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function getCuratedRocketImage(rocketName) {
  const normalizedRocket = String(rocketName || "").toLowerCase();
  const match = CURATED_ROCKET_IMAGES.find(({ matchers }) =>
    matchers.some((matcher) => normalizedRocket.includes(matcher))
  );

  return match?.url || null;
}

function inferCoordinatesFromSite(site) {
  const normalizedSite = normalizeSiteLabel(site).toLowerCase();

  return (
    SITE_COORDINATE_LOOKUP.find(({ matchers }) =>
      matchers.some((matcher) => normalizedSite.includes(matcher))
    ) || null
  );
}

function resolveLocationDetails({ site, latitude, longitude }) {
  const parsedLatitude = parseCoordinate(latitude);
  const parsedLongitude = parseCoordinate(longitude);

  if (parsedLatitude !== null && parsedLongitude !== null) {
    return {
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      precision: "launch site",
    };
  }

  const fallback = inferCoordinatesFromSite(site);
  if (!fallback) {
    return {
      latitude: null,
      longitude: null,
      precision: null,
    };
  }

  return {
    latitude: fallback.latitude,
    longitude: fallback.longitude,
    precision: fallback.precision,
  };
}

function createLaunchRecord({
  mission,
  rocket,
  rocketImage,
  site,
  net,
  latitude,
  longitude,
  locationPrecision,
}) {
  const location = resolveLocationDetails({ site, latitude, longitude });
  const normalizedSite = normalizeSiteLabel(site);
  const rocketName = rocket || "Rocket pending";

  return {
    id: `${mission || "mission-pending"}-${net.toISOString()}-${normalizedSite}`.toLowerCase(),
    mission: mission || "Mission pending",
    rocket: rocketName,
    rocketImage: normalizeRocketImage(rocketImage) || getCuratedRocketImage(rocketName),
    site: normalizedSite,
    net,
    latitude: location.latitude,
    longitude: location.longitude,
    locationPrecision: locationPrecision || location.precision,
  };
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

      return createLaunchRecord({
        mission: item.mission?.name || item.name,
        rocket:
          item.rocket?.configuration?.full_name || item.rocket?.configuration?.name,
        rocketImage:
          item.rocket?.configuration?.image_url ||
          item.image?.image_url ||
          item.image_url ||
          null,
        site: [item.pad?.name, item.pad?.location?.name, item.pad?.location?.country_code]
          .filter(Boolean)
          .join(SITE_SEPARATOR),
        net,
        latitude: item.pad?.latitude,
        longitude: item.pad?.longitude,
      });
    })
    .filter(Boolean);
}

function normalizeFallbackLaunches(data) {
  const results = Array.isArray(data.result)
    ? data.result
    : Array.isArray(data.response?.result)
      ? data.response.result
      : [];

  if (!results.length) {
    return [];
  }

  return results
    .map((item) => {
      const candidate = item.t0 || item.win_open || item.sort_date * 1000;
      const net = parseDate(candidate);
      if (!net) {
        return null;
      }

      const firstMission = Array.isArray(item.missions) ? item.missions[0] : null;
      const locationName = item.pad?.location?.name || item.pad?.location || "";

      return createLaunchRecord({
        mission: firstMission?.name || item.name,
        rocket: item.vehicle?.name,
        rocketImage: item.vehicle?.image_url || item.vehicle?.image?.image_url || null,
        site: [item.pad?.name, locationName].filter(Boolean).join(SITE_SEPARATOR),
        net,
        latitude: item.pad?.latitude,
        longitude: item.pad?.longitude,
      });
    })
    .filter(Boolean);
}

function normalizeLocalLaunches(data) {
  if (!Array.isArray(data.launches)) {
    return [];
  }

  return data.launches
    .map((item) => {
      const net = parseDate(item.net);
      if (!net) {
        return null;
      }

      return createLaunchRecord({
        mission: item.mission,
        rocket: item.rocket,
        rocketImage: item.rocketImage,
        site: item.site,
        net,
        latitude: item.latitude,
        longitude: item.longitude,
        locationPrecision: item.locationPrecision,
      });
    })
    .filter(Boolean);
}

function loadInlineLaunches() {
  if (!launchDataScript?.textContent) {
    return [];
  }

  const data = JSON.parse(launchDataScript.textContent);
  if (!Array.isArray(data.launches) || !data.launches.length) {
    return [];
  }

  const normalized = normalizeLocalLaunches(data);
  if (!normalized.length) {
    return [];
  }

  launches = normalized;
  updateTimestamp(data.source || "Live feed");
  renderNextLaunch();
  renderLaunchList();
  renderMissionMap();
  return normalized;
}

function formatLaunchDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function getRocketName(launch) {
  return launch.rocket || "Rocket pending";
}

function getLaunchSite(launch) {
  return launch.site || "Site pending";
}

function getVisibleLaunches() {
  const now = Date.now();
  const upcomingLaunches = launches
    .filter((launch) => launch.net.getTime() > now)
    .sort((a, b) => a.net.getTime() - b.net.getTime());

  return (upcomingLaunches.length ? upcomingLaunches : launches).slice(0, MAX_VISIBLE_LAUNCHES);
}

function getNextLaunch() {
  return launches.find((launch) => launch.net.getTime() > Date.now()) || launches[0] || null;
}

function getCountdownParts(targetDate) {
  const diff = targetDate.getTime() - Date.now();
  if (diff <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { expired: false, days, hours, minutes, seconds };
}

function buildCountdownMarkup(targetDate) {
  const parts = getCountdownParts(targetDate);
  if (parts.expired) {
    return '<p class="launch-meta">Liftoff window reached. Fetching newest data...</p>';
  }

  return `
    <div class="countdown-grid" aria-label="Launch countdown">
      <div class="time-box"><span class="time-value">${String(parts.days).padStart(2, "0")}</span><span class="time-label">Days</span></div>
      <div class="time-box"><span class="time-value">${String(parts.hours).padStart(2, "0")}</span><span class="time-label">Hours</span></div>
      <div class="time-box"><span class="time-value">${String(parts.minutes).padStart(2, "0")}</span><span class="time-label">Minutes</span></div>
      <div class="time-box"><span class="time-value">${String(parts.seconds).padStart(2, "0")}</span><span class="time-label">Seconds</span></div>
    </div>
  `;
}

function renderNextLaunch() {
  const next = getNextLaunch();

  if (!next) {
    nextLaunchContent.innerHTML = '<p class="error">No upcoming launches found right now.</p>';
    return;
  }

  const nextDate = next.net;
  const mission = next.mission || "Mission name pending";
  const rocket = getRocketName(next);
  const site = getLaunchSite(next);
  const dateLine = formatLaunchDate(nextDate);

  nextLaunchContent.innerHTML = `
    <div class="next-mission-line">
      <span class="live-dot" aria-hidden="true"></span>
      <h3 class="next-mission">${mission}</h3>
    </div>
    <p class="next-subline">${rocket}</p>
    <div id="countdown-region">${buildCountdownMarkup(nextDate)}</div>
    <p class="launch-meta">Launch Site: ${site}</p>
    <p class="launch-meta">Scheduled: ${dateLine}</p>
  `;

  const countdownRegion = document.getElementById("countdown-region");
  clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    countdownRegion.innerHTML = buildCountdownMarkup(nextDate);

    const parts = getCountdownParts(nextDate);
    if (parts.expired) {
      clearInterval(countdownInterval);
      loadLaunches();
    }
  }, 1000);
}

function selectLaunch(launchId, options = {}) {
  activeLaunchId = launchId;

  launchList.querySelectorAll(".launch-card").forEach((card) => {
    const isActive = card.dataset.launchId === launchId;
    card.classList.toggle("is-active", isActive);
    card.setAttribute("aria-pressed", String(isActive));
  });

  const marker = markerByLaunchId.get(launchId);
  if (!marker) {
    return;
  }

  if (options.openPopup !== false) {
    marker.openPopup();
  }

  if (options.panTo !== false && map) {
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), FOCUS_MAP_ZOOM), {
      animate: true,
      duration: 0.75,
    });
  }
}

function bindLaunchCardInteractions(card, launch) {
  card.dataset.launchId = launch.id;
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-pressed", "false");

  const activate = () => selectLaunch(launch.id);
  card.addEventListener("click", activate);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  });
}

function renderLaunchList() {
  launchList.innerHTML = "";

  const visibleLaunches = getVisibleLaunches();
  if (!visibleLaunches.length) {
    launchList.innerHTML = '<p class="error">No launch records available.</p>';
    return;
  }

  visibleLaunches.forEach((launch) => {
    const clone = launchCardTemplate.content.cloneNode(true);
    const card = clone.querySelector(".launch-card");
    const missionName = clone.querySelector(".mission-name");
    const rocketTag = clone.querySelector(".rocket-tag");
    const rocketChip = clone.querySelector(".rocket-chip");
    const rocketPhoto = clone.querySelector(".rocket-photo");
    const rocketFact = clone.querySelector(".rocket-fact");
    const siteFact = clone.querySelector(".site-fact");
    const launchTime = clone.querySelector(".launch-time");

    missionName.textContent = launch.mission || "Mission pending";
    rocketTag.textContent = getRocketName(launch);
    rocketChip.classList.toggle("photo-missing", !launch.rocketImage);
    if (launch.rocketImage) {
      rocketPhoto.src = launch.rocketImage;
      rocketPhoto.alt = `${getRocketName(launch)} rocket`;
      rocketPhoto.hidden = false;
      rocketPhoto.onerror = () => {
        rocketPhoto.hidden = true;
        rocketChip.classList.add("photo-missing");
      };
    } else {
      rocketPhoto.removeAttribute("src");
      rocketPhoto.alt = "";
      rocketPhoto.hidden = true;
    }
    rocketFact.textContent = getRocketName(launch);
    siteFact.textContent = getLaunchSite(launch);
    launchTime.textContent = `Scheduled: ${formatLaunchDate(launch.net)}`;

    bindLaunchCardInteractions(card, launch);
    launchList.appendChild(clone);
  });
}

function ensureMap() {
  if (map || !mapElement || typeof window.L === "undefined") {
    return map;
  }

  map = window.L.map(mapElement, {
    scrollWheelZoom: true,
    worldCopyJump: true,
  }).setView(DEFAULT_MAP_VIEW, DEFAULT_MAP_ZOOM);

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 7,
    minZoom: 2,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  markerLayer = window.L.layerGroup().addTo(map);
  return map;
}

function buildPopupContent(launch) {
  const precision = launch.locationPrecision
    ? `<p class="map-popup-note">Location accuracy: ${escapeHtml(launch.locationPrecision)}</p>`
    : "";

  return `
    <div class="map-popup">
      <h3>${escapeHtml(launch.mission)}</h3>
      <p>${escapeHtml(getRocketName(launch))}</p>
      <p>${escapeHtml(getLaunchSite(launch))}</p>
      <p>${escapeHtml(formatLaunchDate(launch.net))}</p>
      ${precision}
    </div>
  `;
}

function getMarkerStyle(launch) {
  const nextLaunch = getNextLaunch();
  const isNextLaunch = nextLaunch && nextLaunch.id === launch.id;

  if (isNextLaunch) {
    return {
      radius: 10,
      weight: 2,
      color: NEXT_LAUNCH_COLOR,
      fillColor: NEXT_LAUNCH_COLOR,
      fillOpacity: 1,
    };
  }

  return {
      radius: 7,
      weight: 2,
      color: "#3f5878",
      fillColor: "#9eb0cf",
      fillOpacity: 0.75,
  };
}

function renderMissionMap() {
  if (!ensureMap()) {
    if (mapStatus) {
      mapStatus.textContent = "Map library unavailable";
    }
    return;
  }

  const visibleLaunches = getVisibleLaunches();
  const mappableLaunches = visibleLaunches.filter(
    (launch) => launch.latitude !== null && launch.longitude !== null
  );

  markerLayer.clearLayers();
  markerByLaunchId.clear();

  if (!mappableLaunches.length) {
    if (mapStatus) {
      mapStatus.textContent = "No mapped launch sites available right now";
    }
    map.setView(DEFAULT_MAP_VIEW, DEFAULT_MAP_ZOOM);
    return;
  }

  const bounds = [];
  mappableLaunches.forEach((launch) => {
    const marker = window.L.circleMarker(
      [launch.latitude, launch.longitude],
      getMarkerStyle(launch)
    );

    marker.bindPopup(buildPopupContent(launch));
    marker.on("click", () => selectLaunch(launch.id, { panTo: false }));
    marker.on("popupopen", () => selectLaunch(launch.id, { openPopup: false, panTo: false }));

    marker.addTo(markerLayer);
    markerByLaunchId.set(launch.id, marker);
    bounds.push([launch.latitude, launch.longitude]);
  });

  const missingCount = visibleLaunches.length - mappableLaunches.length;
  if (mapStatus) {
    mapStatus.textContent =
      missingCount > 0
        ? `${mappableLaunches.length} of ${visibleLaunches.length} missions mapped`
        : `${mappableLaunches.length} missions mapped`;
  }

  if (bounds.length === 1) {
    map.setView(bounds[0], FOCUS_MAP_ZOOM);
  } else {
    map.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 4,
    });
  }

  window.setTimeout(() => map.invalidateSize(), 0);

  const nextSelectableLaunch =
    activeLaunchId && markerByLaunchId.has(activeLaunchId)
      ? activeLaunchId
      : mappableLaunches[0]?.id || visibleLaunches[0]?.id;

  if (nextSelectableLaunch) {
    selectLaunch(nextSelectableLaunch, { panTo: false });
  }
}

function updateTimestamp(sourceName) {
  updatedAt.textContent = `Updated ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date())}${SITE_SEPARATOR}${sourceName}`;
}

async function loadLocalLaunches() {
  let lastError;

  for (const url of LOCAL_DATA_URLS) {
    try {
      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`Local launch feed returned ${response.status} for ${url}`);
      }

      const data = await response.json();
      const normalized = normalizeLocalLaunches(data);

      if (!normalized.length) {
        throw new Error(`Local launch feed contained no usable launches for ${url}`);
      }

      launches = normalized;
      updateTimestamp(data.source || "Local feed");
      renderNextLaunch();
      renderLaunchList();
      renderMissionMap();
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to load any local launch feed");
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API responded with ${response.status} for ${url}`);
  }

  return response.json();
}

async function loadLaunches() {
  const provisionalLaunches = loadInlineLaunches();

  try {
    if (!provisionalLaunches.length) {
      await loadLocalLaunches();
    }

    try {
      const primaryData = await fetchJson(PRIMARY_API_URL);
      launches = normalizePrimaryLaunches(primaryData);

      if (!launches.length) {
        throw new Error("Primary API returned no usable launch data");
      }

      updateTimestamp("Space Devs");
      renderNextLaunch();
      renderLaunchList();
      renderMissionMap();
      return;
    } catch (primaryError) {
      try {
        const fallbackData = await fetchJson(FALLBACK_API_URL);
        launches = normalizeFallbackLaunches(fallbackData);

        if (!launches.length) {
          throw new Error("Fallback API returned no usable launch data");
        }

        updateTimestamp("RocketLaunch Live");
        renderNextLaunch();
        renderLaunchList();
        renderMissionMap();
      } catch (fallbackError) {
        if (launches.length) {
          console.error(primaryError);
          console.error(fallbackError);
          return;
        }

        nextLaunchContent.innerHTML =
          '<p class="error">Unable to reach live launch feed. Please try again in a moment.</p>';
        launchList.innerHTML =
          '<p class="error">Launch queue unavailable due to a network or API issue.</p>';
        if (mapStatus) {
          mapStatus.textContent = "Map unavailable";
        }
        updatedAt.textContent = "Update failed";
        console.error(primaryError);
        console.error(fallbackError);
      }
    }
  } catch (localError) {
    nextLaunchContent.innerHTML =
      '<p class="error">Unable to reach live launch feed. Please try again in a moment.</p>';
    launchList.innerHTML =
      '<p class="error">Launch queue unavailable due to a network or API issue.</p>';
    if (mapStatus) {
      mapStatus.textContent = "Map unavailable";
    }
    updatedAt.textContent = "Update failed";
    console.error(localError);
  }
}

loadLaunches();
setInterval(loadLaunches, DATA_REFRESH_MS);
