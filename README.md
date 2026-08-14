# Adding images

Images are never linked to at full resolution. `scripts/build-images.mjs` generates
small AVIF/WebP tiles for each image, and `gallery.js` renders those via `<picture>`.

## Steps

1. Drop the full-resolution file into `images/` (next to the others).
2. Add an entry for it in `projects.js`, including `transform.scale` — this is the
   width (in canvas px) the image displays at, and it's what the build script uses
   to decide how large the generated tiles need to be. Use curator mode (`` ` ``) to
   place it and `copy_transform` to get the values.
3. Run the build script:

   ```
   node scripts/build-images.mjs
   ```

4. Commit the original in `images/`, the new files it generated under `images/opt/`,
   and `images/manifest.js` / `images/manifest.json`.

That's it — the script only (re)generates tiles for images that are new or whose
`transform.scale` changed, so re-running it after adding one image is fast.

## Flags

- `--force` — regenerate everything, ignoring the manifest cache. Use this after
  changing encoder settings in the script (quality, tier multipliers, etc).

## Notes

- Requires ImageMagick (`magick`) on `PATH` with AVIF + WebP support.
- If an image is referenced in `projects.js` but hasn't been run through the script
  yet, `gallery.js` falls back to loading the original file directly, so nothing
  breaks — it's just unoptimized until you run the build.
- The four tier widths generated per image are `scale × 1, 2, 4, 8`, clamped to the
  source's native width. That covers sharp rendering up to 4x zoom on a 2x/retina
  display.
