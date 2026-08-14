#!/usr/bin/env node
// Generates responsive AVIF/WebP derivatives for every image referenced in
// projects.js, and writes images/manifest.js for gallery.js to consume.
//
// Usage:
//   node scripts/build-images.mjs          # incremental (skips up-to-date tiers)
//   node scripts/build-images.mjs --force  # regenerate everything
//
// Requires: node, and `magick` (ImageMagick 7) on PATH with AVIF + WebP support.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const IMAGES_DIR = join(ROOT, "images");
const OUT_DIR = join(IMAGES_DIR, "opt");
const MANIFEST_JSON = join(IMAGES_DIR, "manifest.json");
const MANIFEST_JS = join(IMAGES_DIR, "manifest.js");
const PROJECTS_JS = join(ROOT, "projects.js");

const FORCE = process.argv.includes("--force");

// ---------------------------------------------------------------------------
// Load projects.js (a classic script, no exports) without touching the file.
// ---------------------------------------------------------------------------
function loadProjects() {
    const source = readFileSync(PROJECTS_JS, "utf8");
    // `projects` is declared with `const`, which is a lexical binding, not a
    // property of the sandbox global — grab it via a trailing statement in
    // the same top-level scope instead of reading it off the context after.
    const wrapped = `${source}\nthis.__projects = projects;`;
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(wrapped, ctx, { filename: "projects.js" });
    if (!Array.isArray(ctx.__projects)) {
        throw new Error("projects.js did not define a `projects` array");
    }
    return ctx.__projects;
}

// ---------------------------------------------------------------------------
// magick helpers
// ---------------------------------------------------------------------------
function identify(file) {
    const out = execFileSync("magick", ["identify", "-format", "%w %h", file], {
        encoding: "utf8",
    });
    const [w, h] = out.trim().split(/\s+/).map(Number);
    return { w, h };
}

function encode(srcFile, outFile, width, { avif }) {
    const args = [
        srcFile,
        "-colorspace", "sRGB",
        "-strip",
        "-filter", "Lanczos",
        "-resize", `${width}x`,
    ];
    if (avif) {
        args.push("-quality", isFlatArt(srcFile) ? "70" : "55");
    } else {
        args.push("-quality", "80", "-define", "webp:method=6");
    }
    args.push(outFile);
    execFileSync("magick", args, { stdio: "inherit" });
}

// Flat/vector-style art (illustrations, indexed PNGs) shows AVIF blocking
// earlier than photos — bump quality for those. Heuristic: indexed PNG, or
// filename hints. Adjust this list as new flat-art pieces are added.
const FLAT_ART_HINTS = ["running_playground"];
function isFlatArt(srcFile) {
    const b = basename(srcFile);
    return FLAT_ART_HINTS.some((hint) => b.includes(hint));
}

// ---------------------------------------------------------------------------
// Tier widths: displayWidth * {1,2,4,8}, rounded up to a multiple of 32,
// clamped to the native width, deduped.
// ---------------------------------------------------------------------------
function tierWidths(displayWidth, nativeWidth) {
    const raw = [1, 2, 4, 8].map((k) => {
        const w = displayWidth * k;
        const rounded = Math.ceil(w / 32) * 32;
        return Math.min(rounded, nativeWidth);
    });
    return [...new Set(raw)].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

    const projects = loadProjects();

    // Group by source image file; if an image is reused with multiple
    // display widths, generate tiers for the largest so every usage is sharp.
    const byImage = new Map();
    for (const p of projects) {
        const cur = byImage.get(p.image);
        if (!cur || p.transform.scale > cur) byImage.set(p.image, p.transform.scale);
        else if (!cur) byImage.set(p.image, p.transform.scale);
    }

    const prevManifest = existsSync(MANIFEST_JSON)
        ? JSON.parse(readFileSync(MANIFEST_JSON, "utf8"))
        : {};

    const manifest = {};
    let generated = 0;
    let skipped = 0;

    for (const [image, displayWidth] of byImage) {
        const srcFile = join(IMAGES_DIR, image);
        if (!existsSync(srcFile)) {
            console.warn(`! skipping ${image}: referenced in projects.js but not found in images/`);
            continue;
        }

        const stat = statSync(srcFile);
        const srcKey = `${stat.size}:${Math.floor(stat.mtimeMs)}`;
        const { w: nativeW, h: nativeH } = identify(srcFile);
        const base = basename(image, extname(image));
        const tiers = tierWidths(displayWidth, nativeW);

        const prevEntry = prevManifest[image];
        const upToDate =
            !FORCE &&
            prevEntry &&
            prevEntry.srcKey === srcKey &&
            JSON.stringify(prevEntry.tiers) === JSON.stringify(tiers) &&
            tiers.every((w) =>
                existsSync(join(OUT_DIR, `${base}-${w}.avif`)) &&
                existsSync(join(OUT_DIR, `${base}-${w}.webp`))
            );

        if (upToDate) {
            manifest[image] = prevEntry;
            skipped++;
            continue;
        }

        console.log(`- ${image}: ${nativeW}x${nativeH} -> tiers [${tiers.join(", ")}]`);
        for (const w of tiers) {
            const avifOut = join(OUT_DIR, `${base}-${w}.avif`);
            const webpOut = join(OUT_DIR, `${base}-${w}.webp`);
            encode(srcFile, avifOut, w, { avif: true });
            encode(srcFile, webpOut, w, { avif: false });
        }

        manifest[image] = { base, w: nativeW, h: nativeH, tiers, srcKey };
        generated++;
    }

    writeFileSync(MANIFEST_JSON, JSON.stringify(manifest, null, 2) + "\n");
    writeFileSync(
        MANIFEST_JS,
        `// Generated by scripts/build-images.mjs — do not edit by hand.\n` +
            `const imageManifest = ${JSON.stringify(manifest, null, 2)};\n`
    );

    console.log(`\nDone. ${generated} image(s) (re)generated, ${skipped} up to date.`);
}

main();
