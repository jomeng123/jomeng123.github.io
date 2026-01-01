// =======================
// Full screen SVG
// =======================
const width = window.innerWidth;
const height = window.innerHeight;

const svg = d3.select("#map")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

const mapGroup = svg.append("g").attr("class", "map-group");

const tooltip = d3.select("#tooltip");

// =======================
// Projection & path
// =======================
const projection = d3.geoAlbersUsa();
const path = d3.geoPath().projection(projection);
const color = d3.scaleSequential(d3.interpolateOranges);

// =======================
// Tooltip helpers
// =======================
function showTooltip(event, d, count) {
    tooltip
        .style("display", "block")
        .html(`
            <strong>${d.institution}</strong><br>
            ${d.city}, ${d.state}<br>
            <strong>Matches: ${count}</strong>
        `)
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY + 10 + "px");
}

function hideTooltip() {
    tooltip.style("display", "none");
}

// =======================
// Load US map
// =======================
d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json").then(us => {
    const states = topojson.feature(us, us.objects.states);

    const mapWidth = width * 0.6;
    const mapHeight = height * 0.6;
    projection.fitSize([mapWidth, mapHeight], states);

    const t = projection.translate();
    projection.translate([
        t[0] + (width - mapWidth) / 2,
        t[1] + (height - mapHeight) / 2
    ]);

    // Draw states
    mapGroup.append("g")
        .selectAll("path")
        .data(states.features)
        .enter()
        .append("path")
        .attr("class", "state")
        .attr("d", path);

    // =======================
    // Load residency data
    // =======================
    d3.csv("./residency_clean.csv").then(data => {

        data.forEach(d => {
            d.lat = +d.lat;
            d.lon = +d.lon;
            const match = d.source_pdf?.match(/\d{4}/);
            d.year = match ? +match[0] : null;
        });

        const years = Array.from(
            new Set(data.map(d => d.year).filter(Boolean))
        ).sort(d3.ascending);

        if (!years.length) return;

        // =======================
        // Slider
        // =======================
        const yearInput = d3.select("#yearRange");
        const yearLabel = d3.select("#yearLabel");

        yearInput
            .attr("min", d3.min(years))
            .attr("max", d3.max(years))
            .attr("step", 1)
            .attr("value", d3.min(years));

        yearLabel.text(d3.min(years));

        // =======================
        // Origin (Nashville)
        // =======================
        const origin = { lat: 36.1409238, lon: -86.8016342 };
        const originXY = projection([origin.lon, origin.lat]);

        mapGroup.append("circle")
            .attr("class", "origin")
            .attr("cx", originXY[0])
            .attr("cy", originXY[1])
            .attr("r", 10);

        // =======================
        // Top 5 Panel
        // =======================
        const panel = d3.select("body")
            .append("div")
            .attr("id", "top-panel");

        panel.append("div")
            .attr("class", "title")
            .text("Top 5 Match Destinations");

        // Draggable panel
        (function makeDraggable(el) {
            let isDragging = false;
            let offsetX = 0;
            let offsetY = 0;

            el.addEventListener("mousedown", e => {
                isDragging = true;
                offsetX = e.clientX - el.offsetLeft;
                offsetY = e.clientY - el.offsetTop;
                el.style.cursor = "grabbing";
            });

            document.addEventListener("mousemove", e => {
                if (!isDragging) return;
                el.style.left = e.clientX - offsetX + "px";
                el.style.top = e.clientY - offsetY + "px";
            });

            document.addEventListener("mouseup", () => {
                isDragging = false;
                el.style.cursor = "grab";
            });
        })(document.getElementById("top-panel"));

        const panelContent = panel.append("div");

        function renderTop5(filtered, counts, maxCount) {
            panelContent.html("");

            if (!filtered.length) return;

            const top5 = Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([coord, count]) => {
                    const d = filtered.find(x => `${x.lat},${x.lon}` === coord);
                    return d ? { ...d, count } : null;
                })
                .filter(Boolean);

            const rows = panelContent.selectAll(".row")
                .data(top5)
                .enter()
                .append("div")
                .attr("class", "row");

            rows.append("div")
                .html((d, i) => `
                    <strong>${i + 1}. ${d.institution}</strong><br>
                    <span>${d.city}, ${d.state}</span>
                `);

            const barRow = rows.append("div")
                .attr("class", "bar-row");

            const barBg = barRow.append("div")
                .attr("class", "bar-bg");

            barBg.append("div")
                .attr("class", "bar-fill")
                .style("width", d => `${(d.count / maxCount) * 100}%`);

            barRow.append("div")
                .attr("class", "bar-count")
                .text(d => d.count);
        }

        // =======================
        // Render map (once per year)
        // =======================
        function render(year) {
            mapGroup.selectAll(".arc,.dot,.hover-arc").remove();

            const filtered = data.filter(
                d => d.year === year && d.lat && d.lon
            );

            const counts = {};
            filtered.forEach(d => {
                const key = `${d.lat},${d.lon}`;
                counts[key] = (counts[key] || 0) + 1;
            });

            const maxCount = d3.max(Object.values(counts)) || 1;
            color.domain([1, maxCount]);

            filtered.forEach(d => {
                const destXY = projection([d.lon, d.lat]);
                if (!destXY) return;

                const count = counts[`${d.lat},${d.lon}`];
                const minRadius = 2;
                const maxRadius = 20;
                const radius = Math.min(maxRadius, minRadius + count * 0.8);

                const strokeColor = color(count);

                // Arc control point for nice curve
                const dx = destXY[0] - originXY[0];
                const dy = destXY[1] - originXY[1];
                const distance = Math.sqrt(dx*dx + dy*dy);
                const curveOffset = Math.max(50, distance * 0.25);
                const mx = originXY[0] + dx/2 - dy/distance * curveOffset;
                const my = originXY[1] + dy/2 + dx/distance * curveOffset;

                const arcPath = `M${originXY[0]},${originXY[1]} Q${mx},${my} ${destXY[0]},${destXY[1]}`;

                mapGroup.append("path")
                    .attr("class", "arc")
                    .attr("d", arcPath)
                    .attr("stroke", strokeColor)
                    .attr("fill", "none")
                    .attr("stroke-width", 2);

                mapGroup.append("circle")
                    .attr("class", "dot")
                    .attr("cx", destXY[0])
                    .attr("cy", destXY[1])
                    .attr("r", radius)
                    .on("mouseover", e => showTooltip(e, d, count))
                    .on("mouseout", hideTooltip);
            });

            renderTop5(filtered, counts, maxCount);
        }

        // Initial render
        render(d3.min(years));

        // Slider interaction
        yearInput.on("input", function () {
            const year = +this.value;
            yearLabel.text(year);
            render(year);
        });

        // =======================
        // Zoom behavior (only transform, no re-render)
        // =======================
        const zoom = d3.zoom()
            .scaleExtent([1, 20])
            .on("zoom", e => {
                mapGroup.attr("transform", e.transform);
            });

        svg.call(zoom);
    });
});
