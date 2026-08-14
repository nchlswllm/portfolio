const viewport = document.getElementById("viewport");
const canvas = document.getElementById("canvas");

let x = -5000;
let y = -5000;

let zoom = 1;

let dragging = false;

let startX;
let startY;

const worldSize = 10000;


// Move canvas initially

function update(){

    canvas.style.transform =
        `
        translate(${x}px, ${y}px)
        scale(${zoom})
        `;

}


update();


// ---------------------
// DRAGGING
// ---------------------

viewport.addEventListener("mousedown", (e) => {
    if (curatorMode && e.target.closest(".project")) return;

    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
});


window.addEventListener(
"mouseup",
()=>{

    dragging = false;

});


window.addEventListener(
"mousemove",
(e)=>{

    if(!dragging) return;


    x += e.clientX - startX;
    y += e.clientY - startY;


    startX = e.clientX;
    startY = e.clientY;


    wrap();

    update();

});


// ---------------------
// ZOOM
// ---------------------

viewport.addEventListener("wheel", (e) => {
    e.preventDefault();

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

    update();
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

projects.forEach(project => {
    const item = document.createElement("div");
    item.className = "project";
    item.dataset.id = project.id;

    item.style.left = project.transform.x + "px";
    item.style.top = project.transform.y + "px";
    item.style.width = project.transform.scale + "px";
    item.style.transform = `rotate(${project.transform.rotation}deg)`;

    item.innerHTML = `
        <img src="images/${project.image}">

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
            updateHUD();
        }

        function stopResize() {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResize);
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

            updateHUD();
        }

        function stopMove() {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", stopMove);
        }

        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", stopMove);
    });

    canvas.appendChild(item);
});

viewport.addEventListener("click", () => {
    if (!curatorMode) return;

    document.querySelectorAll(".project").forEach(p => {
        p.classList.remove("selected");
    });

    selectedProject = null;
});