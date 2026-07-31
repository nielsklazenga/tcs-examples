import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import jsonld from 'jsonld';

export async function generateSvgForFile(inputPath, outputPath, options = {}) {
    const config = options.config || {};
    const engine = options.engine || config.defaults?.engine || 'dot';
    const highlight = options.highlight || null;
    const contextFilePath = config.defaults?.contextFile || null;
    
    const COLOR_PALETTE = config.defaults?.colorPalette || {};
    const PREDICATE_RANGES = config.defaults?.predicateRanges || {};
    const CONTROLLED_VOCABULARIES = config.defaults?.controlledVocabularies || {};
    const HIGHLIGHT_STYLE = config.defaults?.highlightStyle || { 
        fill: '#FFEBEE', 
        stroke: '#D32F2F', 
        penwidth: '1.8',
        fontname: 'Arial Bold',
        fontsize: '11'
    };

    const useSplines = engine === 'dot' ? 'true' : 'false';
    const isSpringLayout = ['neato', 'fdp', 'sfdp'].includes(engine);

    const DOT_CONFIG = `
        ${isSpringLayout ? '' : 'rankdir=LR;'}
        splines=${useSplines};
        overlap=false;       
        maxiter=500;         
        nodesep=0.5;
        ranksep=0.8;
        node [fontname="Arial,Helvetica", fontsize=10, style="filled,rounded"];
        edge [fontname="Arial,Helvetica", fontsize=9, color="#546E7A", fontcolor="#37474F", arrowsize=0.7];
    `;

    // 1. Load and parse JSON-LD
    const rawContent = fs.readFileSync(path.resolve(inputPath), 'utf8');
    const jsonParsed = JSON.parse(rawContent);

    let localContextObj = null;
    if (contextFilePath && fs.existsSync(contextFilePath)) {
        localContextObj = JSON.parse(fs.readFileSync(contextFilePath, 'utf8'));
    }

    if (localContextObj) {
        if (jsonParsed['@context'] && typeof jsonParsed['@context'] === 'string' && jsonParsed['@context'].includes('tdwg/tcs2')) {
            jsonParsed['@context'] = localContextObj['@context'];
        } else if (Array.isArray(jsonParsed['@context'])) {
            jsonParsed['@context'] = jsonParsed['@context'].map(ctx => {
                if (typeof ctx === 'string' && ctx.includes('tdwg/tcs2')) return localContextObj['@context'];
                return ctx;
            });
        }
    }

    const rdfQuads = await jsonld.toRDF(jsonParsed);
    let triples = rdfQuads.map(quad => ({ 
        subject: quad.subject, 
        predicate: quad.predicate, 
        object: quad.object 
    }));

    const nodeTypeMap = new Map();
    const listHubs = new Set();
    const listMembers = new Map(); 

    triples.forEach(t => {
        if (t.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first') {
            if (t.subject.termType === 'BlankNode') {
                listHubs.add(t.subject.value);
                nodeTypeMap.set(t.subject.value, 'RDFList');
            }
        }
        if (t.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
            const cleanType = t.object.value.split('/').pop().split('#').pop();
            nodeTypeMap.set(t.subject.value, cleanType);
        }
        const localPred = t.predicate.localName || t.predicate.value.split('/').pop().split('#').pop();
        if (PREDICATE_RANGES[localPred] && t.object.termType !== 'Literal') {
            nodeTypeMap.set(t.object.value, PREDICATE_RANGES[localPred]);
        }
    });

    if (listHubs.size > 0) {
        const firstMap = new Map();
        const restMap = new Map();

        triples.forEach(t => {
            if (t.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first') {
                firstMap.set(t.subject.value, t.object);
            }
            if (t.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest') {
                restMap.set(t.subject.value, t.object.value);
            }
        });

        listHubs.forEach(hubId => {
            let currentId = hubId;
            let items = [];
            while (currentId && firstMap.has(currentId)) {
                const itemObj = firstMap.get(currentId);
                items.push(itemObj);
                currentId = restMap.get(currentId);
            }
            listMembers.set(hubId, items);
        });

        const incomingListPointers = new Map(); 
        triples.forEach(t => {
            if (listHubs.has(t.object.value) && t.predicate.value !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first' && t.predicate.value !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest') {
                incomingListPointers.set(t.subject.value + '::' + t.predicate.value, {
                    subject: t.subject,
                    predicate: t.predicate,
                    listHubId: t.object.value
                });
            }
        });

        triples = triples.filter(t => {
            if (listHubs.has(t.subject.value)) return false;
            if (listHubs.has(t.object.value) && t.predicate.value !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first' && t.predicate.value !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest') return false;
            if (t.predicate.value.includes('www.w3.org/1999/02/22-rdf-syntax-ns#')) return false;
            return true;
        });

        incomingListPointers.forEach((ptr) => {
            const items = listMembers.get(ptr.listHubId) || [];
            items.forEach(item => {
                triples.push({
                    subject: ptr.subject,
                    predicate: ptr.predicate,
                    object: item
                });
            });
        });
    }

    triples.forEach(t => {
        if (t.predicate.value.endsWith('#value') || t.predicate.value.endsWith('/value')) {
            nodeTypeMap.set(t.subject.value, 'ValueNode');
        }
    });

    function wrapText(text, maxLineLength = 40) {
        if (!text) return '';
        const words = text.split(' ');
        let currentLine = words[0] || '';
        let wrappedText = '';

        for (let i = 1; i < words.length; i++) {
            if (currentLine.length + words[i].length + 1 <= maxLineLength) {
                currentLine += ' ' + words[i];
            } else {
                wrappedText += currentLine + '\\l';
                currentLine = words[i];
            }
        }
        wrappedText += currentLine;
        wrappedText += '\\l';
        return wrappedText;
    }

    function checkHighlight(val, shortVal) {
        if (!highlight) return false;
        const highlights = Array.isArray(highlight) ? highlight : [highlight];
        for (const h of highlights) {
            if (h.type === 'node' && val === h.value) return true;
            if (h.type === 'type' && (shortVal.toLowerCase() === h.value.toLowerCase() || val.toLowerCase().includes(h.value.toLowerCase()))) return true;
            if (h.type === 'vocab' && shortVal.toLowerCase() === h.value.toLowerCase()) return true;
        }
        return false;
    }

    function formatDotNode(node) {
        const termValue = node && node.value ? node.value : (node && node.id ? node.id : String(node));
        const id = `"${termValue.replace(/"/g, '\\"')}"`;

        if (node && node.termType === 'Literal') {
            const cleanLiteral = termValue.replace(/"/g, '\\"').replace(/\r?\n|\r/g, ' ');
            const wrappedLiteral = wrapText(cleanLiteral, 40); // 40 characters is a solid default
            return { 
                id, 
                isTypeNode: false, 
                definition: `${id} [shape=box, style="filled,rounded", fillcolor="#FFFFFF", color="#B0BEC5", label="${wrappedLiteral}"];` 
            };
        }

        const resolvedType = nodeTypeMap.get(termValue) || 'DefaultResource';
        const theme = COLOR_PALETTE[resolvedType] || COLOR_PALETTE['DefaultResource'] || { fill: '#E0E0E0', stroke: '#212121' };

        let isHighlighted = false;
        if (highlight) {
            const highlights = Array.isArray(highlight) ? highlight : [highlight];
            for (const h of highlights) {
                if (h.type === 'node' && termValue === h.value) {
                    isHighlighted = true;
                    break;
                }
                if (h.type === 'type' && (resolvedType.toLowerCase() === h.value.toLowerCase() || termValue.toLowerCase().includes(h.value.toLowerCase()))) {
                    isHighlighted = true;
                    break;
                }
            }
        }

        const fill = theme.fill;
        const stroke = theme.stroke;
        const penwidth = isHighlighted ? HIGHLIGHT_STYLE.penwidth : "1.0";
        const fontAttrs = isHighlighted ? ` fontname="${HIGHLIGHT_STYLE.fontname}"` : '';

        const isBlankNode = node.termType === 'BlankNode' || termValue.startsWith('_:');
        const label = isBlankNode 
            ? `${resolvedType}` 
            : `${resolvedType}\\n${termValue}`;

        return {
            id,
            isTypeNode: false,
            definition: `${id} [shape=ellipse, style="filled", fillcolor="${fill}", color="${stroke}", penwidth=${penwidth},${fontAttrs} label="${label}"];`
        };
    }

    let nodeDefinitions = new Set();
    let edges = [];

    triples.forEach(triple => {
        if (triple.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
            return;
        }

        const subject = formatDotNode(triple.subject);
        
        let objectId;
        let objectDefinition;

        const resolvedObjVal = triple.object.value || triple.object.id || '';
        const matchedVocabName = Object.keys(CONTROLLED_VOCABULARIES).find(className => {
            return resolvedObjVal.startsWith(CONTROLLED_VOCABULARIES[className]);
        });

        if (matchedVocabName) {
            const shortTermValue = resolvedObjVal.split(/[#/]/).pop() || resolvedObjVal;
            const subjectValue = triple.subject.value || triple.subject.id;
            const uniqueVocabKey = `vcb_${subjectValue.replace(/[^a-zA-z0-9]/g, '')}_${triple.predicate.value.split(/[#/]/).pop()}_${Math.random().toString(36).substring(2, 7)}`;
            objectId = `"${uniqueVocabKey}"`;
            
            const isHighlighted = checkHighlight(resolvedObjVal, shortTermValue);
            
            const fillcolor = "#FFFDE7";
            const color = "#FBC02D";
            const penwidth = isHighlighted ? HIGHLIGHT_STYLE.penwidth : "1.0";
            const fontAttrs = isHighlighted ? ` fontname="${HIGHLIGHT_STYLE.fontname}"` : '';

            objectDefinition = `${objectId} [shape=box, style="filled,rounded", fillcolor="${fillcolor}", color="${color}", penwidth=${penwidth},${fontAttrs} label="${shortTermValue}"];`;
        }
        else if (triple.object.termType === 'Literal') {
            const subjectValue = triple.subject.value || triple.subject.id;
            const uniqueLiteralKey = `lit_${subjectValue.replace(/[^a-zA-z0-9]/g, '')}_${triple.predicate.value.split(/[#/]/).pop()}_${Math.random().toString(36).substring(2, 7)}`;
            objectId = `"${uniqueLiteralKey}"`;
            
            const cleanLiteral = resolvedObjVal.replace(/"/g, '\\"').replace(/\r?\n|\r/g, '  ');
            const wrappedLiteral = wrapText(cleanLiteral, 40); // Added wrapText here
            objectDefinition = `${objectId} [shape=box, style="filled,rounded", fillcolor="#FFFFFF", color="#B0BEC5", label="${wrappedLiteral}"];`;
        }
        else {
            const object = formatDotNode(triple.object);
            objectId = object.id;
            objectDefinition = object.definition;
        }

        const predLabel = triple.predicate.value.split('/').pop().split('#').pop();
        
        let edgeColor = "#546E7A";
        let edgePenWidth = "1.0";
        let edgeFontAttrs = "";

        if (highlight) {
            const highlights = Array.isArray(highlight) ? highlight : [highlight];
            for (const h of highlights) {
                if (h.type === 'predicate' && (triple.predicate.value === h.value || predLabel === h.value)) {
                    edgeColor = HIGHLIGHT_STYLE.stroke;
                    edgePenWidth = HIGHLIGHT_STYLE.penwidth;
                    edgeFontAttrs = ` fontname="${HIGHLIGHT_STYLE.fontname}"`;
                    break;
                }
            }
        }

        nodeDefinitions.add(subject.definition);
        nodeDefinitions.add(objectDefinition);
        edges.push(`${subject.id} -> ${objectId} [label="${predLabel}", color="${edgeColor}", penwidth=${edgePenWidth}${edgeFontAttrs}];`);
    });

    let dotBody = [
        'digraph Taxonomic_Data_Graph {',
        DOT_CONFIG,
        '    // Taxonomy Nodes',
        ...Array.from(nodeDefinitions).map(line => `    ${line}`),
        '\n    // Relationships',
        ...edges.map(line => `    ${line}`),
        '}'
    ].join('\n');

    // console.log(dotBody);
    const svgBuffer = execSync(`${engine} -Tsvg`, { input: dotBody, maxBuffer: 1024 * 1024 * 50 });
    let fluidSvg = svgBuffer.toString()
        .replace(/width="[^"]+"/, 'width="100%"')
        .replace(/height="[^"]+"/, 'height="100%"');

    fluidSvg = fluidSvg
        .replace(/font-family="([^"]+)\s+Bold\s+Italic"/gi, 'font-family="$1" font-weight="bold" font-style="italic"')
        .replace(/font-family="([^"]+)\s+Bold"/gi, 'font-family="$1" font-weight="bold"')
        .replace(/font-family="([^"]+)\s+Italic"/gi, 'font-family="$1" font-style="italic"');

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, fluidSvg);
    console.log(`  \x1b[32m✔ Generated SVG:\x1b[0m ${outputPath} (Engine: ${engine})`);
}