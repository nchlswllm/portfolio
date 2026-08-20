#!/usr/bin/env node
// Compresses oversized empty corridors while preserving all existing overlaps.
// Usage: node scripts/layout-world.mjs --dry-run
//        node scripts/layout-world.mjs --write

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROJECTS_FILE = join(ROOT, "projects.js");
const MANIFEST_FILE = join(ROOT, "images", "manifest.json");
const REPORT_FILE = join(ROOT, "layout-report.json");
const CONFIG_FILE = join(ROOT, "world-layout.js");
const WRITE = process.argv.includes("--write");
const DRY_RUN = process.argv.includes("--dry-run");
if (WRITE === DRY_RUN) {
    throw new Error("Choose exactly one mode: --dry-run or --write");
}

const source = readFileSync(PROJECTS_FILE, "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(source + "\nthis.__projects = projects;", context);
const projects = context.__projects;
const manifest = JSON.parse(readFileSync(MANIFEST_FILE, "utf8"));

function bounds(project) {
    const m = manifest[project.image];
    if (!m) throw new Error(`Missing manifest entry for ${project.image}`);
    const width = project.transform.scale;
    const height = width * m.h / m.w;
    const angle = project.transform.rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const rw = width * cos + height * sin;
    const rh = width * sin + height * cos;
    const cx = project.transform.x + width / 2;
    const cy = project.transform.y + height / 2;
    return { minX: cx - rw / 2, maxX: cx + rw / 2, minY: cy - rh / 2, maxY: cy + rh / 2 };
}

function intersects(a, b) {
    return a.minX < b.maxX && a.maxX > b.minX &&
        a.minY < b.maxY && a.maxY > b.minY;
}

const originalBounds = projects.map(bounds);
const parent = projects.map((_, index) => index);
function find(index) {
    while (parent[index] !== index) {
        parent[index] = parent[parent[index]];
        index = parent[index];
    }
    return index;
}
function unite(a, b) {
    a = find(a);
    b = find(b);
    if (a !== b) parent[b] = a;
}
for (let a = 0; a < projects.length; a++) {
    for (let b = a + 1; b < projects.length; b++) {
        if (intersects(originalBounds[a], originalBounds[b])) unite(a, b);
    }
}

const groupMap = new Map();
projects.forEach((project, index) => {
    const root = find(index);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root).push(index);
});

const START_VIEW = { minX: 5000, minY: 5000, maxX: 6920, maxY: 5945 };
const groups = [...groupMap.values()].map((members, id) => {
    const boxes = members.map(index => originalBounds[index]);
    const box = {
        minX: Math.min(...boxes.map(b => b.minX)),
        maxX: Math.max(...boxes.map(b => b.maxX)),
        minY: Math.min(...boxes.map(b => b.minY)),
        maxY: Math.max(...boxes.map(b => b.maxY)),
    };
    return {
        id, members, box, dx: 0, dy: 0,
        pinned: intersects(box, START_VIEW),
    };
});

function positiveCorridorGaps(axis) {
    const min = axis === "x" ? "minX" : "minY";
    const max = axis === "x" ? "maxX" : "maxY";
    const sorted = [...groups].sort((a, b) => a.box[min] - b.box[min] || a.id - b.id);
    const gaps = [];
    let runningMax = sorted[0].box[max];
    for (let index = 1; index < sorted.length; index++) {
        const gap = sorted[index].box[min] - runningMax;
        if (gap > 0) gaps.push(gap);
        runningMax = Math.max(runningMax, sorted[index].box[max]);
    }
    return gaps;
}

const allGaps = [...positiveCorridorGaps("x"), ...positiveCorridorGaps("y")].sort((a, b) => a - b);
const medianGap = allGaps.length
    ? allGaps[Math.floor(allGaps.length / 2)]
    : 80;
const naturalGap = Math.round(Math.min(200, Math.max(40, medianGap)));

function translateGroup(group, axis, amount) {
    const delta = axis === "x" ? "dx" : "dy";
    const min = axis === "x" ? "minX" : "minY";
    const max = axis === "x" ? "maxX" : "maxY";
    group[delta] += amount;
    group.box[min] += amount;
    group.box[max] += amount;
}

function compressLargestCorridor(axis) {
    const min = axis === "x" ? "minX" : "minY";
    const max = axis === "x" ? "maxX" : "maxY";
    const sorted = [...groups].sort((a, b) => a.box[min] - b.box[min] || a.id - b.id);
    const candidates = [];
    let runningMax = sorted[0].box[max];
    for (let index = 1; index < sorted.length; index++) {
        const gap = sorted[index].box[min] - runningMax;
        if (gap > naturalGap) {
            const left = sorted.slice(0, index);
            const right = sorted.slice(index);
            const leftPinned = left.some(group => group.pinned);
            const rightPinned = right.some(group => group.pinned);
            if (!(leftPinned && rightPinned)) {
                candidates.push({ gap, left, right, leftPinned, rightPinned });
            }
        }
        runningMax = Math.max(runningMax, sorted[index].box[max]);
    }
    candidates.sort((a, b) => b.gap - a.gap);
    const chosen = candidates[0];
    if (!chosen) return null;
    const amount = chosen.gap - naturalGap;
    let moving;
    let direction;
    if (chosen.leftPinned) {
        moving = chosen.right;
        direction = -1;
    } else if (chosen.rightPinned) {
        moving = chosen.left;
        direction = 1;
    } else if (chosen.left.length <= chosen.right.length) {
        moving = chosen.left;
        direction = 1;
    } else {
        moving = chosen.right;
        direction = -1;
    }
    for (const group of moving) translateGroup(group, axis, direction * amount);
    return { axis, removed: amount, originalGap: chosen.gap, movedGroups: moving.map(group => group.id) };
}

const compressions = [compressLargestCorridor("x"), compressLargestCorridor("y")].filter(Boolean);

for (const group of groups) {
    for (const index of group.members) {
        projects[index].transform.x += group.dx;
        projects[index].transform.y += group.dy;
    }
}

const finalBounds = projects.map(bounds);
let remainingCollisions = 0;
for (let a = 0; a < groups.length; a++) {
    for (let b = a + 1; b < groups.length; b++) {
        const collides = groups[a].members.some(aIndex =>
            groups[b].members.some(bIndex => intersects(finalBounds[aIndex], finalBounds[bIndex]))
        );
        if (collides) remainingCollisions++;
    }
}

const minX = Math.min(...finalBounds.map(b => b.minX));
const maxX = Math.max(...finalBounds.map(b => b.maxX));
const minY = Math.min(...finalBounds.map(b => b.minY));
const maxY = Math.max(...finalBounds.map(b => b.maxY));
const movedGroups = groups.filter(group => group.dx || group.dy);
const report = {
    mode: WRITE ? "write" : "dry-run",
    projectCount: projects.length,
    rigidGroupCount: groups.length,
    overlappingProjectCount: groups.filter(group => group.members.length > 1)
        .reduce((sum, group) => sum + group.members.length, 0),
    pinnedGroupCount: groups.filter(group => group.pinned).length,
    naturalGap,
    compressions,
    movedGroups: movedGroups.map(group => ({
        id: group.id,
        images: group.members.map(index => projects[index].image),
        dx: group.dx,
        dy: group.dy,
        distance: Math.hypot(group.dx, group.dy),
    })),
    remainingGroupCollisions: remainingCollisions,
    world: { minX, minY, maxX, maxY, width: maxX - minX + naturalGap, height: maxY - minY + naturalGap },
};

function escapeRegExp(value) {
    return value.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
}

function updateProjectSource(text) {
    for (const project of projects) {
        const image = escapeRegExp(project.image);
        const pattern = new RegExp(
            `(image:\\s*"${image}"[\\s\\S]*?transform:\\s*\\{[\\s\\S]*?x:\\s*)(-?[\\d.]+)(,\\s*y:\\s*)(-?[\\d.]+)`
        );
        if (!pattern.test(text)) throw new Error(`Could not locate transform for ${project.image}`);
        text = text.replace(pattern, (_, beforeX, oldX, between, oldY) =>
            beforeX + project.transform.x + between + project.transform.y
        );
    }
    return text;
}

if (WRITE) {
    writeFileSync(PROJECTS_FILE, updateProjectSource(source));
    writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + "\n");
    writeFileSync(
        CONFIG_FILE,
        `// Generated by scripts/layout-world.mjs.\nconst worldLayout = {\n    seamGap: ${naturalGap}\n};\n`
    );
}

console.log(JSON.stringify(report, null, 2));
