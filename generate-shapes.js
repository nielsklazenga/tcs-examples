import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Parser } from 'n3';
import jsonld from 'jsonld';

const SOURCE_DIR = path.resolve('source/_rdf');
const OUTPUT_DIR = path.resolve('source/assets/images/shapes');

const engineArgIndex = process.argv.indexOf('--engine');
const LAYOUT_ENGINE = (engineArgIndex !== -1 && process.argv[engineArgIndex + 1]) 
    ? process.argv[engineArgIndex + 1].toLowerCase() 
    : 'dot';

const useSplines = LAYOUT_ENGINE === 'dot' ? 'true' : 'false';
const isSpringLayout = ['neato', 'fdp', 'sfdp'].includes(LAYOUT_ENGINE);

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

/**
 * Master mapping dictionary linking your preferred, customized visual labels
 * directly to their official, fully qualified GBIF base vocabulary IRIs.
 */
const CONTROLLED_VOCABULARIES = {
    'TaxonRank':                   'http://rs.gbif.org/vocabulary/gbif/rank/',
    'NomenclaturalCode':           'http://rs.gbif.org/vocabulary/gbif/nomenclatural_code/',
    'NomenclaturalStatus':         'http://rs.gbif.org/vocabulary/gbif/nomenclatural_status/',
    'TypeOfType':                  'http://rs.gbif.org/vocabulary/gbif/type_status/',
    'EPSG':                        'https://epsg.io/',
    'OA':                          'http://www.w3.org/ns/oa#',
    'TCS':                         'http://rs.tdwg.org/tcs/terms/',
};

/**
 * Clean presentation-friendly color themes grouped by core metadata classes.
 */
const COLOR_PALETTE = {
    // --- Your original categories (darker/stronger versions) ---
    'TaxonConcept':          { fill: '#C8E6C9', stroke: '#1B5E20' }, // Vibrant Green
    'TaxonConceptMapping':   { fill: '#D1C4E9', stroke: '#311B92' }, // Vibrant Deep Purple/Indigo

    'TaxonName':             { fill: '#FFCDD2', stroke: '#B71C1C' }, // Vibrant Red
    'VernacularName':        { fill: '#FFCDD2', stroke: '#B71C1C' }, // Vibrant Red
    'NomenclaturalType':     { fill: '#FFE0B2', stroke: '#E65100' }, // Vibrant Orange

    'BibliographicResource': { fill: '#BBDEFB', stroke: '#0D47A1' }, // Vibrant Blue
    'AcademicArticle':       { fill: '#BBDEFB', stroke: '#0D47A1' }, // Vibrant Blue
    'Book':                  { fill: '#BBDEFB', stroke: '#0D47A1' }, // Vibrant Blue
    'Chapter':               { fill: '#BBDEFB', stroke: '#0D47A1' }, // Vibrant Blue
    'Website':               { fill: '#BBDEFB', stroke: '#0D47A1' }, // Vibrant Blue
    'Report':                { fill: '#BBDEFB', stroke: '#0D47A1' }, // Vibrant Blue
    'Dataset':               { fill: '#BBDEFB', stroke: '#0D47A1' }, // Vibrant Blue
    'Issue':               { fill: '#BBDEFB', stroke: '#0D47A1' }, // Vibrant Blue
    'Journal':               { fill: '#BBDEFB', stroke: '#0D47A1' }, // Vibrant Blue

    'Agent':                 { fill: '#B2DFDB', stroke: '#004D40' }, // Vibrant Teal
    'Person':                { fill: '#B2DFDB', stroke: '#004D40' }, // Vibrant Teal
    'Group':                 { fill: '#B2DFDB', stroke: '#004D40' }, // Vibrant Teal
    'Organization':          { fill: '#B2DFDB', stroke: '#004D40' }, // Vibrant Teal
    'OrganizationalUnit':    { fill: '#B2DFDB', stroke: '#004D40' }, // Vibrant Teal

    // --- New requested categories ---
    'TaxonPublication':      { fill: '#E1BEE7', stroke: '#4A148C' }, // Vibrant Purple

    // --- Additional versatile categories ---
    'Property':           { fill: '#FFF9C4', stroke: '#F57F17' }, // Vibrant Yellow/Amber
    'Annotation':        { fill: '#F8BBD0', stroke: '#880E4F' }, // Vibrant Pink
    
    'PreservedSpecimen':         { fill: '#D1C4E9', stroke: '#311B92' }, // Vibrant Deep Purple/Indigo
    'MaterialCitation':         { fill: '#D1C4E9', stroke: '#311B92' }, // Vibrant Deep Purple/Indigo

    'Occurrence':            { fill: '#FCE4EC', stroke: '#880E4F' }, // Deep Rose Pink (Distinct from Red/Orange)
    'Event':                 { fill: '#FCE4EC', stroke: '#880E4F' }, 

    'Location':              { fill: '#FFF3E0', stroke: '#E65100' }, // Warm Ochre/Amber (Distinct from Light Orange)

    'Identification':        { fill: '#C5CAE9', stroke: '#1A237E' }, // Deeper Indigo (clearly distinct from grey)

    'RDFList':               { fill: '#ECEFF1', stroke: '#78909C' }, 
    'ValueNode':             { fill: '#ECEFF1', stroke: '#78909C' }, 

    // --- Default fallback ---
    'DefaultResource':       { fill: '#E0E0E0', stroke: '#212121' }  // Stronger Grey
};

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
    return lines.join('\\l') + '\\l';
}

function formatDotNode(term, nodeTypeMap) {
    const termValue = term && term.value ? term.value : (term && term.id ? term.id : String(term));
    const id = `"${termValue.replace(/"/g, '\\"')}"`;

    
    if (term && term.termType === 'Literal') {
        const cleanLiteral = termValue.replace(/"/g, '\\"').replace(/\r?\n|\r/g, ' ');
        const wrappedLabel = chunkText(cleanLiteral, 45);
        return { id, isTypeNode: false, definition: `${id} [shape=box, fillcolor="#FFFFFF", color="#B0BEC5", label="${wrappedLabel}"];` };
    }

    const resolvedType = nodeTypeMap.get(id) || 'DefaultResource';
    const theme = COLOR_PALETTE[resolvedType] || COLOR_PALETTE['DefaultResource'];
    
    let label = '';
    if (term && term.termType === 'NamedNode') {
        if (termValue.startsWith('List')) {
            label = termValue;
        }
        else {
            label = resolvedType + '\\n' + termValue;
        }
    }
    else {
        label = resolvedType
    }
    
    return {
        id,
        isTypeNode: id.toLowerCase().includes('ontology') || id.toLowerCase().includes('schema'),
        definition: `${id} [shape=ellipse, style="filled", fillcolor="${theme.fill}", color="${theme.stroke}", penwidth=1.0, label="${label}"];`
    };
}

function triplesToDot(rawTriples) {
    // --- LIST CONTAINER PRE-PROCESSOR ---
    const firstMap = new Map(); 
    const restMap = new Map();  
    const listOwners = new Map(); 

    for (const t of rawTriples) {
        const pred = t.predicate.value;
        const subj = t.subject.value || t.subject.id;
        if (pred === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first') {
            firstMap.set(subj, t.object);
        } else if (pred === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest') {
            restMap.set(subj, t.object.value || t.object.id);
        }
    }

    for (const t of rawTriples) {
        const pred = t.predicate.value;
        if (pred !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first' && 
            pred !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest') {
            const objVal = t.object.value || t.object.id;
            if (firstMap.has(objVal)) {
                listOwners.set(objVal, { subject: t.subject, predicate: t.predicate });
            }
        }
    }

    const triples = [];
    const consumedBlankNodes = new Set();
    const nodeTypeMap = new Map(); 

    let listCounter = 0;

    for (const [headBnode, owner] of listOwners.entries()) {
        consumedBlankNodes.add(headBnode);
        
        const subjectValue = owner.subject.value || owner.subject.id;
        const listHubId = `list_${subjectValue.replace(/[^a-zA-Z0-9]/g, '')}_${owner.predicate.value.split(/[#/]/).pop()}_${listCounter++}`;
        const listHubUri = `urn:uuid:${listHubId}`;
        const formattedListHubId = `"${listHubUri}"`;
        
        // ---> FORCE ALL LISTS TO A UNIFORM TYPE <---
        // Choose either 'RDFList' or 'DefaultResource' consistently:
        const resolvedType = 'RDFList'; 
        
        // Lock this type into the map so Pass 1 and Pass 3 respect it globally
        nodeTypeMap.set(formattedListHubId, resolvedType);

        const predLabel = owner.predicate.value.split(/[#/]/).pop();
        const listNodeObject = { termType: 'NamedNode', value: `List (${predLabel})`, id: listHubUri };

        triples.push({
            subject: owner.subject,
            predicate: owner.predicate,
            object: listNodeObject
        });

        let currentNode = headBnode;
        let itemIndex = 0;
        while (currentNode && currentNode !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil') {
            consumedBlankNodes.add(currentNode);
            const item = firstMap.get(currentNode);
            if (item) {
                // Ensure the list item is correctly structured as a NamedNode object
                const itemNode = typeof item === 'string' 
                    ? { termType: 'NamedNode', value: item } 
                    : item;

                triples.push({
                    subject: listNodeObject,
                    predicate: { value: `[item ${++itemIndex}]` },
                    object: itemNode
                });
            }
            currentNode = restMap.get(currentNode);
        }
    }

    for (const t of rawTriples) {
        const subj = t.subject.value || t.subject.id;
        const obj = t.object.value || t.object.id;
        const pred = t.predicate.value;

        const isListMachinery = 
            consumedBlankNodes.has(subj) || 
            consumedBlankNodes.has(obj) ||
            pred === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first' ||
            pred === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest';

        if (!isListMachinery) {
            triples.push(t);
        }
    }

    const nodeDefinitions = new Set();
    const edges = [];

    // 1. First Pass: Explicit types
    for (const triple of triples) {
        const objectIdUri = triple.object.id || '';
        const objectValue = triple.object.value || '';

        if (objectIdUri.startsWith('urn:uuid:list_') || objectValue.startsWith('List (')) {
            const listNodeKey = `"${(objectIdUri || objectValue).replace(/"/g, '\\"')}"`;
            nodeTypeMap.set(listNodeKey, 'RDFList');
        }

        const predicateLabel = triple.predicate.value.split(/[#/]/).pop() || triple.predicate.value;
        if (predicateLabel === 'type') {
            const subjectValue = triple.subject.value || triple.subject.id;
            const subjectId = `"${subjectValue.replace(/"/g, '\\"')}"`;
            const typeShortName = triple.object.value.split(/[#/]/).pop() || triple.object.value;
            nodeTypeMap.set(subjectId, typeShortName);
        }
    }

    // 2. Second Pass: Contextual Edge-Guessing Fallback (with safety check for list labels)
    for (const triple of triples) {
        const predicateLabel = triple.predicate.value.split(/[#/]/).pop() || triple.predicate.value;

        if (triple.object.termType === 'NamedNode') {
            const objectValue = triple.object.value || triple.object.id || '';
            
            // Absolute safety check: never let edge guessing touch list hub URIs
            if (objectValue.startsWith('urn:uuid:list_')) continue;

            const isVocab = Object.keys(CONTROLLED_VOCABULARIES).some(className => {
                return objectValue.startsWith(CONTROLLED_VOCABULARIES[className]);
            });

            if (isVocab) continue;

            const objectId = `"${objectValue.replace(/"/g, '\\"')}"`;

            if (!nodeTypeMap.has(objectId)) {
                if (objectId.startsWith('"List')) {
                    nodeTypeMap.set(objectId, 'RDFList');
                }
                else if ([
                        'taxonName', 
                        'synonym',
                        'basionym', 
                        'replacedName',
                        'basedOn',
                        'conservedAgainst',
                        'laterHomonymOf'
                    ].includes(predicateLabel)) {
                    nodeTypeMap.set(objectId, 'TaxonName');
                } 
                else if ([
                        'accordingTo', 
                        'publishedIn', 
                        'mappingAccordingTo', 
                        'typePublishedIn'
                    ].includes(predicateLabel)) {
                    nodeTypeMap.set(objectId, 'BibliographicResource');
                }
                else if ([
                        'parentTaxonConcept', 
                        'childTaxonConcept', 
                        'subjectTaxonConcept', 
                        'objectTaxonConcept',
                        'isCongruentWith',
                        'includes',
                        'isIncludedIn',
                        'partiallyOverlaps',
                        'isDisjointFrom',
                        'intersects'
                    ].includes(predicateLabel)) {
                    nodeTypeMap.set(objectId, 'TaxonConcept');
                }
                else if ([
                    'combinationAuthor',
                    'basionymAuthor',
                    'combinationAscribedAuthor',
                    'basionymAscribedAuthor',
                    'authorList'
                ].includes(predicateLabel)) {
                    nodeTypeMap.set(objectId, 'Person');
                }
            }
        }
        else if ([
            'value'
        ].includes(predicateLabel)) {
            const subjectValue = triple.subject.value || triple.subject.id || '';
            const subjectId = `"${subjectValue.replace(/"/g, '\\"')}"`;
            nodeTypeMap.set(subjectId, 'ValueNode');
        }
    }
    
    let literalCounter = 0;

    // 3. Third Pass: Relationships builder
    for (const triple of triples) {
        const predicateLabel = triple.predicate.value.split(/[#/]/).pop() || triple.predicate.value;
        if (predicateLabel === 'type') continue;

        const subject = formatDotNode(triple.subject, nodeTypeMap);
        let objectId;
        let objectDefinition;

        const objectIdUri = triple.object.id || '';
        const objectValue = triple.object.value || '';

        // Check if this object is our synthetic list node
        const isListHub = objectIdUri.startsWith('urn:uuid:list_') || objectValue.startsWith('List (');

        if (isListHub) {
            // Force the type map key for this list hub to treat it as an RDFList
            const listNodeKey = `"${(objectIdUri || objectValue).replace(/"/g, '\\"')}"`;
            nodeTypeMap.set(listNodeKey, 'RDFList');
        }

        // Now flow through the regular object resolution logic as requested
        const resolvedObjVal = objectValue || objectIdUri;
        const matchedVocabName = Object.keys(CONTROLLED_VOCABULARIES).find(className => {
            return resolvedObjVal.startsWith(CONTROLLED_VOCABULARIES[className]);
        });

        if (matchedVocabName) {
            const shortTermValue = resolvedObjVal.split(/[#/]/).pop() || resolvedObjVal;
            const subjectValue = triple.subject.value || triple.subject.id;
            const uniqueVocabKey = `vcb_${subjectValue.replace(/[^a-zA-z0-9]/g, '')}_${predicateLabel}_${literalCounter++}`;
            objectId = `"${uniqueVocabKey}"`;
            
            const wrappedLabel = chunkText(shortTermValue, 45);
            objectDefinition = `${objectId} [shape=box, style="filled", fillcolor="#FFFDE7", color="#FBC02D", label="${wrappedLabel}"];`;
        } 
        else if (triple.object.termType === 'Literal') {
            const subjectValue = triple.subject.value || triple.subject.id;
            const uniqueLiteralKey = `lit_${subjectValue.replace(/[^a-zA-z0-9]/g, '')}_${predicateLabel}_${literalCounter++}`;
            objectId = `"${uniqueLiteralKey}"`;
            
            const cleanLiteral = objectValue.replace(/"/g, '\\"').replace(/\r?\n|\r/g, '  ');
            const wrappedLabel = chunkText(cleanLiteral, 45);
            objectDefinition = `${objectId} [shape=box, fillcolor="#FFFFFF", color="#B0BEC5", label="${wrappedLabel}"];`;
        } 
        else {
            const object = formatDotNode(triple.object, nodeTypeMap);
            objectId = object.id;
            objectDefinition = object.definition;
            if (object.isTypeNode) continue;
        }

        if (subject.isTypeNode) continue;

        nodeDefinitions.add(subject.definition);
        nodeDefinitions.add(objectDefinition);
        edges.push(`${subject.id} -> ${objectId} [label="${predicateLabel}"];`);
    }

    return ['digraph Taxonomic_Data_Graph {', DOT_CONFIG, '    // Taxonomy Nodes', ...Array.from(nodeDefinitions).map(line => `    ${line}`), '\n    // Relationships', ...edges.map(line => `    ${line}`), '}'].join('\n');
}

(async () => {
    try {
        const files = fs.readdirSync(SOURCE_DIR).filter(file => file.endsWith('.ttl') || file.endsWith('.jsonld'));
        if (files.length === 0) process.exit(0);

        const localContextPath = path.join(SOURCE_DIR, 'context.jsonld');
        let localContextObj = null;
        if (fs.existsSync(localContextPath)) {
            localContextObj = JSON.parse(fs.readFileSync(localContextPath, 'utf8'));
        }

        console.log(`🚀 Processing unified RDF datasets via engine: \x1b[36m${LAYOUT_ENGINE.toUpperCase()}\x1b[0m`);
        const dataFiles = files.filter(f => f !== 'context.jsonld');

        for (const file of dataFiles) {
            const inputFilePath = path.join(SOURCE_DIR, file);
            const ext = path.extname(file);
            
            const typeTag = ext === '.ttl' ? '-ttl-shape' : '-jsonld-shape';
            const suffix = LAYOUT_ENGINE === 'dot' ? typeTag : `${typeTag}-${LAYOUT_ENGINE}`;
            const outputFileName = file.replace(ext, `${suffix}.svg`);
            const outputFilePath = path.join(OUTPUT_DIR, outputFileName);

            try {
                const rawData = fs.readFileSync(inputFilePath, 'utf8');
                let triples = [];

                if (ext === '.ttl') {
                    const parser = new Parser();
                    triples = parser.parse(rawData);
                } 
                else if (ext === '.jsonld') {
                    const jsonParsed = JSON.parse(rawData);
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
                    triples = rdfQuads.map(quad => ({ subject: quad.subject, predicate: quad.predicate, object: quad.object }));

                    const listHubs = new Set();
                    triples.forEach(t => {
                        if (t.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first') {
                            if (t.subject.termType === 'BlankNode') {
                                listHubs.add(t.subject.value);
                            }
                        }
                    });
                }

                const dotString = triplesToDot(triples);
                const svgBuffer = execSync(`${LAYOUT_ENGINE} -Tsvg`, { input: dotString, maxBuffer: 1024 * 1024 * 50 });
                let fluidSvg = svgBuffer.toString().replace(/width="[^"]+"/, 'width="100%"').replace(/height="[^"]+"/, 'height="100%"');

                fs.writeFileSync(outputFilePath, fluidSvg);
                console.log(`  \x1b[32m%s\x1b[0m`, `🔹 Shape Vector Generated: ${outputFileName}`);
            } catch (fileErr) {
                console.error(`  \x1b[31m%s\x1b[0m`, `❌ Skipped "${file}": ${fileErr.message.trim()}`);
            }
        }
        console.log('\n\x1b[32m%s\x1b[0m', '🏁 Unified presentation asset sweep complete!');
    } catch (err) {
        console.error(err);
    }
})();
