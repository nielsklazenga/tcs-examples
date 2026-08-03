/**
 * Stage 2 Pipeline Utility: generate-mapping-svg.js (ESM Overlap-Proof XML Version)
 * Consumes normalised profile layouts and outputs strict standalone vector SVGs.
 * Usage: node generate-mapping-svg.js [path/to/custom-config.json]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import * as d3 from 'd3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// CONSTANTS & CONFIGURATION MATRIX
// ==========================================
const SYMBOLS = { 
    "isCongruentWith": "≅",
    "includes": ">", 
    "isIncludedIn": "<", 
    "partiallyOverlaps": "><", 
    "intersects": "!!"
};

const RELATION_COLORS = {
    "isCongruentWith": "#1f77b4",
    "includes": "#f71d3a",
    "isIncludedIn": "#fc7405",
    "partiallyOverlaps": "#ff7f0e",
    "intersects": "#9467bd"
};

const configArg = process.argv[2];
const configPath = configArg 
    ? path.resolve(configArg) 
    : path.resolve(__dirname, 'tcs-config.json');

if (!fs.existsSync(configPath)) {
    console.error(`\x1b[31mError: Cannot find configuration file at:\x1b[0m\n${configPath}`);
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
console.log(`Using configuration matrix: \x1b[36m${path.basename(configPath)}\x1b[0m`);

if (!config.profiles || !Array.isArray(config.profiles)) {
    console.error('\x1b[31mError: "profiles" array entry missing inside configuration.\x1b[0m');
    process.exit(1);
}

function resolveDisplayLabel(concept) {
    if (concept.label) return concept.label;
    const idStr = concept.id;
    if (idStr.includes('#')) return idStr.split('#').pop();
    if (idStr.includes('/')) return idStr.split('/').pop();
    return idStr;
}

// ==========================================
// 2. CONGRUENCE CONSOLIDATION & TOPOLOGY
// ==========================================
function compileGraphTopology(rawInputData, shouldMerge) {
    let concepts = JSON.parse(JSON.stringify(rawInputData.concepts));
    let mappings = JSON.parse(JSON.stringify(rawInputData.mappings));

    concepts.forEach(c => {
        c.resolvedLabel = resolveDisplayLabel(c);
    });

    const parent = {};
    const find = (i) => {
        if (!parent[i]) parent[i] = i;
        if (parent[i] === i) return i;
        return parent[i] = find(parent[i]);
    };
    const union = (i, j) => {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) parent[rootI] = rootJ;
    };

    if (shouldMerge) {
        mappings.forEach(m => {
            if (m.relation === "isCongruentWith") union(m.subject, m.object);
        });
    }

    const clusterLabels = {};
    concepts.forEach(c => {
        const root = shouldMerge ? find(c.id) : c.id;
        if (!clusterLabels[root]) clusterLabels[root] = [];
        clusterLabels[root].push(c.resolvedLabel);
    });

    const finalNodesMap = new Map();
    concepts.forEach(c => {
        const root = shouldMerge ? find(c.id) : c.id;
        if (!finalNodesMap.has(root)) {
            finalNodesMap.set(root, {
                id: root,
                label: Array.from(new Set(clusterLabels[root])).join('\n')
            });
        }
    });

    // Extract links between resolved node roots
    let mappedLinks = [];
    mappings.forEach(m => {
        // If we are merging congruent nodes, drop 'isCongruentWith' since they are now the same node.
        // Otherwise, keep them as explicit edges!
        if (shouldMerge && m.relation === "isCongruentWith") return;
        
        const sourceRoot = shouldMerge ? find(m.subject) : m.subject;
        const targetRoot = shouldMerge ? find(m.object) : m.object;

        if (sourceRoot !== targetRoot) {
            mappedLinks.push({ source: sourceRoot, target: targetRoot, relation: m.relation });
        }
    });

    // Filter out inverse pairs for directional relations, but keep symmetric relations intact
    const seenPairs = new Set();
    const finalLinks = [];

    mappedLinks.forEach(m => {
        // Symmetric relations can go either way or coexist without directional inversion conflicts
        if (m.relation === "isCongruentWith" || m.relation === "intersects" || m.relation === "partiallyOverlaps") {
            finalLinks.push({ source: m.source, target: m.target, relation: m.relation });
            return;
        }

        const key = `${m.source}-${m.target}`;
        const reverseKey = `${m.target}-${m.source}`;

        if (!seenPairs.has(key) && !seenPairs.has(reverseKey)) {
            seenPairs.add(key);
            finalLinks.push({ source: m.source, target: m.target, relation: m.relation });
        }
    });

    return { nodes: Array.from(finalNodesMap.values()), links: finalLinks };
}

// ==========================================
// 3. D3 SVG GENERATOR RENDER ENGINE
// ==========================================
function renderSvgCanvas(topologyData) {
    const baseWidth = 900;
    const baseHeight = 600;

    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const document = dom.window.document;
    
    const svg = d3.select(document.body)
        .append(() => document.createElementNS("http://www.w3.org/2000/svg", "svg"))
        .attr('xmlns', 'http://www.w3.org/2000/svg');

    svg.append('defs').html(`
        <marker id="arrow" viewBox="0 0 10 10" refX="30" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="${RELATION_COLORS.includes}"></path>
        </marker>
    `);
    svg.append('defs').html(`
        <marker id="arrow-inverse" viewBox="0 0 10 10" refX="30" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="${RELATION_COLORS.isIncludedIn}"></path>
        </marker>
    `);

    svg.append('style').text(`
        text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; text-anchor: middle; }
        .node-circle { fill: #f7fafc; stroke: #3182ce; stroke-width: 2px; }
        .node-number { font-size: 11px; fill: #2d3748; font-weight: bold; dominant-baseline: central; text-anchor: middle; }
        .edge-label { font-size: 9px; font-weight: bold; fill: #4a5568; }
        .link-includes { stroke: ${RELATION_COLORS.includes}; stroke-width: 2px; marker-end: url(#arrow); }
        .link-isIncludedIn { stroke: ${RELATION_COLORS.isIncludedIn}; stroke-width: 2px; marker-end: url(#arrow-inverse); }
        .link-partiallyOverlaps { stroke: ${RELATION_COLORS.partiallyOverlaps}; stroke-width: 2px; stroke-dasharray: 4,4; }
        .link-intersects { stroke: ${RELATION_COLORS.intersects}; stroke-width: 2px; stroke-dasharray: 2,2; }
        .link-isCongruentWith { stroke: ${RELATION_COLORS.isCongruentWith}; stroke-width: 2px; }
    `);

    topologyData.nodes.forEach((node, index) => {
        node.indexId = index + 1;
        node.radius = 16;
    });

    // Run compact simulation with central gravity
    const simulation = d3.forceSimulation(topologyData.nodes)
        .force("charge", d3.forceManyBody().strength(-180))
        .force("x", d3.forceX(baseWidth / 2).strength(0.05))
        .force("y", d3.forceY(baseHeight / 2).strength(0.05))
        .force("collision", d3.forceCollide().radius(d => d.radius + 10))
        .force("link", d3.forceLink(topologyData.links).id(d => d.id).distance(70));

    for (let i = 0; i < 300; i++) simulation.tick();

    // Calculate dynamic bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    topologyData.nodes.forEach(node => {
        const r = node.radius + 10;
        minX = Math.min(minX, node.x - r);
        minY = Math.min(minY, node.y - r);
        maxX = Math.max(maxX, node.x + r);
        maxY = Math.max(maxY, node.y + r);
    });

    if (minX === Infinity) { minX = 0; minY = 0; maxX = baseWidth; maxY = baseHeight; }

    const padding = 40;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    svg.attr('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`)
       .attr('style', 'width: 100%; height: auto;');

    // Draw lines
    svg.append("g").selectAll("line")
        .data(topologyData.links).enter().append("line")
        .attr("class", d => `link-${d.relation}`)
        .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);

    // Draw edge labels cleanly using SYMBOLS constant
    svg.append("g").selectAll("text")
        .data(topologyData.links).enter().append("text")
        .attr("class", "edge-label")
        .attr("x", d => (d.source.x + d.target.x) / 2)
        .attr("y", d => ((d.source.y + d.target.y) / 2) - 5)
        .text(d => SYMBOLS[d.relation] || "!!");

    // Draw node circles and numbers
    const nodeGroup = svg.append("g").selectAll("g")
        .data(topologyData.nodes).enter().append("g")
        .attr("transform", d => `translate(${d.x},${d.y})`);

    nodeGroup.append("circle")
        .attr("class", "node-circle")
        .attr("r", d => d.radius);

    nodeGroup.append("text")
        .attr("class", "node-number")
        .text(d => d.indexId);

    const xmlSerializer = new dom.window.XMLSerializer();
    return xmlSerializer.serializeToString(svg.node());
}

// ==========================================
// 4. PIPELINE EXECUTION
// ==========================================
config.profiles.forEach((profile, index) => {
    const inputPath = path.resolve(profile.inputFile);
    const outputPath = path.resolve(profile.outputFile);

    if (!fs.existsSync(inputPath)) {
        console.log(`\x1b[33mSkipping Profile [${index + 1}]: Missing target input file:\x1b[0m\n  ${inputPath}`);
        return;
    }

    try {
        const cleanData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

        if (cleanData.conflicts && cleanData.conflicts.length > 0) {
            console.error(`\n\x1b[31m❌ PROFILE SKIPPED [Profile ${index + 1}]: Contradictory Mappings Detected!\x1b[0m`);
            console.error(`File: ${path.basename(inputPath)}`);
            console.error(`Skipping this layout to prevent generating corrupted graphics.\n`);
            return; 
        }

        const topology = compileGraphTopology(cleanData, config.mergeCongruent);
        if (!topology) return;

        const svgContent = renderSvgCanvas(topology);
        const outputDir = path.dirname(outputPath);

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, svgContent);

        // Generate JSON legend for interactive tooltips
        const legendData = topology.nodes.map((node, i) => ({
            id: node.id,
            indexId: i + 1,
            labels: node.label.split('\n').map(l => l.trim()).filter(l => l.length > 0)
        }));
        
        const jsonOutputPath = outputPath.replace(/\.svg$/i, '-legend.json');
        fs.writeFileSync(jsonOutputPath, JSON.stringify(legendData, null, 2));

        console.log(`\x1b[32m✔ Built Map Layer & Legend [${index + 1}]:\x1b[0m ${path.basename(outputPath)} (+ JSON)`);
    } catch (err) {
        console.error(`\x1b[31mFailed compiling layout index [${index + 1}]:\x1b[0m`, err.message);
    }
});