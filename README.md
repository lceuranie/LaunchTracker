# LaunchTracker

Live launch monitoring dashboard for upcoming rocket missions worldwide.

## Features

- Real upcoming launch data from The Space Devs Launch Library 2 API
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

- API: `https://ll.thespacedevs.com/2.2.0/launch/upcoming/`
- Provider: The Space Devs Launch Library 2
