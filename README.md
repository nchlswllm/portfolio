# Nicholas Miller — Selected Works

A buildless portfolio with a text index and project galleries. Serve this folder
with `node scripts/serve.mjs`, then visit `http://127.0.0.1:8000`.

## Editing projects

- `projects.js` contains images. Entries with the same lowercase `id` share a
  project gallery. Project order follows the first occurrence of each ID; images
  follow their order in the file.
- `project-details.js` contains display titles and caption settings. Add a matching
  entry for a new project. Set `showCaption: false` to hide its project caption.
- Galleries show landscape images full width and pair portrait/square images.
  Mobile shows one image per row. Single-image projects always fill the width.
- Optional project settings override the default layout: `order` lists filenames
  in reading order; `layout: "single"` makes every image full width; `compact`
  lists images for a half-width desktop row. `focal` specifies a featured `image`
  with `left` and `right` filename stacks; mobile shows that image first.
- Captions use the project title and the year or year range derived from image
  metadata. Set `year: "2024–2025"` on a project detail to override that range.
- Individual image metadata names are used for alt text, never visible captions.
- Project links use `/#project/helix_motors`; Contact uses `/#contact`.

## Adding images

1. Put the original file in `images/` and add its entry to `projects.js`.
2. Run `node scripts/build-images.mjs` (requires ImageMagick with AVIF/WebP support).
3. Include the generated `images/opt/` files and both image manifests when publishing.

The image builder still uses `transform.scale` as its base generated width. For a
new image, a value around 400 generates multiple sizes up to the source width.
The gallery uses manifest dimensions for its touching, uncropped rows and selects
responsive AVIF/WebP assets. Originals remain available as a fallback. Regenerate
the manifests after adding an image so the gallery knows its aspect ratio.

## Legacy layout

Existing transforms, `editor.js`, `state.js`, `world-layout.js`, and layout utilities
are retained from the infinite canvas. They are not loaded by the new index.
Canvas layout commands are unnecessary for the current site.

The existing static hosting setup and custom domain are unchanged. No package
installation or framework build is required.
