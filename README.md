# PRDR to JPEG / PNG Converter

A 100% client-side web tool to convert Red Dead Redemption 2 and RedM Photo Mode (`PRDR`) files into  **JPEG (`.jpg`)** or **PNG (`.png`)** images directly in your browser. No files are ever uploaded to any server.

## How PRDR Files Work

Red Dead Redemption 2 stores in-game Photo Mode captures as extensionless `PRDR*` files containing an embedded JPEG stream wrapped in a Rockstar binary container:

- `0x0000..0x0003`: Format version (`4`, big-endian `uint32`).
- `0x0004..0x0103`: 256-byte UTF-16LE capture label (`PHOTO - MM/DD/YY HH:MM:SS`).
- `0x0120..0x012B` (offset `288`): `"JPEG"` chunk header followed by the allocated buffer size (`uint32 LE`, typically 1 MiB) and exact JPEG byte length (`uint32 LE`).
- `0x012C` (offset `300`): Raw JPEG stream (`FF D8 FF E0 ... FF D9`).
- Trailing chunks after the 1 MiB JPEG buffer: `"JSON"` (resolution, game mode `SP`/`MP`, coordinates, `creat` timestamp, in-game 1899 time), `"TITL"` (location title), `"DESC"` (photo description), and `"JEND"`.

### JPEG vs PNG Output

- **JPEG (Original)**: Extracts the exact embedded JPEG bytes (`offset 300` up to `jpegLength`, or trimmed cleanly at `FF D9`) without re-encoding or trailing Rockstar padding.
- **PNG**: Decodes the extracted JPEG locally using the browser Canvas API and exports an uncompressed PNG.

## Where to Find PRDR Files on PC

- **Red Dead Redemption 2 (PC)**: `Documents\Rockstar Games\Red Dead Redemption 2\Profiles\<ProfileID>\`
- **RedM**: `%UserProfile%\Saved Games\CitizenFX\RDR2\`

## Publishing on GitHub Pages

This project includes [.github/workflows/deploy.yml](.github/workflows/deploy.yml) configured for automatic deployment to GitHub Pages (`https://seaque.github.io/rdr2-prdr-converter/`):

1. Push the repository to GitHub under the `main` branch.
2. Open **Settings → Pages** in your GitHub repository and set **Source** to **GitHub Actions**.
3. If deploying to a different repository name or a custom domain, update `VITE_BASE_PATH` (defaults to `/rdr2-prdr-converter/` in `vite.config.ts`) and update the canonical / Open Graph / JSON-LD URLs in `index.html`.

## Development

```bash
npm install
npm run dev        # Start Vite dev server on port 3000
npm run lint       # Run ESLint
npm run coverage   # Run Vitest with 100% coverage thresholds
npm run build      # Type-check and build production bundle
```
