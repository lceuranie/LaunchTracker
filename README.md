# LaunchTracker

Live launch monitoring dashboard for upcoming rocket missions worldwide.

## Features

- Real upcoming launch data generated from live APIs at deploy time
- Live countdown to the next launch (updates every second)
- Mission name, rocket type, launch site, and launch date/time
- Responsive, polished interface for desktop and mobile

## Local preview

Because this is a static site, you can open `index.html` directly in a browser.

## Publish to GitHub Pages

1. Create a GitHub repository and push this folder.
2. In GitHub, open repository **Settings** > **Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to the `main` branch.
5. The workflow in `.github/workflows/deploy-pages.yml` will deploy automatically.

After deployment, your site URL will be shown in the Actions run summary and Pages settings.

## Data source

- Primary API: The Space Devs Launch Library 2
- Fallback API: RocketLaunch Live
- The GitHub Actions workflow fetches current launch data, writes `launches.json`, and deploys the site from the generated `dist` folder.
