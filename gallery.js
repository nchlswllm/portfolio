(() => {
    "use strict";
    const groups = new Map();
    for (const image of projects) {
        if (!groups.has(image.id)) groups.set(image.id, []);
        groups.get(image.id).push(image);
    }
    const index = document.getElementById("projectIndex");
    const viewer = document.getElementById("viewer");
    const content = document.getElementById("viewerContent");
    const viewerTitle = document.getElementById("viewerTitle");
    const closeButton = document.getElementById("closeViewer");
    const indexTitle = "Nicholas Miller — Selected Works";
    history.scrollRestoration = "manual";
    let savedScroll = 0;
    let returnFocus = null;
    let activeProject = null;
    let gallery = null;
    let pictures = [];
    let resizeFrame = 0;

    function detailsFor(id) {
        return projectDetails[id] || { title: id.replaceAll("_", " ") };
    }
    function projectYear(id) {
        if (projectDetails[id]?.year !== undefined) return projectDetails[id].year;
        const years = [...new Set(groups.get(id).flatMap(image =>
            String(image.metadata.year || "").match(/\b(?:19|20)\d{2}\b/g) || []
        ))].sort();
        if (!years.length) return "";
        return years.length === 1 ? years[0] : `${years[0]}–${years.at(-1)}`;
    }
    const indexOrder = [...new Set([...projectIndexOrder, ...groups.keys()])];
    for (const id of indexOrder) {
        if (!groups.has(id)) continue;
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = `#project/${encodeURIComponent(id)}`;
        link.textContent = detailsFor(id).title;
        li.append(link);
        index.append(li);
    }

    function makePicture(image, position) {
        const dimensions = imageManifest[image.image];
        const picture = document.createElement("picture");
        picture.className = "gallery-image";
        if (detailsFor(image.id).blendImages?.includes(image.image)) picture.classList.add("gallery-image-blend");
        if (detailsFor(image.id).insetImages?.includes(image.image)) picture.classList.add("gallery-image-inset");
        const img = document.createElement("img");
        img.alt = image.metadata.name || detailsFor(image.id).title;
        img.loading = position < 3 ? "eager" : "lazy";
        img.decoding = "async";
        if (dimensions) {
            img.width = dimensions.w;
            img.height = dimensions.h;
            for (const format of ["avif", "webp"]) {
                const source = document.createElement("source");
                source.type = `image/${format}`;
                source.srcset = dimensions.tiers.map(width =>
                    `images/opt/${encodeURIComponent(dimensions.base)}-${width}.${format} ${width}w`
                ).join(", ");
                picture.append(source);
            }
        }
        img.src = `images/${encodeURIComponent(image.image)}`;
        img.addEventListener("error", () => {
            if (picture.querySelector("source")) {
                picture.querySelectorAll("source").forEach(source => source.remove());
                img.src = `images/${encodeURIComponent(image.image)}`;
            }
        });
        picture.append(img);
        return { picture, filename: image.image, ratio: dimensions ? dimensions.w / dimensions.h : 1 };
    }

    function layoutGallery() {
        if (!gallery || !viewer.open) return;
        const mobile = window.matchMedia("(max-width: 600px)").matches;
        const details = detailsFor(activeProject);
        gallery.style.width = `${mobile ? 100 : (details.width || 1) * 100}%`;
        const width = gallery.clientWidth;
        if (!width) return;
        const byName = new Map(pictures.map(item => [item.filename, item]));
        const used = new Set();
        const fragment = document.createDocumentFragment();

        function sizePicture(item, fraction, availableWidth) {
            item.picture.style.width = `${fraction * 100}%`;
            const sizes = `${Math.ceil(availableWidth * fraction)}px`;
            item.picture.querySelectorAll("img").forEach(img => { img.sizes = sizes; });
            item.picture.querySelectorAll("source").forEach(source => { source.sizes = sizes; });
            used.add(item.filename);
        }

        if (mobile) {
            const names = [...new Set([
                details.lead,
                ...(details.rows || []).flat(Infinity),
                ...pictures.map(item => item.filename)
            ].filter(Boolean))];
            for (const name of names) {
                const item = byName.get(name);
                if (!item) continue;
                item.picture.removeAttribute("style");
                sizePicture(item, 1, width);
                const row = document.createElement("div");
                row.className = "gallery-row";
                row.append(item.picture);
                fragment.append(row);
            }
            gallery.replaceChildren(fragment);
            return;
        }

        let rowNumber = 0;
        function appendRow(items, fraction = 1) {
            if (!items.length) return;
            rowNumber++;
            const inset = details.rowInsets?.[rowNumber] || 0;
            const rowWidth = details.rowWidths?.[rowNumber];
            if (rowWidth !== undefined) fraction = rowWidth;
            const viewportRowHeight = (details.viewportRow === rowNumber || details.viewportRows?.includes(rowNumber))
                ? Math.max(1, Math.min(viewer.clientHeight, window.visualViewport?.height || window.innerHeight) - viewer.querySelector(".viewer-header").offsetHeight)
                : 0;
            if (viewportRowHeight) {
                const rowRatio = items.reduce((sum, item) => sum + item.ratio, 0);
                const fittedWidth = viewportRowHeight * rowRatio / (width * (items.length === 1 ? items[0].stackScale || 1 : 1));
                fraction = details.viewportRow === rowNumber
                    ? Math.min(1, fittedWidth) * (details.viewportRowScale || 1)
                    : Math.min(fraction, fittedWidth * .8);
            }
            const element = document.createElement("div");
            element.className = "gallery-row";
            if (items.some(item => item.stackScale)) element.style.alignItems = "center";
            if (viewportRowHeight) {
                element.style.minHeight = `${viewportRowHeight}px`;
                element.style.alignItems = details.viewportRowAlignments?.[rowNumber] || "center";
            }
            element.style.width = `${fraction * 100}%`;
            if (rowWidth !== undefined && (details.rowAlignments?.[rowNumber] || details.rowAlign) !== "left") {
                element.style.marginLeft = "auto";
                element.style.marginRight = "auto";
            }
            if (inset) element.style.padding = `${inset}px`;
            const gap = details.rowGaps?.[rowNumber] ?? (details.gapPt || 0) * 4 / 3;
            element.style.gap = `${gap}px`;
            if (details.gapPt) element.style.marginBottom = `${details.gapPt * 4 / 3}px`;
            if (details.rowBottomGaps?.[rowNumber]) element.style.marginBottom = `${details.rowBottomGaps[rowNumber]}px`;
            const ratioSum = items.reduce((sum, item) => sum + item.ratio, 0);
            for (const item of items) {
                const share = item.ratio / ratioSum;
                const totalGap = gap * (items.length - 1);
                sizePicture(item, share, width * fraction - totalGap - inset * 2);
                if (gap) item.picture.style.width = `calc(${share * 100}% - ${totalGap * share}px)`;
                element.append(item.picture);
            }
            fragment.append(element);
        }

        if (details.layout === "viewport-rows") {
            const headerHeight = viewer.querySelector(".viewer-header").offsetHeight;
            const viewportHeight = Math.min(viewer.clientHeight, window.visualViewport?.height || window.innerHeight);
            const availableHeight = Math.max(1, viewportHeight - headerHeight - 56);
            const lead = byName.get(details.lead);
            if (lead) appendRow([lead], details.fullWidthRows ? 1 : Math.min(1, availableHeight * lead.ratio / width));

            for (const names of details.rows || []) {
                const items = names.map(name => {
                    if (!Array.isArray(name)) return byName.get(name);
                    const children = name.map(filename => byName.get(filename)).filter(item => item && !used.has(item.filename));
                    if (!children.length) return null;
                    const stack = document.createElement("div");
                    stack.className = "gallery-stack";
                    const stackScale = details.rowStackScale || 1;
                    stack.style.display = "flex";
                    stack.style.flexDirection = "column";
                    stack.style.alignItems = "center";
                    for (const child of children) {
                        child.picture.style.width = `${stackScale * 100}%`;
                        stack.append(child.picture);
                        used.add(child.filename);
                    }
                    return {
                        picture: stack,
                        stackScale,
                        filename: name.join("|"),
                        ratio: 1 / children.reduce((sum, child) => sum + 1 / child.ratio, 0)
                    };
                }).filter(item => item && !used.has(item.filename));
                if (mobile) {
                    for (const item of items) appendRow([item], details.fullWidthRows ? 1 : Math.min(1, availableHeight * .85 * item.ratio / width));
                } else {
                    const ratioSum = items.reduce((sum, item) => sum + item.ratio, 0);
                    appendRow(items, details.fullWidthRows ? 1 : Math.min(1, availableHeight * .85 * ratioSum / width));
                }
            }

            const supporting = pictures.filter(item => !used.has(item.filename));
            const assigned = new Set();
            const units = [];
            for (const item of supporting) {
                if (assigned.has(item.filename)) continue;
                const stack = details.stacks?.find(names => names.includes(item.filename));
                const items = stack ? stack.map(name => byName.get(name)).filter(value => value && !used.has(value.filename) && !assigned.has(value.filename)) : [item];
                items.forEach(value => assigned.add(value.filename));
                units.push({ items, ratio: 1 / items.reduce((sum, value) => sum + 1 / value.ratio, 0) });
            }
            const widestRatio = Math.max(1, ...units.map(unit => unit.ratio));
            const height = Math.min(mobile ? Infinity : width * .55, availableHeight * .85, width / widestRatio);
            const stackGap = details.stackGap || 0;
            const stackInset = details.stackInset || { left: 0, top: 0, bottom: 0 };
            const widthForUnit = unit => unit.items.length === 1 ? height * unit.ratio :
                Math.max(1, height - stackGap * (unit.items.length - 1) - stackInset.top - stackInset.bottom) * unit.ratio + stackInset.left;
            let row = [];
            let rowWidth = 0;
            const flushRow = () => {
                if (!row.length) return;
                const element = document.createElement("div");
                element.className = "gallery-row";
                element.style.width = `${Math.min(1, rowWidth / width) * 100}%`;
                for (const unit of row) {
                    const unitWidth = widthForUnit(unit);
                    if (unit.items.length === 1) {
                        const item = unit.items[0];
                        sizePicture(item, unitWidth / rowWidth, rowWidth);
                        item.picture.style.marginLeft = `${unit.gapBefore || 0}px`;
                        element.append(item.picture);
                    } else {
                        const stack = document.createElement("div");
                        stack.className = "gallery-stack";
                        stack.style.display = "flex";
                        stack.style.flexDirection = "column";
                        stack.style.gap = `${stackGap}px`;
                        stack.style.boxSizing = "border-box";
                        stack.style.padding = `${stackInset.top}px 0 ${stackInset.bottom}px ${stackInset.left}px`;
                        stack.style.width = `${unitWidth / rowWidth * 100}%`;
                        for (const item of unit.items) {
                            sizePicture(item, 1, unitWidth - stackInset.left);
                            stack.append(item.picture);
                        }
                        element.append(stack);
                    }
                }
                fragment.append(element);
                row = [];
                rowWidth = 0;
            };
            for (const unit of units) {
                const imageWidth = widthForUnit(unit);
                let gapBefore = row.length ? details.imageGapsBefore?.[unit.items[0].filename] || 0 : 0;
                if (row.length && rowWidth + gapBefore + imageWidth > width) {
                    flushRow();
                    gapBefore = 0;
                }
                unit.gapBefore = gapBefore;
                row.push(unit);
                rowWidth += imageWidth + gapBefore;
                if (mobile) flushRow();
            }
            flushRow();
            gallery.replaceChildren(fragment);
            return;
        }

        if (details.focal) {
            const focal = details.focal;
            const hero = byName.get(focal.image);
            const left = focal.left.map(name => byName.get(name)).filter(Boolean);
            const right = focal.right.map(name => byName.get(name)).filter(Boolean);
            if (hero) {
                if (mobile) {
                    for (const item of [hero, ...left, ...right]) appendRow([item]);
                } else {
                    const block = document.createElement("div");
                    block.className = "gallery-focal";
                    const columns = [left, [hero], right].filter(items => items.length);
                    // A vertical stack's width/height ratio is 1 / sum(1 / image ratio).
                    const ratios = columns.map(items => 1 / items.reduce((sum, item) => sum + 1 / item.ratio, 0));
                    const total = ratios.reduce((sum, ratio) => sum + ratio, 0);
                    columns.forEach((items, i) => {
                        const column = document.createElement("div");
                        column.className = "gallery-stack";
                        const fraction = ratios[i] / total;
                        column.style.width = `${fraction * 100}%`;
                        for (const item of items) {
                            sizePicture(item, 1, width * fraction);
                            column.append(item.picture);
                        }
                        block.append(column);
                    });
                    fragment.append(block);
                }
            }
        }

        let pending = [];
        const flush = () => { appendRow(pending); pending = []; };
        for (const item of pictures) {
            if (used.has(item.filename)) continue;
            if (details.centeredPair?.images.includes(item.filename)) {
                flush();
                const pair = details.centeredPair;
                const row = document.createElement("div");
                row.className = "gallery-row";
                row.style.alignItems = "center";
                row.style.gap = `${pair.gap}px`;
                row.style.paddingTop = `${pair.topSpacePt || 0}pt`;
                pair.images.forEach((name, i) => {
                    const member = byName.get(name);
                    if (!member || used.has(name)) return;
                    sizePicture(member, pair.widths[i], width);
                    if (i > 0) {
                        member.picture.style.marginLeft = "auto";
                        member.picture.style.marginRight = "auto";
                    }
                    row.append(member.picture);
                });
                fragment.append(row);
                continue;
            }
            if (details.compact?.includes(item.filename) && !mobile) {
                flush();
                appendRow(details.compact.map(name => byName.get(name)).filter(value => value && !used.has(value.filename)), .5);
            } else if (mobile || details.layout === "single" || item.ratio > 1) {
                flush();
                appendRow([item]);
            } else {
                pending.push(item);
                if (pending.length === 2) flush();
            }
        }
        flush();
        gallery.replaceChildren(fragment);
    }

    function closeView() {
        if (!viewer.open) return;
        viewer.close();
        document.body.classList.remove("viewer-open");
        document.body.style.top = "";
        window.scrollTo(0, savedScroll);
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        content.replaceChildren();
        gallery = null;
        pictures = [];
        activeProject = null;
        index.querySelectorAll("a").forEach(link => link.removeAttribute("aria-current"));
        document.title = indexTitle;
    }

    function renderRoute() {
        let route;
        try { route = decodeURIComponent(location.hash.slice(1)); }
        catch { route = ""; }
        const id = route.startsWith("project/") ? route.slice(8) : null;
        if (route !== "contact" && !groups.has(id)) {
            closeView();
            return;
        }
        if (!viewer.open) {
            savedScroll = window.scrollY;
            returnFocus = document.activeElement !== document.body
                ? document.activeElement
                : index.querySelector(`a[href="#project/${id}"]`) || document.querySelector(".site-name");
            document.body.style.top = `-${savedScroll}px`;
            document.body.classList.add("viewer-open");
            viewer.show();
        }
        content.replaceChildren();
        gallery = null;
        pictures = [];
        activeProject = id;
        index.querySelectorAll("a").forEach(link => {
            if (link.getAttribute("href") === `#project/${id}`) link.setAttribute("aria-current", "page");
            else link.removeAttribute("aria-current");
        });
        const title = route === "contact" ? "Contact" : detailsFor(id).title;
        viewerTitle.textContent = title;
        document.title = `${title} — Nicholas Miller`;
        if (route === "contact") {
            const contact = document.createElement("div");
            contact.className = "contact-content";
            const email = document.createElement("a");
            email.textContent = "nicholaswilliamco@gmail.com";
            email.href = "https://mail.google.com/mail/?view=cm&fs=1&to=nicholaswilliamco@gmail.com";
            email.target = "_blank";
            email.rel = "noopener noreferrer";
            contact.append(email);
            content.append(contact);
        } else {
            gallery = document.createElement("div");
            gallery.className = "gallery";
            gallery.style.width = `${(detailsFor(id).width || 1) * 100}%`;
            gallery.setAttribute("role", "group");
            gallery.setAttribute("aria-label", `${title} images`);
            content.append(gallery);
            const images = groups.get(id);
            const order = detailsFor(id).order || [];
            const ordered = [
                ...order.map(filename => images.find(image => image.image === filename)).filter(Boolean),
                ...images.filter(image => !order.includes(image.image))
            ];
            pictures = ordered.map(makePicture);
            layoutGallery();
            if (detailsFor(id).showCaption !== false) {
                const caption = document.createElement("p");
                caption.className = "project-caption";
                caption.textContent = detailsFor(id).caption || [title, projectYear(id)].filter(Boolean).join(", ");
                if (detailsFor(id).credit) {
                    const credit = document.createElement("span");
                    credit.className = "project-credit";
                    credit.textContent = detailsFor(id).credit;
                    caption.append(credit);
                }
                content.append(caption);
            }
        }
        viewer.scrollTop = 0;
        closeButton.focus({ preventScroll: true });
    }

    function requestClose() {
        if (!viewer.open) return;
        // Pop a route created from this index, so Forward can reopen it.
        // For direct links, replace the route instead of leaving the site.
        if (history.state?.portfolioOverlay) history.back();
        else {
            history.replaceState(null, "", location.pathname + location.search);
            renderRoute();
        }
    }
    document.addEventListener("click", event => {
        const link = event.target.closest("a");
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const href = link.getAttribute("href");
        if (!href?.startsWith("#")) return;
        event.preventDefault();
        if (href === "#") { requestClose(); return; }
        if (location.hash === href) return;
        if (viewer.open) history.replaceState(history.state, "", href);
        else history.pushState({ portfolioOverlay: true }, "", href);
        renderRoute();
    });
    closeButton.addEventListener("click", requestClose);
    viewer.addEventListener("cancel", event => { event.preventDefault(); requestClose(); });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && viewer.open) {
            event.preventDefault();
            requestClose();
        }
    });
    window.addEventListener("popstate", renderRoute);
    window.addEventListener("hashchange", renderRoute);
    const observer = new ResizeObserver(() => {
        if (!activeProject) return;
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(layoutGallery);
    });
    observer.observe(content);
    window.addEventListener("resize", () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(layoutGallery);
    });
    window.visualViewport?.addEventListener("resize", () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(layoutGallery);
    });
    renderRoute();
})();
