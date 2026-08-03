/**
 * Stage 1 Pipeline Utility: parse-jsonld-to-mapping.js (ESM Node Reference Safe)
 * Sanitises raw JSON-LD or Web Annotations using an infinite-loop-proof graph traversal.
 * Handles both explicit TaxonConceptMappings and embedded relationship arrays.
 * Usage: node parse-jsonld-to-mapping.js <input.jsonld> <output.json>
 */

import fs from 'fs';
import path from 'path';

const inputArg = process.argv[2];
const outputArg = process.argv[3];

if (!inputArg || !outputArg) {
    console.error('\x1b[31mError: Missing arguments.\x1b[0m');
    console.log('Usage: node parse-jsonld-to-mapping.js <input.jsonld> <output.json>');
    process.exit(1);
}

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);

if (!fs.existsSync(inputPath)) {
    console.error(`\x1b[31mError: Input file does not exist at:\x1b[0m\n${inputPath}`);
    process.exit(1);
}

let fileContent;
try {
    fileContent = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (err) {
    console.error('\x1b[31mError reading or parsing the JSON-LD payload:\x1b[0m', err.message);
    process.exit(1);
}

// Global collections
const conceptRegistry = new Map();
const mappingPayloads = [];

// Track memory references of objects we have already visited to prevent graph looping
const visitedObjects = new Set();

// List of semantic mapping properties that can be directly embedded in a TaxonConcept
const tcsRelationKeys = [
    "isCongruentWith",
    "includes",
    "isIncludedIn",
    "partiallyOverlaps",
    "intersects",
    "isDisjointFrom"
];

/**
 * Clean recursive graph walker that never visits the same internal node twice
 */
function scanJsonLdGraph(obj) {
    if (!obj || typeof obj !== 'object') return;

    if (visitedObjects.has(obj)) return;
    visitedObjects.add(obj);

    // 1. Index Core Concept Labels
    if (obj.type === "TaxonConcept") {
        const id = obj.id || obj["dcterms:title"];
        const label = obj["taxonConceptLabel"] || obj["dcterms:title"] || obj.taxonName?.nameString;
        if (id) {
            conceptRegistry.set(id, label || null);
        }

        // 🌟 NEW PASSTHROUGH: Check if this Concept has embedded inline mappings
        tcsRelationKeys.forEach(relationKey => {
            if (obj[relationKey]) {
                // Ensure target value is treated as an array loop
                const targets = Array.isArray(obj[relationKey]) ? obj[relationKey] : [obj[relationKey]];
                
                targets.forEach(target => {
                    // Synthesise an explicit standard Mapping proxy payload on the fly
                    mappingPayloads.push({
                        type: "TaxonConceptMapping",
                        mappingRelation: relationKey,
                        subjectTaxonConcept: obj, // The parent concept is the Subject
                        objectTaxonConcept: target // The target concept is the Object
                    });
                });
            }
        });
    }

    // 2. Collect Explicit Mapping Profiles
    if (obj.type === "TaxonConceptMapping" || obj.type === "oa:Annotation") {
        mappingPayloads.push(obj);
    }

    // 3. Structural Deep Walk
    if (Array.isArray(obj)) {
        obj.forEach(item => scanJsonLdGraph(item));
    } else {
        Object.values(obj).forEach(val => {
            if (val && typeof val === 'object') {
                scanJsonLdGraph(val);
            }
        });
    }
}

function extractTcsTriads(rawData) {
    const conceptsMap = new Map();
    const mappings = [];
    const conflicts = [];
    
    // De-duplication trackers for the execution run
    const seenExactTriads = new Set();
    const seenSubjectObjects = new Set();

    // Populate collections via safety-guarded deep traversal pass
    scanJsonLdGraph(rawData);

    mappingPayloads.forEach(item => {
        let mappingPayload = null;

        if (item.type === "oa:Annotation" && item["oa:hasBody"]) {
            mappingPayload = item["oa:hasBody"];
        } else if (item.type === "TaxonConceptMapping") {
            if (item._processedByAnnotation) return;
            mappingPayload = item;
        }

        if (!mappingPayload) return;

        // Prevent double evaluation when stepping through standalone arrays
        if (item.type === "oa:Annotation" && item["oa:hasBody"]) {
            item["oa:hasBody"]._processedByAnnotation = true;
        }

        const sub = mappingPayload.subjectTaxonConcept;
        const obj = mappingPayload.objectTaxonConcept;
        const relation = mappingPayload.mappingRelation;

        if (relation === "isDisjointFrom") return;

        const extractIdAndLabel = (nodeTarget) => {
            if (typeof nodeTarget === 'string') {
                const indexedLabel = conceptRegistry.get(nodeTarget);
                const nodeObj = { id: nodeTarget };
                if (indexedLabel) nodeObj.label = indexedLabel;
                return nodeObj;
            }
            if (nodeTarget && typeof nodeTarget === 'object') {
                const id = nodeTarget.id || nodeTarget["dcterms:title"];
                if (!id) return null;
                const label = nodeTarget["taxonConceptLabel"] || nodeTarget["dcterms:title"] || nodeTarget.taxonName?.nameString;
                const nodeObj = { id };
                if (label) nodeObj.label = label;
                return nodeObj;
            }
            return null;
        };

        const subjectNode = extractIdAndLabel(sub);
        const objectNode = extractIdAndLabel(obj);

        if (!subjectNode || !objectNode) return;

        // Populate concepts registry safely
        if (!conceptsMap.has(subjectNode.id)) {
            conceptsMap.set(subjectNode.id, subjectNode);
        } else if (subjectNode.label) {
            conceptsMap.get(subjectNode.id).label = subjectNode.label;
        }

        if (!conceptsMap.has(objectNode.id)) {
            conceptsMap.set(objectNode.id, objectNode);
        } else if (objectNode.label) {
            conceptsMap.get(objectNode.id).label = objectNode.label;
        }

        const exactTriadKey = `${subjectNode.id}|${relation}|${objectNode.id}`;
        const directionalPairKey = `${subjectNode.id}|${objectNode.id}`;

        // Pass A: Reject identical loops
        if (seenExactTriads.has(exactTriadKey)) return;
        
        // Pass B: Monitor mapping conflicts
        if (seenSubjectObjects.has(directionalPairKey)) {
            console.log(`\x1b[33m⚠️ Relationship Variation Found:\x1b[0m`);
            console.log(`  Sub: ${subjectNode.label || subjectNode.id}`);
            console.log(`  Obj: ${objectNode.label || objectNode.id}`);
            console.log(`  Conflicting Relation Type: "${relation}"\n`);

            conflicts.push({
                subject: subjectNode.id,
                relation: relation,
                object: objectNode.id
            });
        }

        seenExactTriads.add(exactTriadKey);
        seenSubjectObjects.add(directionalPairKey);

        mappings.push({
            subject: subjectNode.id,
            relation: relation,
            object: objectNode.id
        });
    });

    const output = {
        concepts: Array.from(conceptsMap.values()),
        mappings: mappings
    };

    if (conflicts.length) {
        output.conflicts = conflicts;
    }

    return output;
}

const cleanedPayload = extractTcsTriads(fileContent);

try {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(cleanedPayload, null, 2));
    console.log(`\x1b[32m✔ Data Preparation Complete:\x1b[0m ${path.basename(outputPath)} created (\x1b[36m${cleanedPayload.concepts.length}\x1b[0m concepts, \x1b[36m${cleanedPayload.mappings.length}\x1b[0m mappings).`);
} catch (err) {
    console.error('\x1b[31mExtraction engine writing error:\x1b[0m', err.message);
}
