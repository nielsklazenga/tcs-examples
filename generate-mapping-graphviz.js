/**
 * Stage 2 Pipeline Utility: generate-mapping-graphviz.js
 * Consumes normalised profile layouts and outputs standalone vector SVGs via Graphviz (fdp engine).
 * Usage: node generate-mapping-graphviz.js [path/to/custom-config.json]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

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

    let mappedLinks = [];
    mappings.forEach(m => {
        if (shouldMerge && m.relation === "isCongruentWith") return;
        
        const sourceRoot = shouldMerge ? find(m.subject) : m.subject;
        const targetRoot = shouldMerge ? find(m.object) : m.object;

        if (sourceRoot !== targetRoot) {
            mappedLinks.push({ source: sourceRoot, target: targetRoot, relation: m.relation });
        }
    });

    const seenPairs = new Set();
    const finalLinks = [];

    mappedLinks.forEach(m => {
        // Create a normalized key for symmetric relations so A->B and B->A (or duplicate A->B) count as the same pair
        if (m.relation === "isCongruentWith" || m.relation === "intersects" || m.relation === "partiallyOverlaps") {
            const symKey = `${m.relation}:${[m.source, m.target].sort().join('-')}`;
            if (!seenPairs.has(symKey)) {
                seenPairs.add(symKey);
                finalLinks.push({ source: m.source, target: m.target, relation: m.relation });
            }
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
// 3. GRAPHVIZ DOT GENERATOR & RENDER ENGINE
// ==========================================
function renderGraphvizSvg(topologyData) {
    const nodeSafeIdMap = new Map();
    topologyData.nodes.forEach((node, idx) => {
        nodeSafeIdMap.set(node.id, `node_${idx + 1}`);
    });

    let dotLines = [
        'digraph TaxonMapping {',
        '  graph [rankdir="TB", overlap=false, splines=true, bgcolor="transparent", fontname="-apple-system, sans-serif", K=0.3, pack=true];',
        '  node [shape=box, style="rounded,filled", fillcolor="#f7fafc", color="#3182ce", penwidth=3, fontname="-apple-system, sans-serif", margin=0.3];',
        // Changed fontcolor to black (#000000) and increased fontsize for better legibility
        '  edge [fontname="-apple-system, sans-serif", fontcolor="#000000", penwidth=4];'
    ];

    topologyData.nodes.forEach((node) => {
        const safeId = nodeSafeIdMap.get(node.id);
        
        let labelText = node.label;
        
        // Count how many times 'sec.' occurs in this node's label
        const secMatches = labelText.match(/ sec\./g);
        const secCount = secMatches ? secMatches.length : 0;
        
        // Only add the line break if there is precisely one 'sec.'
        if (secCount === 1) {
            labelText = labelText.replace(/ sec\./g, '\\nsec.');
        }
        
        const escapedLabel = labelText.replace(/"/g, '\\"');
        dotLines.push(`  "${safeId}" [label="${escapedLabel}"];`);
    });

    topologyData.links.forEach(link => {
        const sourceSafe = nodeSafeIdMap.get(typeof link.source === 'object' ? link.source.id : link.source);
        const targetSafe = nodeSafeIdMap.get(typeof link.target === 'object' ? link.target.id : link.target);
        
        const color = RELATION_COLORS[link.relation] || '#4a5568';
        const symbol = SYMBOLS[link.relation] || '!!';
        
        // We explicitly keep the line color and arrow matching the relation type,
        // but omit 'fontcolor' here so it falls back to solid black from the global edge definition.
        let styleAttr = `color="${color}", label="${symbol}"`;
        if (link.relation === 'partiallyOverlaps') {
            styleAttr += ', style=dashed';
            styleAttr += ', arrowhead=none, arrowtail=none';
        } else if (link.relation === 'intersects') {
            styleAttr += ', style=dotted';
            styleAttr += ', arrowhead=none, arrowtail=none';
        } else if (link.relation === 'isCongruentWith') {
            styleAttr += ', arrowhead=none, arrowtail=none';
        }

        dotLines.push(`  "${sourceSafe}" -> "${targetSafe}" [${styleAttr}];`);
    });

    dotLines.push('}');
    const dotContent = dotLines.join('\n');

    try {
        const svgOutput = execSync('fdp -Tsvg', {
            input: dotContent,
            encoding: 'utf8'
        });
        return svgOutput;
    } catch (err) {
        throw new Error(`Graphviz CLI execution failed. Details: ${err.message}`);
    }
}

// ==========================================
// 4. PIPELINE EXECUTION
// ==========================================
config.profiles.forEach((profile, index) => {
    const inputPath = path.resolve(profile.inputFile);
    
    const originalOutput = path.resolve(profile.outputFile);
    const parsedPath = path.parse(originalOutput);
    const outputPath = path.join(parsedPath.dir, `${parsedPath.name}-gv${parsedPath.ext}`);

    if (!fs.existsSync(inputPath)) {
        console.log(`\x1b[33mSkipping Profile [${index + 1}]: Missing target input file:\x1b[0m\n  ${inputPath}`);
        return;
    }

    try {
        const cleanData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

        if (cleanData.conflicts && cleanData.conflicts.length > 0) {
            console.error(`\n\x1b[31m❌ PROFILE SKIPPED [Profile ${index + 1}]: Contradictory Mappings Detected!\x1b[0m`);
            return; 
        }

        const topology = compileGraphTopology(cleanData, config.mergeCongruent);
        if (!topology) return;

        const svgContent = renderGraphvizSvg(topology);
        const outputDir = path.dirname(outputPath);

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, svgContent);

        console.log(`\x1b[32m✔ Built Graphviz FDP Map Layer [${index + 1}]:\x1b[0m ${path.basename(outputPath)}`);
    } catch (err) {
        console.error(`\x1b[31mFailed compiling layout index [${index + 1}]:\x1b[0m`, err.message);
    }
});