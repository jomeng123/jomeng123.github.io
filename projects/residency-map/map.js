// =======================
// Full screen
// =======================
const width = window.innerWidth;
const height = window.innerHeight;

const svg = d3.select("#map")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

// =======================
// Shadow / Filters
// =======================
const defs = svg.append("defs");

const mapShadow = defs.append("filter")
    .attr("id", "map-shadow")
    .attr("x", "-20%")
    .attr("y", "-20%")
    .attr("width", "140%")
    .attr("height", "140%");

mapShadow.append("feDropShadow")
    .attr("dx", 0)
    .attr("dy", 6)
    .attr("stdDeviation", 12)
    .attr("flood-color", "#000")
    .attr("flood-opacity", 0.15);

const tooltip = d3.select("#tooltip");

// =======================
// Projection
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

    // Downsize + center
    const mapWidth = width * 0.6;
    const mapHeight = height * 0.6;
    projection.fitSize([mapWidth, mapHeight], states);
    const t = projection.translate();
    projection.translate([
        t[0] + (width - mapWidth) / 2,
        t[1] + (height - mapHeight) / 2
    ]);

    const mapGroup = svg.append("g")
        .attr("filter", "url(#map-shadow)");

    mapGroup.selectAll("path")
        .data(states.features)
        .enter()
        .append("path")
        .attr("class", "state")
        .attr("d", path);

    // =======================
    // Load residency data
    // =======================
    d3.csv("files/residency_clean.csv").then(data => {
        data.forEach(d => {
            d.lat = +d.lat;
            d.lon = +d.lon;
        });

        const origin = { lat: 36.1409238, lon: -86.8016342 };
        const originXY = projection([origin.lon, origin.lat]);

        const counts = {};
        data.forEach(d => {
            if (d.lat && d.lon) {
                const key = `${d.lat},${d.lon}`;
                counts[key] = (counts[key] || 0) + 1;
            }
        });

        const maxCount = d3.max(Object.values(counts));
        color.domain([1, maxCount]);
        const destinations = data.filter(d => d.lat && d.lon);

        // =======================
        // Arcs + dots
        // =======================
        destinations.forEach(d => {
            const destXY = projection([d.lon, d.lat]);
            if (!destXY) return;

            const key = `${d.lat},${d.lon}`;
            const count = counts[key];
            const radius = 4 + count;
            const strokeColor = color(count);

            const mx = (originXY[0] + destXY[0]) / 2;
            const my = (originXY[1] + destXY[1]) / 2 - 100;
            const arcPath = `M${originXY[0]},${originXY[1]} Q${mx},${my} ${destXY[0]},${destXY[1]}`;

            // Invisible hover arc
            svg.append("path")
                .attr("d", arcPath)
                .attr("fill", "none")
                .attr("stroke", "transparent")
                .attr("stroke-width", 10)
                .attr("pointer-events", "stroke")
                .on("mouseover", (event) => showTooltip(event, d, count))
                .on("mouseout", hideTooltip);

            // Visible arc
            svg.append("path")
                .attr("class", "arc")
                .attr("d", arcPath)
                .attr("stroke", strokeColor);

            // Dot
            svg.append("circle")
                .attr("class", "dot")
                .attr("cx", destXY[0])
                .attr("cy", destXY[1])
                .attr("r", radius)
                .on("mouseover", (event) => showTooltip(event, d, count))
                .on("mouseout", hideTooltip);
        });

        // Origin dot
        svg.append("circle")
            .attr("class", "origin")
            .attr("cx", originXY[0])
            .attr("cy", originXY[1])
            .attr("r", 10);

        // =======================
        // Top 5 panel
        // =======================
        const top5 = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([coord, count]) => {
                const d = destinations.find(x => `${x.lat},${x.lon}` === coord);
                return { ...d, count };
            });

        const panel = d3.select("body")
            .append("div")
            .attr("id", "top-panel");

        panel.append("div")
            .attr("class", "title")
            .text("Top 5 Match Destinations");

        const rows = panel.selectAll(".row")
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
    });
});
