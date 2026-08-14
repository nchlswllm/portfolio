const viewport = document.getElementById("viewport");
const canvas = document.getElementById("canvas");

let x = -5000;
let y = -5000;

let zoom = 1;

let dragging = false;

let startX;
let startY;

const worldSize = 10000;


// ---------------------
// TRANSFORM (rAF-batched)
// ---------------------

let updatePending = false;

function scheduleUpdate() {
    if (updatePending) return;
    updatePending = true;
    requestAnimationFrame(() => {
        updatePending = false;
        update();
    });
}

function update() {

    canvas.style.transform =
        `
        translate3d(${x}px, ${y}px, 0)
        scale(${zoom})
        `;

}


update();


// ---------------------
// GESTURE / LOD SETTLE
//
// While panning or zooming, #canvas gets a compositor hint and tiles keep
// whatever resolution they already have. 150ms after the gesture stops,
// culling + per-tile <picture> sizes are recomputed once.
// ---------------------

let settleTimer = null;

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


// ---------------------
// DRAGGING
// ---------------------

viewport.addEventListener("mousedown", (e) => {
    if (curatorMode && e.target.closest(".project")) return;

    dragging = true;
    startX = e.clientX;
    startY = e.clientY;

    beginInteraction();
});


window.addEventListener(
    "mouseup",
    () => {

        dragging = false;
        endInteractionSoon();

    });


window.addEventListener(
    "mousemove",
    (e) => {

        if (!dragging) return;


        x += e.clientX - startX;
        y += e.clientY - startY;


        startX = e.clientX;
        startY = e.clientY;


        wrap();

        scheduleUpdate();

    });


// ---------------------
// ZOOM
// ---------------------

viewport.addEventListener("wheel", (e) => {
    e.preventDefault();

    beginInteraction();

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    const worldX = (mouseX - x) / zoom;
    const worldY = (mouseY - y) / zoom;

    if (e.deltaY < 0) {
        zoom *= 1.1;
    } else {
        zoom /= 1.1;
    }

    zoom = Math.min(Math.max(zoom, 0.3), 4);

    x = mouseX - worldX * zoom;
    y = mouseY - worldY * zoom;

    wrap();

    scheduleUpdate();

    endInteractionSoon();
}, { passive: false });




// ---------------------
// WORLD WRAPPING
// ---------------------

function wrap() {
    const scaledWorldSize = worldSize * zoom;

    if (x > 0) x -= scaledWorldSize;
    if (x < -scaledWorldSize) x += scaledWorldSize;

    if (y > 0) y -= scaledWorldSize;
    if (y < -scaledWorldSize) y += scaledWorldSize;
}


// ---------------------
// CULLING + RESPONSIVE LOD
//
// Tiles outside the viewport (plus a one-viewport margin) get their
// <picture> srcset shrunk to the smallest generated tier, which both stops
// them painting (content-visibility) and lets the browser release the
// larger decoded bitmap. Tiles inside the viewport get their `sizes`
// recomputed from the current zoom so the browser fetches only as much
// resolution as the current display size actually needs.
// ---------------------

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
        // Shrinking srcset to a single small entry is what actually frees
        // the decoded bitmap — browsers upgrade a chosen resource but never
        // downgrade it, so touching `sizes` alone would not be enough.
        tile.source.srcset = tile.smallestAvif;
        tile.img.srcset = tile.smallestWebp;
    } else {
        tile.source.srcset = tile.avifSrcset;
        tile.img.srcset = tile.webpSrcset;
        applyLOD(tile);
    }
}

function refreshTiles() {
    const vp = worldViewport();

    for (const tile of tiles) {
        const visible =
            tile.left <= vp.x1 && tile.left + tile.w >= vp.x0 &&
            tile.top <= vp.y1 && tile.top + tile.h >= vp.y0;

        if (tile.culled === visible) {
            setCulled(tile, !visible);
        } else if (visible) {
            applyLOD(tile);
        }
    }
}

window.addEventListener("resize", () => refreshTiles());


// ---------------------
// TILE CREATION
// ---------------------

const tiles = [];
const fragment = document.createDocumentFragment();
const manifest = typeof imageManifest !== "undefined" ? imageManifest : {};

projects.forEach(project => {
    const item = document.createElement("div");
    item.className = "project";
    item.dataset.id = project.id;

    item.style.left = project.transform.x + "px";
    item.style.top = project.transform.y + "px";
    item.style.width = project.transform.scale + "px";
    item.style.transform = `rotate(${project.transform.rotation}deg)`;

    const m = manifest[project.image];
    let mediaHTML;
    let tile = null;

    if (m) {
        const dw = project.transform.scale;
        const dh = dw * m.h / m.w;

        const avifSrcset = m.tiers
            .map(w => `images/opt/${m.base}-${w}.avif ${w}w`)
            .join(", ");
        const webpSrcset = m.tiers
            .map(w => `images/opt/${m.base}-${w}.webp ${w}w`)
            .join(", ");

        const smallest = m.tiers[0];
        const smallestAvif = `images/opt/${m.base}-${smallest}.avif ${smallest}w`;
        const smallestWebp = `images/opt/${m.base}-${smallest}.webp ${smallest}w`;

        const fallbackTier = m.tiers[1] ?? m.tiers[0];
        const fallbackSrc = `images/opt/${m.base}-${fallbackTier}.webp`;

        mediaHTML = `
            <picture>
                <source type="image/avif" srcset="${avifSrcset}" sizes="${Math.round(dw)}px">
                <img src="${fallbackSrc}" srcset="${webpSrcset}" sizes="${Math.round(dw)}px"
                     width="${m.w}" height="${m.h}"
                     alt="${project.metadata.name}" decoding="async">
            </picture>
        `;

        tile = {
            project,
            left: project.transform.x,
            top: project.transform.y,
            w: dw,
            h: dh,
            avifSrcset, webpSrcset,
            smallestAvif, smallestWebp,
            culled: false,
        };
    } else {
        // No derivatives available (image not yet run through
        // scripts/build-images.mjs) — fall back to the original file so
        // nothing breaks, just isn't optimized yet.
        mediaHTML = `<img src="images/${project.image}" alt="${project.metadata.name}" decoding="async">`;
    }

    item.innerHTML = `
        ${mediaHTML}

        ${project.showCaption !== false ? `
            <div class="caption">
                /projects/${project.id}
                <br><br>
                name: "${project.metadata.name}"
                <br>
                type: "${project.metadata.type}"
                <br>
                tools: ${project.metadata.tools.join(", ")}
                <br>
                year: "${project.metadata.year}"
            </div>
        ` : ""}

        <div class="resizeHandle"></div>
    `;

    if (tile) {
        tile.el = item;
        tile.source = item.querySelector("picture source");
        tile.img = item.querySelector("picture img");
        tiles.push(tile);
    }

    // Direct element reference so curator-mode tooling (editor.js) doesn't
    // have to look tiles up by the (non-unique — several projects share an
    // id) data-id attribute.
    project.el = item;

    // SELECT
    item.addEventListener("click", (e) => {
        if (!curatorMode) return;

        e.stopPropagation();

        document.querySelectorAll(".project").forEach(p => {
            p.classList.remove("selected");
        });

        item.classList.add("selected");
        selectedProject = project;
        updateHUD();
    });

    // SCALE
    const resizeHandle = item.querySelector(".resizeHandle");

    resizeHandle.addEventListener("mousedown", (e) => {
        if (!curatorMode) return;
        if (selectedProject !== project) return;

        e.preventDefault();
        e.stopPropagation();

        const startMouseX = e.clientX;
        const startMouseY = e.clientY;
        const startScale = project.transform.scale;

        function resize(e) {
            const deltaX = (e.clientX - startMouseX) / zoom;
            const deltaY = (e.clientY - startMouseY) / zoom;

            const distance = Math.sqrt(
                deltaX * deltaX +
                deltaY * deltaY
            );

            const direction = deltaX + deltaY >= 0 ? 1 : -1;

            project.transform.scale = Math.max(
                50,
                startScale + distance * direction
            );

            item.style.width = project.transform.scale + "px";

            if (tile) {
                tile.w = project.transform.scale;
                tile.h = tile.w * m.h / m.w;
            }

            updateHUD();
        }

        function stopResize() {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResize);
            refreshTiles();
        }

        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResize);
    });

    // MOVE
    item.addEventListener("mousedown", (e) => {
        if (!curatorMode) return;
        if (selectedProject !== project) return;
        if (e.target.classList.contains("resizeHandle")) return;

        dragging = false;

        e.preventDefault();
        e.stopPropagation();

        const startMouseX = e.clientX;
        const startMouseY = e.clientY;
        const startX = project.transform.x;
        const startY = project.transform.y;

        function move(e) {
            project.transform.x =
                startX + (e.clientX - startMouseX) / zoom;

            project.transform.y =
                startY + (e.clientY - startMouseY) / zoom;

            item.style.left = project.transform.x + "px";
            item.style.top = project.transform.y + "px";

            if (tile) {
                tile.left = project.transform.x;
                tile.top = project.transform.y;
            }

            updateHUD();
        }

        function stopMove() {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", stopMove);
            refreshTiles();
        }

        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", stopMove);
    });

    fragment.appendChild(item);
});

canvas.appendChild(fragment);

refreshTiles();

viewport.addEventListener("click", () => {
    if (!curatorMode) return;

    document.querySelectorAll(".project").forEach(p => {
        p.classList.remove("selected");
    });

    selectedProject = null;
});
