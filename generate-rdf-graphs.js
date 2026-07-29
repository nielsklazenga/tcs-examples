import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Parser } from 'n3';

// Fixed paths matching your Jigsaw architecture
const SOURCE_DIR = path.resolve('source/_rdf');
const OUTPUT_DIR = path.resolve('source/assets/images/rdf');

// Check for engine flag in command arguments (defaults to 'dot')
const engineArgIndex = process.argv.indexOf('--engine');
const LAYOUT_ENGINE = (engineArgIndex !== -1 && process.argv[engineArgIndex + 1]) 
    ? process.argv[engineArgIndex + 1].toLowerCase() 
    : 'dot';

// Validate engine choice to prevent shell execution exploits
const VALID_ENGINES = ['dot', 'neato', 'fdp', 'sfdp', 'twopi', 'circo'];
if (!VALID_ENGINES.includes(LAYOUT_ENGINE)) {
    console.error(`\x1b[31m%s\x1b[0m`, `❌ Error: Invalid engine "${LAYOUT_ENGINE}". Choose from: ${VALID_ENGINES.join(', ')}`);
    process.exit(1);
}

// FIX: Avoid 'splines=true' on 'neato' to permanently stop Graphviz C-engine segmentation faults
const useSplines = LAYOUT_ENGINE === 'dot' ? 'true' : 'false';
const isSpringLayout = ['neato', 'fdp', 'sfdp'].includes(LAYOUT_ENGINE);

const DOT_CONFIG = `
    ${isSpringLayout ? '' : 'rankdir=LR;'}
    splines=${useSplines};
    overlap=false;       // Critical for neato to push nodes apart
    nodesep=0.5;
    ranksep=0.8;
    node [fontname="Arial,Helvetica", fontsize=10, style="filled,rounded"];
    edge [fontname="Arial,Helvetica", fontsize=9, color="#546E7A", fontcolor="#37474F", arrowsize=0.7];
`;

/**
 * Splits long literal text into manageable chunks at word boundaries.
 */
function chunkText(str, maxChars = 45) {
    const words = str.split(' ');
    let lines = [];
    let currentLine = '';

    for (let word of words) {
        if ((currentLine + word).length > maxChars) {
            if (currentLine) lines.push(currentLine.trim());
            currentLine = word + ' ';
        } else {
            currentLine += word + ' ';
        }
    }
    if (currentLine) lines.push(currentLine.trim());
    return lines.join('\\n');
}

/**
 * Formats individual RDF Terms into clean DOT configurations.
 */
function formatDotNode(term, typeNodesSet) {
    const id = `"${term.value.replace(/"/g, '\\"')}"`;
    
    switch (term.termType) {
        case 'NamedNode':
            let label = term.value.split(/[#/]/).pop() || term.value;
            if (typeNodesSet.has(id)) {
                return { id, definition: `${id} [shape=ellipse, fillcolor="#F3E5F5", color="#8E24AA", penwidth=2, label="${label}"];` };
            }
            return { id, definition: `${id} [shape=ellipse, fillcolor="#E3F2FD", color="#1E88E5", penwidth=1.5, label="${label}"];` };

        case 'BlankNode':
            return { id, definition: `${id} [shape=circle, style="dashed,filled", fillcolor="#ECEFF1", color="#78909C", label=""];` };

        case 'Literal':
        default:
            const cleanLiteral = term.value.replace(/"/g, '\\"').replace(/\r?\n|\r/g, ' ');
            const wrappedLabel = chunkText(cleanLiteral, 45);
            return { id, definition: `${id} [shape=box, fillcolor="#FFF3E0", color="#FB8C00", label="${wrappedLabel}"];` };
    }
}

/**
 * Assembles parsed RDF triples into a valid Graphviz DOT string syntax.
 */
function triplesToDot(triples) {
    const nodeDefinitions = new Set();
    const edges = [];
    
    const typeNodesSet = new Set();
    for (const triple of triples) {
        const predicateLabel = triple.predicate.value.split(/[#/]/).pop() || triple.predicate.value;
        if (predicateLabel === 'type') {
            const objectId = `"${triple.object.value.replace(/"/g, '\\"')}"`;
            typeNodesSet.add(objectId);
        }
    }

    for (const triple of triples) {
        const subject = formatDotNode(triple.subject, typeNodesSet);
        const object = formatDotNode(triple.object, typeNodesSet);
        const predicateLabel = triple.predicate.value.split(/[#/]/).pop() || triple.predicate.value;

        nodeDefinitions.add(subject.definition);
        nodeDefinitions.add(object.definition);
        
        if (predicateLabel === 'type') {
            edges.push(`${subject.id} -> ${object.id} [label="${predicateLabel}", color="#8E24AA", style="dashed"];`);
        } else {
            edges.push(`${subject.id} -> ${object.id} [label="${predicateLabel}"];`);
        }
    }

    return ['digraph VicFlora_RDF_Graph {', DOT_CONFIG, '    // Node Formats', ...Array.from(nodeDefinitions).map(line => `    ${line}`), '\n    // Relationships', ...edges.map(line => `    ${line}`), '}'].join('\n');
}

// Ensure the asset output directory exists before writing files
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

try {
    const files = fs.readdirSync(SOURCE_DIR).filter(file => file.endsWith('.ttl'));
    
    if (files.length === 0) {
        console.log('ℹ️ No Turtle (.ttl) files found in source/_rdf/');
        process.exit(0);
    }

    console.log(`🚀 Using layout engine: \x1b[36m${LAYOUT_ENGINE.toUpperCase()}\x1b[0m`);
    console.log(`🚀 Found ${files.length} Turtle files. Commencing batch compilation...`);

    let successCount = 0;
    let failureCount = 0;

    for (const file of files) {
        const inputFilePath = path.join(SOURCE_DIR, file);
        
        const suffix = LAYOUT_ENGINE === 'dot' ? '' : `-${LAYOUT_ENGINE}`;
        const outputFileName = file.replace('.ttl', `${suffix}.svg`);
        const outputFilePath = path.join(OUTPUT_DIR, outputFileName);

        try {
            const rawData = fs.readFileSync(inputFilePath, 'utf8');
            const parser = new Parser();
            const triples = parser.parse(rawData);
            const dotString = triplesToDot(triples);

            // Execute compilation with the chosen engine
            const svgBuffer = execSync(`${LAYOUT_ENGINE} -Tsvg`, { input: dotString, maxBuffer: 1024 * 1024 * 50 });
            
            let fluidSvg = svgBuffer.toString()
                .replace(/width="[^"]+"/, 'width="100%"')
                .replace(/height="[^"]+"/, 'height="100%"');

            fs.writeFileSync(outputFilePath, fluidSvg);
            console.log(`  \x1b[32m%s\x1b[0m`, `🔹 Compiled: ${file} ➔ assets/images/rdf/${outputFileName}`);
            successCount++;

        } catch (fileErr) {
            console.error(`  \x1b[31m%s\x1b[0m`, `❌ Skipped "${file}": ${fileErr.message.trim()}`);
            failureCount++;
        }
    }

    console.log('\n=========================================');
    console.log(`📊 Processing complete: ${successCount} successful, ${failureCount} skipped.`);
    console.log('=========================================\n');

} catch (err) {
    console.error('\n\x1b[31m%s\x1b[0m', '❌ Core Directory Scanner Failure:', err.message);
    process.exit(1);
}
