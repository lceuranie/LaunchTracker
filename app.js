const PRIMARY_API_URL =
  "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=20&ordering=net";
const FALLBACK_API_URL = "https://fdo.rocketlaunch.live/json/launches/next/20";
const DATA_REFRESH_MS = 5 * 60 * 1000;

const nextLaunchContent = document.getElementById("next-launch-content");
const launchList = document.getElementById("launch-list");
const launchCardTemplate = document.getElementById("launch-card-template");
const updatedAt = document.getElementById("updated-at");

let launches = [];
let countdownInterval;

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
        net,
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
        net,
      };
    })
    .filter(Boolean);
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
  const next = launches.find((launch) => launch.net.getTime() > Date.now());

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
    <h3 class="next-mission">${mission}</h3>
    <p class="next-subline">${rocket}</p>
    <div id="countdown-region">${buildCountdownMarkup(nextDate)}</div>
    <p class="launch-meta">Launch Site: ${site}</p>
    <p class="launch-meta">Scheduled: ${dateLine}</p>
  `;

  const countdownRegion = document.getElementById("countdown-region");
  clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    countdownRegion.innerHTML = buildCountdownMarkup(nextDate);

    // Refresh launch data right after liftoff so the next mission appears.
    const parts = getCountdownParts(nextDate);
    if (parts.expired) {
      clearInterval(countdownInterval);
      loadLaunches();
    }
  }, 1000);
}

function renderLaunchList() {
  launchList.innerHTML = "";

  if (!launches.length) {
    launchList.innerHTML = '<p class="error">No launch records available.</p>';
    return;
  }

  launches.slice(0, 10).forEach((launch) => {
    const clone = launchCardTemplate.content.cloneNode(true);
    const missionName = clone.querySelector(".mission-name");
    const rocketTag = clone.querySelector(".rocket-tag");
    const launchTime = clone.querySelector(".launch-time");
    const launchSite = clone.querySelector(".launch-site");

    missionName.textContent = launch.mission || "Mission pending";
    rocketTag.textContent = getRocketName(launch);
    launchTime.textContent = `Scheduled: ${formatLaunchDate(launch.net)}`;
    launchSite.textContent = `Site: ${getLaunchSite(launch)}`;

    launchList.appendChild(clone);
  });
}

function updateTimestamp(sourceName) {
  updatedAt.textContent = `Updated ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date())} • ${sourceName}`;
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
  try {
    const primaryData = await fetchJson(PRIMARY_API_URL);
    launches = normalizePrimaryLaunches(primaryData);

    if (!launches.length) {
      throw new Error("Primary API returned no usable launch data");
    }

    updateTimestamp("Space Devs");
    renderNextLaunch();
    renderLaunchList();
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
    } catch (fallbackError) {
      nextLaunchContent.innerHTML =
        '<p class="error">Unable to reach live launch feed. Please try again in a moment.</p>';
      launchList.innerHTML =
        '<p class="error">Launch queue unavailable due to a network or API issue.</p>';
      updatedAt.textContent = "Update failed";
      console.error(primaryError);
      console.error(fallbackError);
    }
  }
}

loadLaunches();
setInterval(loadLaunches, DATA_REFRESH_MS);
