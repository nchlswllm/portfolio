

window.addEventListener("keydown", (e)=>{

    if(e.key === "~" || e.key === "`"){

        curatorMode = !curatorMode;
        if (!curatorMode) {

    document.querySelectorAll(".project")
        .forEach(p => {
            p.classList.remove("selected");
        });

    selectedProject = null;

}
        document.body.classList.toggle(
            "curator",
            curatorMode
        );

        showMessage(
            curatorMode
            ? "CURATOR MODE ON"
            : "CURATOR MODE OFF"
);

    }


});

function showMessage(text){
    const message =
    document.getElementById("modeMessage");
    message.textContent = text;
    message.classList.add("show");
    setTimeout(()=>{
        message.classList.remove("show");
    },1500);

}

function updateHUD(){

    if(!selectedProject) return;
    document.getElementById("hudID").textContent =
    selectedProject.id;
    document.getElementById("hudScale").textContent =
    selectedProject.transform.scale;
    document.getElementById("hudX").textContent =
    selectedProject.transform.x;
    document.getElementById("hudY").textContent =
    selectedProject.transform.y;
    document.getElementById("hudRotation").textContent =
    selectedProject.transform.rotation;

}

document.addEventListener("click", ()=>{
    if(!curatorMode) return;
    document.querySelectorAll(".project")
    .forEach(p=>{
        p.classList.remove("selected");
    });
    
});

const copyButton = document.getElementById("copyTransform");
copyButton.addEventListener(
"click",
async ()=>{
    if(!selectedProject){
        console.log("NO PROJECT SELECTED");
        return;
    }
    const output =
`transform: {
    scale: ${selectedProject.transform.scale},
    x: ${selectedProject.transform.x},
    y: ${selectedProject.transform.y},
    rotation: ${selectedProject.transform.rotation}
}`;
    await navigator.clipboard.writeText(output);
    showMessage("TRANSFORM COPIED");
});
window.addEventListener("keydown", (e) => {
    if (!curatorMode) return;
    if (!selectedProject) return;

    if (e.key.toLowerCase() === "q") {
        selectedProject.transform.rotation -= 1;
    }

    if (e.key.toLowerCase() === "e") {
        selectedProject.transform.rotation += 1;
    }

    const selectedItem = document.querySelector(
        `.project[data-id="${selectedProject.id}"]`
    );

    if (selectedItem) {
        selectedItem.style.transform =
            `rotate(${selectedProject.transform.rotation}deg)`;
    }

    updateHUD();
});