const viewport = document.getElementById("viewport");
const canvas = document.getElementById("canvas");
const SEAM_GUTTER = typeof worldLayout !== "undefined" ? worldLayout.seamGap : 0;
const COPY_OFFSETS = [-1, 0, 1];
const MAX_ZOOM = 4;
const BASE_MIN_ZOOM = 0.3;
const manifest = typeof imageManifest !== "undefined" ? imageManifest : {};
const spacedPreviewEnabled = new URLSearchParams(location.search).get("layoutPreview") === "spaced";
const SPACED_PREVIEW_EXCLUSION = { minX: 5000, minY: 5000, maxX: 6920, maxY: 5945 };
const mobileLanding = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) ||
    navigator.maxTouchPoints > 0 ||
    matchMedia("(pointer: coarse)").matches ||
    "ontouchstart" in window;
const MOBILE_LANDING_CENTER = { x: 5960, y: 5472.5 };

document.body.classList.toggle("mobileLanding", mobileLanding);

let x = 0, y = 0, zoom = 1;
let worldWidth = 1, worldHeight = 1, worldOriginX = 0, worldOriginY = 0;
let dragging = false, updatePending = false, settleTimer = null;
const tiles = [];
const projectInstances = new Map();
const introInstances = [document.querySelector(".portfolioIntro")].filter(Boolean);
const activePointers = new Map();
let gestureMode = null;
let panPointerId = null;
let panLastX = 0, panLastY = 0;
let pinchStartDistance = 1, pinchStartZoom = 1;
let pinchWorldX = 0, pinchWorldY = 0;

const modulo = (value, period) => ((value % period) + period) % period;

function minimumZoom() {
    return Math.max(BASE_MIN_ZOOM, innerWidth / worldWidth, innerHeight / worldHeight);
}

function clampZoom() {
    const min = minimumZoom();
    zoom = Math.min(Math.max(zoom, min), Math.max(MAX_ZOOM, min));
}

function wrap() {
    x = -modulo(-x, worldWidth * zoom);
    y = -modulo(-y, worldHeight * zoom);
}

function update() {
    canvas.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${zoom})`;
}

function positionIntroInstances() {
    for (const instance of introInstances) {
        const copyX = Number(instance.dataset.copyX || 0);
        const copyY = Number(instance.dataset.copyY || 0);
        instance.style.left = 5000 - worldOriginX + copyX * worldWidth + "px";
        instance.style.top = 5000 - worldOriginY + copyY * worldHeight + "px";
    }
}

function scheduleUpdate() {
    if (updatePending) return;
    updatePending = true;
    requestAnimationFrame(() => {
        updatePending = false;
        update();
        refreshTileVisibility();
    });
}

function beginInteraction() {
    canvas.classList.add("interacting");
    clearTimeout(settleTimer);
}

function endInteractionSoon() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
        canvas.classList.remove("interacting");
        refreshTiles();
    }, 150);
}

function worldViewport(marginRatio = 1) {
    const mw = innerWidth * marginRatio;
    const mh = innerHeight * marginRatio;
    return {
        x0: (-x - mw) / zoom,
        y0: (-y - mh) / zoom,
        x1: (innerWidth - x + mw) / zoom,
        y1: (innerHeight - y + mh) / zoom,
    };
}

function applyLOD(tile) {
    const px = Math.max(1, Math.round(tile.project.transform.scale * zoom));
    tile.source.sizes = px + "px";
    tile.img.sizes = px + "px";
}

function setCulled(tile, culled) {
    if (tile.culled === culled) return;
    tile.culled = culled;
    tile.el.classList.toggle("culled", culled);
    if (culled) {
        tile.source.srcset = tile.smallestAvif;
        tile.img.srcset = tile.smallestWebp;
    } else {
        tile.source.srcset = tile.avifSrcset;
        tile.img.srcset = tile.webpSrcset;
    }
}

function refreshTiles() {
    const vp = worldViewport();
    for (const tile of tiles) {
        const visible =
            tile.left <= vp.x1 && tile.left + tile.w >= vp.x0 &&
            tile.top <= vp.y1 && tile.top + tile.h >= vp.y0;
        setCulled(tile, !visible);
        if (visible) applyLOD(tile);
    }
}

function refreshTileVisibility() {
    const vp = worldViewport();
    for (const tile of tiles) {
        const visible =
            tile.left <= vp.x1 && tile.left + tile.w >= vp.x0 &&
            tile.top <= vp.y1 && tile.top + tile.h >= vp.y0;
        setCulled(tile, !visible);
    }
}

function rotatedBounds(left, top, width, height, rotation) {
    const radians = rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const rotatedWidth = width * cos + height * sin;
    const rotatedHeight = width * sin + height * cos;
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    return {
        minX: centerX - rotatedWidth / 2,
        maxX: centerX + rotatedWidth / 2,
        minY: centerY - rotatedHeight / 2,
        maxY: centerY + rotatedHeight / 2,
    };
}

function halton(index, base) {
    let result = 0;
    let fraction = 1 / base;
    while (index > 0) {
        result += fraction * (index % base);
        index = Math.floor(index / base);
        fraction /= base;
    }
    return result;
}

function previewRandom(seed) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
}

function alternatePreviewOrientations(items, attempt) {
    const landscape = items.filter(item => item.width >= item.height);
    const portrait = items.filter(item => item.width < item.height);
    const output = [];
    let takeLandscape = attempt % 2 === 0;
    while (landscape.length || portrait.length) {
        const preferred = takeLandscape ? landscape : portrait;
        const fallback = takeLandscape ? portrait : landscape;
        output.push((preferred.length ? preferred : fallback).shift());
        takeLandscape = !takeLandscape;
    }
    return output;
}

function orientationContrastPenalty(item, candidate, placed, world) {
    const orientation = item.width >= item.height ? "landscape" : "portrait";
    const centerX = candidate.x + candidate.w / 2;
    const centerY = candidate.y + candidate.h / 2;
    const radius = Math.min(world.width, world.height) * 0.22;
    let penalty = 0;
    for (const other of placed) {
        const distance = Math.hypot(
            centerX - (other.x + other.w / 2),
            centerY - (other.y + other.h / 2)
        );
        if (distance >= radius) continue;
        const proximity = 1 - distance / radius;
        penalty += other.orientation === orientation ? proximity * 0.18 : -proximity * 0.035;
    }
    return penalty;
}

function rectanglesIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
        a.y < b.y + b.h && a.y + a.h > b.y;
}

function splitPreviewFreeRects(freeRects, used) {
    const next = [];
    for (const free of freeRects) {
        if (!rectanglesIntersect(free, used)) {
            next.push(free);
            continue;
        }
        if (used.x > free.x) {
            next.push({ x: free.x, y: free.y, w: used.x - free.x, h: free.h });
        }
        if (used.x + used.w < free.x + free.w) {
            next.push({
                x: used.x + used.w, y: free.y,
                w: free.x + free.w - used.x - used.w, h: free.h,
            });
        }
        if (used.y > free.y) {
            next.push({ x: free.x, y: free.y, w: free.w, h: used.y - free.y });
        }
        if (used.y + used.h < free.y + free.h) {
            next.push({
                x: free.x, y: used.y + used.h,
                w: free.w, h: free.y + free.h - used.y - used.h,
            });
        }
    }
    return next.filter((rect, index, all) =>
        rect.w > 0.01 && rect.h > 0.01 &&
        !all.some((other, otherIndex) =>
            index !== otherIndex &&
            rect.x >= other.x && rect.y >= other.y &&
            rect.x + rect.w <= other.x + other.w &&
            rect.y + rect.h <= other.y + other.h
        )
    );
}

function previewFreeRegions(world, spacing) {
    const half = spacing / 2;
    const exclusion = {
        minX: SPACED_PREVIEW_EXCLUSION.minX - half,
        minY: SPACED_PREVIEW_EXCLUSION.minY - half,
        maxX: SPACED_PREVIEW_EXCLUSION.maxX + half,
        maxY: SPACED_PREVIEW_EXCLUSION.maxY + half,
    };
    const regions = [
        { x: world.minX, y: world.minY, w: world.width, h: exclusion.minY - world.minY },
        { x: world.minX, y: exclusion.maxY, w: world.width, h: world.maxY - exclusion.maxY },
        {
            x: world.minX, y: exclusion.minY,
            w: exclusion.minX - world.minX, h: exclusion.maxY - exclusion.minY,
        },
        {
            x: exclusion.maxX, y: exclusion.minY,
            w: world.maxX - exclusion.maxX, h: exclusion.maxY - exclusion.minY,
        },
    ];
    return regions.filter(region => region.w > 0 && region.h > 0);
}

function previewProjectGeometry(project, index) {
    const bounds = rotatedBounds(
        project.transform.x,
        project.transform.y,
        project.transform.scale,
        projectHeight(project),
        project.transform.rotation
    );
    return {
        project, index, bounds,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
    };
}

function trySpacedPacking(items, world, spacing, attempt) {
    let freeRects = previewFreeRegions(world, spacing);
    const placements = new Map();
    const placedRects = [];
    const strategy = attempt % 6;
    let ordered = [...items].sort((a, b) => {
        if (strategy === 0) return b.width * b.height - a.width * a.height || a.index - b.index;
        if (strategy === 1) return b.height - a.height || b.width - a.width || a.index - b.index;
        if (strategy === 2) return b.width - a.width || b.height - a.height || a.index - b.index;
        if (strategy === 3) return Math.max(b.width, b.height) - Math.max(a.width, a.height) || a.index - b.index;
        if (strategy === 4) return Math.abs(b.width - b.height) - Math.abs(a.width - a.height) || a.index - b.index;
        const aKey = halton(a.index + 1 + Math.floor(attempt / 6) * 71, 5);
        const bKey = halton(b.index + 1 + Math.floor(attempt / 6) * 71, 5);
        return aKey - bKey || a.index - b.index;
    });
    ordered = alternatePreviewOrientations(ordered, attempt);

    for (let orderIndex = 0; orderIndex < ordered.length; orderIndex++) {
        const item = ordered[orderIndex];
        const paddedWidth = item.width + spacing;
        const paddedHeight = item.height + spacing;
        const sequenceIndex = orderIndex + 1 + attempt * 997;
        const targetX = world.minX + previewRandom(sequenceIndex * 2 + 1) * world.width;
        const targetY = world.minY + previewRandom(sequenceIndex * 2 + 2) * world.height;
        const candidates = [];

        for (const free of freeRects) {
            if (paddedWidth > free.w || paddedHeight > free.h) continue;
            const anchors = [
                [free.x, free.y],
                [free.x + free.w - paddedWidth, free.y],
                [free.x, free.y + free.h - paddedHeight],
                [free.x + free.w - paddedWidth, free.y + free.h - paddedHeight],
            ];
            for (const [x, y] of anchors) {
                const centerX = x + paddedWidth / 2;
                const centerY = y + paddedHeight / 2;
                const targetDistance =
                    ((centerX - targetX) / world.width) ** 2 +
                    ((centerY - targetY) / world.height) ** 2;
                const shortSideWaste = Math.min(
                    free.w - paddedWidth,
                    free.h - paddedHeight
                ) / Math.max(world.width, world.height);
                const areaWaste = (free.w * free.h - paddedWidth * paddedHeight) /
                    (world.width * world.height);
                const candidate = { x, y, w: paddedWidth, h: paddedHeight };
                candidates.push({
                    x, y,
                    score: shortSideWaste + areaWaste * 0.35 + targetDistance * 0.08 +
                        orientationContrastPenalty(item, candidate, placedRects, world),
                });
            }
        }

        candidates.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
        const chosen = candidates[0];
        if (!chosen) return null;
        const used = { x: chosen.x, y: chosen.y, w: paddedWidth, h: paddedHeight };
        placements.set(item, {
            minX: chosen.x + spacing / 2,
            minY: chosen.y + spacing / 2,
        });
        placedRects.push({
            ...used,
            orientation: item.width >= item.height ? "landscape" : "portrait",
        });
        freeRects = splitPreviewFreeRects(freeRects, used);
    }
    return placements;
}

function tryContinuousSpacedPacking(items, world, spacing, attempt) {
    const half = spacing / 2;
    const forbidden = {
        x: SPACED_PREVIEW_EXCLUSION.minX - half,
        y: SPACED_PREVIEW_EXCLUSION.minY - half,
        w: SPACED_PREVIEW_EXCLUSION.maxX - SPACED_PREVIEW_EXCLUSION.minX + spacing,
        h: SPACED_PREVIEW_EXCLUSION.maxY - SPACED_PREVIEW_EXCLUSION.minY + spacing,
    };
    const strategy = attempt % 6;
    let ordered = [...items].sort((a, b) => {
        if (strategy === 0) return b.width * b.height - a.width * a.height || a.index - b.index;
        if (strategy === 1) return b.height - a.height || b.width - a.width || a.index - b.index;
        if (strategy === 2) return b.width - a.width || b.height - a.height || a.index - b.index;
        if (strategy === 3) return Math.max(b.width, b.height) - Math.max(a.width, a.height) || a.index - b.index;
        if (strategy === 4) return Math.abs(b.width - b.height) - Math.abs(a.width - a.height) || a.index - b.index;
        return halton(a.index + 1 + Math.floor(attempt / 6) * 71, 5) -
            halton(b.index + 1 + Math.floor(attempt / 6) * 71, 5) || a.index - b.index;
    });
    ordered = alternatePreviewOrientations(ordered, attempt);
    const usedRects = [];
    const placements = new Map();

    for (let orderIndex = 0; orderIndex < ordered.length; orderIndex++) {
        const item = ordered[orderIndex];
        const w = item.width + spacing;
        const h = item.height + spacing;
        const targetIndex = orderIndex + 1 + attempt * 613;
        const targetX = world.minX + previewRandom(targetIndex * 2 + 1) * world.width;
        const targetY = world.minY + previewRandom(targetIndex * 2 + 2) * world.height;
        const candidates = [
            [world.minX, world.minY],
            [world.maxX - w, world.minY],
            [world.minX, world.maxY - h],
            [world.maxX - w, world.maxY - h],
            [forbidden.x - w, forbidden.y],
            [forbidden.x + forbidden.w, forbidden.y],
            [forbidden.x, forbidden.y - h],
            [forbidden.x, forbidden.y + forbidden.h],
        ];
        for (const used of usedRects) {
            candidates.push(
                [used.x + used.w, used.y],
                [used.x - w, used.y],
                [used.x, used.y + used.h],
                [used.x, used.y - h],
                [used.x + used.w, used.y + used.h - h],
                [used.x + used.w - w, used.y + used.h]
            );
        }
        for (let sample = 1; sample <= 240; sample++) {
            const sequence = sample + attempt * 241;
            candidates.push([
                world.minX + halton(sequence, 2) * Math.max(0, world.width - w),
                world.minY + halton(sequence, 3) * Math.max(0, world.height - h),
            ]);
        }

        const valid = [];
        for (const [x, y] of candidates) {
            const candidate = { x, y, w, h };
            if (x < world.minX || y < world.minY ||
                x + w > world.maxX || y + h > world.maxY) continue;
            if (rectanglesIntersect(candidate, forbidden)) continue;
            if (usedRects.some(used => rectanglesIntersect(candidate, used))) continue;
            const centerX = x + w / 2;
            const centerY = y + h / 2;
            const targetDistance =
                ((centerX - targetX) / world.width) ** 2 +
                ((centerY - targetY) / world.height) ** 2;
            const edgeBias = Math.min(
                x - world.minX,
                world.maxX - x - w,
                y - world.minY,
                world.maxY - y - h
            ) / Math.max(world.width, world.height);
            valid.push({
                candidate,
                score: targetDistance - edgeBias * 0.03 +
                    orientationContrastPenalty(item, candidate, usedRects, world),
            });
        }
        valid.sort((a, b) =>
            a.score - b.score || a.candidate.y - b.candidate.y || a.candidate.x - b.candidate.x
        );
        const chosen = valid[0]?.candidate;
        if (!chosen) return null;
        usedRects.push({
            ...chosen,
            orientation: item.width >= item.height ? "landscape" : "portrait",
        });
        placements.set(item, {
            minX: chosen.x + half,
            minY: chosen.y + half,
        });
    }
    return placements;
}

function countSpacedPreviewProblems(items, world, spacing) {
    const half = spacing / 2;
    const boxes = items.map(item => {
        const bounds = rotatedBounds(
            item.project.transform.x,
            item.project.transform.y,
            item.project.transform.scale,
            projectHeight(item.project),
            item.project.transform.rotation
        );
        return {
            x: bounds.minX, y: bounds.minY,
            w: bounds.maxX - bounds.minX,
            h: bounds.maxY - bounds.minY,
        };
    });
    const protectedBox = {
        x: SPACED_PREVIEW_EXCLUSION.minX,
        y: SPACED_PREVIEW_EXCLUSION.minY,
        w: SPACED_PREVIEW_EXCLUSION.maxX - SPACED_PREVIEW_EXCLUSION.minX,
        h: SPACED_PREVIEW_EXCLUSION.maxY - SPACED_PREVIEW_EXCLUSION.minY,
    };
    const violations = boxes.filter(box => rectanglesIntersect(box, protectedBox)).length;
    let collisions = 0;
    for (let a = 0; a < boxes.length; a++) {
        for (let b = a + 1; b < boxes.length; b++) {
            const paddedA = {
                x: boxes[a].x - half, y: boxes[a].y - half,
                w: boxes[a].w + spacing, h: boxes[a].h + spacing,
            };
            let pairCollides = false;
            offsets: for (const offsetX of [-world.width, 0, world.width]) {
                for (const offsetY of [-world.height, 0, world.height]) {
                    const shiftedB = {
                        x: boxes[b].x + offsetX - half,
                        y: boxes[b].y + offsetY - half,
                        w: boxes[b].w + spacing,
                        h: boxes[b].h + spacing,
                    };
                    if (rectanglesIntersect(paddedA, shiftedB)) {
                        pairCollides = true;
                        break offsets;
                    }
                }
            }
            if (pairCollides) collisions++;
        }
    }
    return { collisions, violations };
}

function applySpacedPreview(world) {
    if (!spacedPreviewEnabled) return null;
    const items = projects.map(previewProjectGeometry);
    function findPacking(candidateWorld, spacing) {
        let result = null;
        for (let attempt = 0; attempt < 6 && !result; attempt++) {
            result = trySpacedPacking(items, candidateWorld, spacing, attempt);
        }
        for (let attempt = 0; attempt < 6 && !result; attempt++) {
            result = tryContinuousSpacedPacking(items, candidateWorld, spacing, attempt);
        }
        return result;
    }

    const original = { ...world };
    const centerX = (world.minX + world.maxX) / 2;
    const centerY = (world.minY + world.maxY) / 2;
    let placements = null;
    let chosenWorld = null;
    let expansionPercent = 0;

    for (let expansion = 0; expansion <= 60 && !placements; expansion += 5) {
        const factor = 1 + expansion / 100;
        const width = original.width * factor;
        const height = original.height * factor;
        const candidateWorld = {
            minX: centerX - width / 2,
            maxX: centerX + width / 2,
            minY: centerY - height / 2,
            maxY: centerY + height / 2,
            width,
            height,
        };
        placements = findPacking(candidateWorld, 60);
        if (placements) {
            chosenWorld = candidateWorld;
            expansionPercent = expansion;
        }
    }

    let usedSpacing = placements ? 60 : null;
    if (placements) {
        for (let spacing = 100; spacing > 60; spacing -= 5) {
            const roomier = findPacking(chosenWorld, spacing);
            if (roomier) {
                placements = roomier;
                usedSpacing = spacing;
                break;
            }
        }
    }
    if (!placements) {
        return {
            success: false, spacing: null, moved: 0,
            collisions: 0, violations: 0,
            worldWidth: Math.round(world.width), worldHeight: Math.round(world.height),
        };
    }

    Object.assign(world, chosenWorld);

    let moved = 0;
    for (const item of items) {
        const placement = placements.get(item);
        const dx = placement.minX - item.bounds.minX;
        const dy = placement.minY - item.bounds.minY;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) moved++;
        item.project.transform.x += dx;
        item.project.transform.y += dy;
    }
    const problems = countSpacedPreviewProblems(items, world, usedSpacing);
    return {
        // A completed placement is still a useful preview even when the
        // conservative toroidal audit spots a repeated-copy conflict. Keep
        // those counts visible instead of hiding the generated layout behind
        // a misleading failure state.
        success: true,
        collisionFree: problems.collisions === 0 && problems.violations === 0,
        spacing: usedSpacing, moved,
        ...problems,
        expansionPercent,
        worldWidth: Math.round(world.width), worldHeight: Math.round(world.height),
    };
}


function projectHeight(project) {
    const instances = projectInstances.get(project) || [];
    const measurable = instances.find(instance =>
        !instance.el.classList.contains("culled") && instance.el.offsetHeight
    );
    if (measurable) {
        project.layoutHeight = measurable.el.offsetHeight;
        return project.layoutHeight;
    }
    if (project.layoutHeight) return project.layoutHeight;
    const m = manifest[project.image];
    return m ? project.transform.scale * m.h / m.w : project.transform.scale;
}

function calculateWorldBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const project of projects) {
        const b = rotatedBounds(
            project.transform.x, project.transform.y,
            project.transform.scale, projectHeight(project),
            project.transform.rotation
        );
        minX = Math.min(minX, b.minX);
        minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX);
        maxY = Math.max(maxY, b.maxY);
    }
    const padding = SEAM_GUTTER / 2;
    worldOriginX = minX - padding;
    worldOriginY = minY - padding;
    worldWidth = Math.max(1, maxX - minX + SEAM_GUTTER);
    worldHeight = Math.max(1, maxY - minY + SEAM_GUTTER);
    canvas.style.width = worldWidth + "px";
    canvas.style.height = worldHeight + "px";
    const guides = [
        ["desktopFrame", 5000, 5000],
        ["laptopFrame", 5275, 5085],
        ["mobileFrame", 5763, 5047],
    ];
    for (const [id, guideX, guideY] of guides) {
        const guide = document.getElementById(id);
        if (!guide) continue;
        guide.style.left = guideX - worldOriginX + "px";
        guide.style.top = guideY - worldOriginY + "px";
    }
    positionIntroInstances();
}

function positionInstance(instance) {
    const { project, copyX, copyY, el, tile } = instance;
    const left = project.transform.x - worldOriginX + copyX * worldWidth;
    const top = project.transform.y - worldOriginY + copyY * worldHeight;
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.width = project.transform.scale + "px";
    el.style.transform = `rotate(${project.transform.rotation}deg)`;
    if (tile) {
        tile.left = left;
        tile.top = top;
        tile.w = project.transform.scale;
        if (el.offsetHeight) project.layoutHeight = el.offsetHeight;
        tile.h = project.layoutHeight || projectHeight(project);
    }
}

function syncProjectInstances(project) {
    for (const instance of projectInstances.get(project) || []) positionInstance(instance);
}

function refitWorld({ preserveCenter = true } = {}) {
    const centerX = (-x + innerWidth / 2) / zoom + worldOriginX;
    const centerY = (-y + innerHeight / 2) / zoom + worldOriginY;
    calculateWorldBounds();
    for (const instances of projectInstances.values()) {
        for (const instance of instances) positionInstance(instance);
    }
    clampZoom();
    if (preserveCenter) {
        x = innerWidth / 2 - (centerX - worldOriginX) * zoom;
        y = innerHeight / 2 - (centerY - worldOriginY) * zoom;
    }
    wrap();
    update();
    refreshTiles();
}

window.syncProjectInstances = syncProjectInstances;
window.refitWorld = refitWorld;

function setSelectedProject(project, preferredElement = null) {
    selectedProject = project;
    document.querySelectorAll(".project.selected").forEach(el => el.classList.remove("selected"));
    if (!project) return;
    for (const instance of projectInstances.get(project) || []) instance.el.classList.add("selected");
    project.el = preferredElement || projectInstances.get(project)?.[0]?.el;
    updateHUD();
}

function mediaMarkup(project) {
    const m = manifest[project.image];
    if (!m) {
        return {
            html: `<img src="images/${project.image}" alt="${project.metadata.name}" decoding="async">`,
            media: null,
        };
    }
    const avifSrcset = m.tiers.map(w => `images/opt/${m.base}-${w}.avif ${w}w`).join(", ");
    const webpSrcset = m.tiers.map(w => `images/opt/${m.base}-${w}.webp ${w}w`).join(", ");
    const smallest = m.tiers[0];
    const smallestAvif = `images/opt/${m.base}-${smallest}.avif ${smallest}w`;
    const smallestWebp = `images/opt/${m.base}-${smallest}.webp ${smallest}w`;
    return {
        html: `<picture>
            <source type="image/avif" srcset="${smallestAvif}" sizes="${Math.round(project.transform.scale)}px">
            <img src="images/opt/${m.base}-${smallest}.webp"
                 srcset="${smallestWebp}" sizes="${Math.round(project.transform.scale)}px"
                 width="${m.w}" height="${m.h}" alt="${project.metadata.name}" decoding="async">
        </picture>`,
        media: { avifSrcset, webpSrcset, smallestAvif, smallestWebp },
    };
}

function attachProjectInteractions(instance) {
    const { project, el } = instance;
    el.addEventListener("click", event => {
        if (!curatorMode) return;
        event.stopPropagation();
        setSelectedProject(project, el);
    });

    el.querySelector(".resizeHandle").addEventListener("mousedown", event => {
        if (!curatorMode || selectedProject !== project) return;
        event.preventDefault();
        event.stopPropagation();
        const mouseX = event.clientX, mouseY = event.clientY;
        const initialScale = project.transform.scale;
        function resize(moveEvent) {
            const dx = (moveEvent.clientX - mouseX) / zoom;
            const dy = (moveEvent.clientY - mouseY) / zoom;
            project.transform.scale = Math.max(
                50, initialScale + Math.hypot(dx, dy) * (dx + dy >= 0 ? 1 : -1)
            );
            syncProjectInstances(project);
            updateHUD();
        }
        function stopResize() {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResize);
            refitWorld();
        }
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResize);
    });

    el.addEventListener("mousedown", event => {
        if (!curatorMode || selectedProject !== project ||
            event.target.classList.contains("resizeHandle")) return;
        dragging = false;
        event.preventDefault();
        event.stopPropagation();
        const mouseX = event.clientX, mouseY = event.clientY;
        const initialX = project.transform.x, initialY = project.transform.y;
        function move(moveEvent) {
            project.transform.x = initialX + (moveEvent.clientX - mouseX) / zoom;
            project.transform.y = initialY + (moveEvent.clientY - mouseY) / zoom;
            syncProjectInstances(project);
            updateHUD();
        }
        function stopMove() {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", stopMove);
            refitWorld();
        }
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", stopMove);
    });
}

function createInstance(project, copyX, copyY) {
    const item = document.createElement("div");
    item.className = "project";
    item.dataset.id = project.id;
    item.dataset.copy = `${copyX},${copyY}`;
    item.style.left = project.transform.x + "px";
    item.style.top = project.transform.y + "px";
    item.style.width = project.transform.scale + "px";
    item.style.transform = `rotate(${project.transform.rotation}deg)`;
    const media = mediaMarkup(project);
    item.innerHTML = `
        ${media.html}
        ${project.showCaption !== false ? `<div class="caption">
            /projects/${project.id}<br><br>
            name: "${project.metadata.name}"<br>
            type: "${project.metadata.type}"<br>
            tools: ${project.metadata.tools.join(", ")}<br>
            year: "${project.metadata.year}"
        </div>` : ""}
        <div class="resizeHandle"></div>`;
    const instance = { project, el: item, copyX, copyY, tile: null };
    if (media.media) {
        instance.tile = {
            project, el: item,
            source: item.querySelector("picture source"),
            img: item.querySelector("picture img"),
            ...media.media,
            left: 0, top: 0, w: 0, h: 0, culled: null,
        };
        tiles.push(instance.tile);
    }
    attachProjectInteractions(instance);
    return instance;
}

// Build primary instances first so captions can contribute measured bounds.
const primaryFragment = document.createDocumentFragment();
for (const project of projects) {
    const instance = createInstance(project, 0, 0);
    projectInstances.set(project, [instance]);
    primaryFragment.appendChild(instance.el);
}
canvas.appendChild(primaryFragment);
calculateWorldBounds();
const frozenPreviewWorld = {
    minX: worldOriginX,
    minY: worldOriginY,
    maxX: worldOriginX + worldWidth,
    maxY: worldOriginY + worldHeight,
    width: worldWidth,
    height: worldHeight,
};
const spacedPreviewSummary = applySpacedPreview(frozenPreviewWorld);
if (spacedPreviewSummary?.success) {
    worldOriginX = frozenPreviewWorld.minX;
    worldOriginY = frozenPreviewWorld.minY;
    worldWidth = frozenPreviewWorld.width;
    worldHeight = frozenPreviewWorld.height;
    canvas.style.width = worldWidth + "px";
    canvas.style.height = worldHeight + "px";
    const guides = [
        ["desktopFrame", 5000, 5000],
        ["laptopFrame", 5275, 5085],
        ["mobileFrame", 5763, 5047],
    ];
    for (const [id, guideX, guideY] of guides) {
        const guide = document.getElementById(id);
        if (!guide) continue;
        guide.style.left = guideX - worldOriginX + "px";
        guide.style.top = guideY - worldOriginY + "px";
    }
}

// Eight neighboring copies make the fitted world continuous on both axes.
const copyFragment = document.createDocumentFragment();
for (const project of projects) {
    const instances = projectInstances.get(project);
    for (const copyY of COPY_OFFSETS) {
        for (const copyX of COPY_OFFSETS) {
            if (copyX === 0 && copyY === 0) continue;
            const instance = createInstance(project, copyX, copyY);
            instances.push(instance);
            copyFragment.appendChild(instance.el);
        }
    }
}
const primaryIntro = introInstances[0];
if (primaryIntro) {
    for (const copyY of COPY_OFFSETS) {
        for (const copyX of COPY_OFFSETS) {
            if (copyX === 0 && copyY === 0) continue;
            const copy = primaryIntro.cloneNode(true);
            copy.dataset.copyX = copyX;
            copy.dataset.copyY = copyY;
            copy.setAttribute("aria-hidden", "true");
            introInstances.push(copy);
            copyFragment.appendChild(copy);
        }
    }
}
canvas.appendChild(copyFragment);
for (const instances of projectInstances.values()) {
    for (const instance of instances) positionInstance(instance);
}
positionIntroInstances();

if (mobileLanding) {
    zoom = 1;
    clampZoom();
    x = innerWidth / 2 - (MOBILE_LANDING_CENTER.x - worldOriginX) * zoom;
    y = innerHeight / 2 - (MOBILE_LANDING_CENTER.y - worldOriginY) * zoom;
} else {
    clampZoom();
    x = (worldOriginX - 5000) * zoom;
    y = (worldOriginY - 5000) * zoom;
}
wrap();
update();
refreshTiles();

if (spacedPreviewSummary) {
    const panel = document.createElement("aside");
    panel.id = "spacedPreviewPanel";
    panel.innerHTML = spacedPreviewSummary.success ? `
        <strong>SPACED LAYOUT PREVIEW</strong><br>
        spacing: ${spacedPreviewSummary.spacing}px<br>
        world expansion: ${spacedPreviewSummary.expansionPercent}%<br>
        moved images: ${spacedPreviewSummary.moved}<br>
        collisions: ${spacedPreviewSummary.collisions}<br>
        protected violations: ${spacedPreviewSummary.violations}<br>
        status: ${spacedPreviewSummary.collisionFree ? "clear" : "preview generated; audit conflicts shown above"}<br>
        world: ${spacedPreviewSummary.worldWidth} × ${spacedPreviewSummary.worldHeight}<br>
        <button id="copySpacedPreviewTransforms">copy preview transforms</button>
    ` : `
        <strong>SPACED PREVIEW FAILED</strong><br>
        No collision-free layout fit at 60px spacing.<br>
        The saved layout is unchanged.
    `;
    document.body.appendChild(panel);
    const copyButton = panel.querySelector("#copySpacedPreviewTransforms");
    if (copyButton) {
        copyButton.addEventListener("click", async () => {
            const output = projects.map(project => `// ${project.image}\ntransform: {\n` +
                `    scale: ${project.transform.scale},\n` +
                `    x: ${project.transform.x},\n` +
                `    y: ${project.transform.y},\n` +
                `    rotation: ${project.transform.rotation}\n}`
            ).join("\n\n");
            await navigator.clipboard.writeText(output);
            showMessage("PREVIEW TRANSFORMS COPIED");
        });
    }
}


function beginPointerPan(pointer) {
    gestureMode = "pan";
    panPointerId = pointer.id;
    panLastX = pointer.x;
    panLastY = pointer.y;
}

function beginPointerPinch() {
    const [first, second] = [...activePointers.values()];
    if (!first || !second) return;
    const centerX = (first.x + second.x) / 2;
    const centerY = (first.y + second.y) / 2;
    gestureMode = "pinch";
    pinchStartDistance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    pinchStartZoom = zoom;
    pinchWorldX = (centerX - x) / zoom;
    pinchWorldY = (centerY - y) / zoom;
}

function finishPointer(event) {
    if (!activePointers.delete(event.pointerId)) return;
    if (activePointers.size >= 2) {
        beginPointerPinch();
    } else if (activePointers.size === 1) {
        beginPointerPan(activePointers.values().next().value);
    } else {
        gestureMode = null;
        panPointerId = null;
        dragging = false;
        endInteractionSoon();
    }
}

viewport.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest("a")) return;
    if (curatorMode && event.target.closest(".project")) return;
    event.preventDefault();
    const pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    activePointers.set(event.pointerId, pointer);
    viewport.setPointerCapture(event.pointerId);
    dragging = true;
    beginInteraction();
    if (activePointers.size === 1) beginPointerPan(pointer);
    else if (activePointers.size === 2) beginPointerPinch();
});

viewport.addEventListener("pointermove", event => {
    const pointer = activePointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (activePointers.size >= 2) {
        const [first, second] = [...activePointers.values()];
        const centerX = (first.x + second.x) / 2;
        const centerY = (first.y + second.y) / 2;
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
        zoom = pinchStartZoom * distance / pinchStartDistance;
        clampZoom();
        x = centerX - pinchWorldX * zoom;
        y = centerY - pinchWorldY * zoom;
    } else if (gestureMode === "pan" && event.pointerId === panPointerId) {
        x += pointer.x - panLastX;
        y += pointer.y - panLastY;
        panLastX = pointer.x;
        panLastY = pointer.y;
    }

    wrap();
    scheduleUpdate();
});

viewport.addEventListener("pointerup", finishPointer);
viewport.addEventListener("pointercancel", finishPointer);
viewport.addEventListener("lostpointercapture", finishPointer);

window.addEventListener("blur", () => {
    if (!activePointers.size) return;
    activePointers.clear();
    gestureMode = null;
    panPointerId = null;
    dragging = false;
    endInteractionSoon();
});

viewport.addEventListener("wheel", event => {
    event.preventDefault();
    beginInteraction();
    const mouseX = event.clientX, mouseY = event.clientY;
    const worldX = (mouseX - x) / zoom;
    const worldY = (mouseY - y) / zoom;
    zoom *= event.deltaY < 0 ? 1.1 : 1 / 1.1;
    clampZoom();
    x = mouseX - worldX * zoom;
    y = mouseY - worldY * zoom;
    wrap();
    scheduleUpdate();
    endInteractionSoon();
}, { passive: false });

window.addEventListener("resize", () => {
    clampZoom();
    wrap();
    update();
    refreshTiles();
});

viewport.addEventListener("click", event => {
    if (!curatorMode || event.target.closest(".project")) return;
    setSelectedProject(null);
});
