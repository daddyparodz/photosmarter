# Photosmarter

This project is a simplified and mobile-friendly web interface for the HP Photosmart scanner. It can be configured to save the scanned photo or document on your **filesystem** or a remote location via **WebDAV** (e.g. Nextcloud). PDF scans are performed via eSCL (AirScan) when available.

![Screenshot of Desktop UI](pictures/screenshot_ui_desktop.png)

**Note:** I have tested it using the HP Photosmart 5520 and HP ENVY Photo 6200 All-in-One Printer series. I cannot guarantee that it works with other Photosmart models.

## Installation

- Rename `.env.example` to `.env` and configure it with your printer IP and storage settings. `.env` is loaded at runtime.
- Install dependencies with `npm install` or `yarn install`.
- Run `yarn build`/`npm run build` followed by `yarn start`/`npm run start`.
- Optionally via docker: `docker compose up -d`.

## Development

Ensure `.env` is configured (copy `.env.example`) and dependencies are installed.

Start the dev server with hot reload:
- `npm run dev` (or `yarn dev`)
- To expose on the network: `npm run dev -- --host 0.0.0.0`

## Credits

Thanks to [pyscanner](https://github.com/amlweems/pyscanner).
I've used their source code for initial directions regarding the communication with the Photosmart scanner.
