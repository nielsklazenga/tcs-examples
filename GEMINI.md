# Gemini Handover Notes: TCS 2 & RDF Visualization Pipeline

## Overview
This file contains the complete architectural context, structural decisions, and configuration parameters developed for the **VicFlora Documentation and TDWG TCS 2 Microsite Project**. It is designed to be fed directly into a fresh chat window or a Notebook to resume development seamlessly without losing conversational state.

---

## 1. Project Architecture & Decisions
*   **Separation of Concerns:** The **VicFlora operational platform** (custom regional ontology) is decoupled from the **TDWG TCS 2 compliance examples/recipes**. They live in separate repositories to avoid creating a bloated "kitchen sink" site framework.
*   **Shared Layout Module:** Component and style consistency across the site swarm is managed centrally via a shared components repository integrated as a **Git Submodule**.
*   **Native C-Engine Overrides:** Graphviz version `2.43.0` inside the Laradock workspace features native memory leaks when routing complex lines (`splines=true`) around dense `neato` layouts. The scripts conditionally bypass this by forcing `splines=false` for spring-physics engines to prevent segmentation faults (`double free or corruption`).
*   **Data Resolution Strategy:** The pipeline maps both **Turtle (`.ttl`)** and **JSON-LD (`.jsonld`)** files. To prevent infinite HTTP loops and handle network boundaries within Laradock, an **offline context payload pre-injection layer** intercepts remote GitHub requests and parses them entirely in-memory.

---

## 2. Dynamic Style Mapping Configuration

To maintain clean and presentation-ready visual taxonomy layouts without structural RDF blueprint noise, the custom compilation script relies on a decoupled, keyword-resilient dictionary map. The dictionary keys cascade straight into the node mapping registry, seamlessly driving both typography labels and your color palette settings.

```javascript
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
    'OA':                          'http://www.w3.org/ns/oa#'
};

/**
 * Clean presentation-friendly color themes grouped by core metadata classes.
 * Vocabulary boxes render using an independent soft cream-yellow theme to match
 * your customized text strings exactly.
 */
const COLOR_PALETTE = {
    // --- Your original categories (darker/stronger versions) ---
    'TaxonConcept':          { fill: '#C8E6C9', stroke: '#1B5E20' }, // Vibrant Green
    'TaxonConceptMapping':   { fill: '#D1C4E9', stroke: '#311B92' }, // Vibrant Deep Purple/Indigo

    'TaxonName':             { fill: '#FFCDD2', stroke: '#B71C1C' }, // Vibrant Red
    'NomenclaturalType':     { fill: '#FFE0B2', stroke: '#E65100' }, // Vibrant Orange

    'BibliographicResource': { fill: '#BBDEFB', stroke: '#0D47A1' }, // Vibrant Blue
    'AcademicArticle':       { fill: '#BBDEFB', stroke: '#0D47A1' }, // Vibrant Blue
    'Book':                  { fill: '#BBDEFB', stroke: '#0D47A1' }, // Vibrant Blue
    'Chapter':               { fill: '#BBDEFB', stroke: '#0D47A1' }, // Vibrant Blue
    'Website':               { fill: '#BBDEFB', stroke: '#0D47A1' }, // Vibrant Blue

    'Agent':                 { fill: '#B2DFDB', stroke: '#004D40' }, // Vibrant Teal
    'Person':                { fill: '#B2DFDB', stroke: '#004D40' }, // Vibrant Teal
    'Group':                 { fill: '#B2DFDB', stroke: '#004D40' }, // Vibrant Teal
    'Organization':          { fill: '#B2DFDB', stroke: '#004D40' }, // Vibrant Teal

    // --- New requested categories ---
    'TaxonPublication':      { fill: '#E1BEE7', stroke: '#4A148C' }, // Vibrant Purple

    // --- Additional versatile categories ---
    'Property':           { fill: '#FFF9C4', stroke: '#F57F17' }, // Vibrant Yellow/Amber
    'Annotation':        { fill: '#F8BBD0', stroke: '#880E4F' }, // Vibrant Pink
    
    'TaxonSpecimen':         { fill: '#D1C4E9', stroke: '#311B92' }, // Vibrant Deep Purple/Indigo

    // --- Default fallback ---
    'DefaultResource':       { fill: '#E0E0E0', stroke: '#212121' }  // Stronger Grey
};
```

---

## 3. Jigsaw Front-End Integration

### Reusable SVG Canvas Viewer Block (`svg-viewer.blade.php`)
Loads graphs cleanly using `<object>` to separate CSS vectors from main document trees, supporting high-zoom ratios on massive taxonomy recipe files.

```blade
@php
    \(container = \Illuminate\Container\Container::getInstance();\)jigsawPage = container->has('pageData') ? container->make('pageData')->page : null;
    baseUrl = jigsawPage->baseUrl ?? '';
    id = id ?? 'svg-' . uniqid();
    height = height ?? '500px';
    path = path ?? '';
    status = status ?? 'draft';
    badgeClasses = (status === 'final') ? 'bg-emerald-500' : 'bg-amber-500';
    badgeText = (status === 'final') ? 'FINAL' : 'SCAFFOLD';
@endphp

<div id="wrapper-{{ \$id }}" class="flex flex-col border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-black fullscreen:h-screen">
    <div class="flex items-center justify-between px-4 py-2 bg-gray-50/80 border-b border-gray-200 z-20">
        <span class="{{ \$badgeClasses }} text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider uppercase">
            {{ \$badgeText }}
        </span>
        <div class="flex items-center gap-2">
            <button id="zoom-in-{{ \$id }}" class="hover:bg-gray-200 w-8 h-8 flex items-center justify-center rounded border font-bold">+</button>
            <button id="zoom-out-{{ \$id }}" class="hover:bg-gray-200 w-8 h-8 flex items-center justify-center rounded border font-bold">−</button>
            <button id="reset-{{ \$id }}" class="hover:bg-gray-200 w-8 h-8 flex items-center justify-center rounded border">⟲</button>
            <button id="fullscreen-{{ \$id }}" class="hover:bg-gray-200 w-8 h-8 flex items-center justify-center rounded border">⛶</button>
        </div>
    </div>
    <div class="svg-viewer-container p-4 transition-all" style="height: {{ \$height }};">
        <object id="{{ \$id }}" type="image/svg+xml" data="{{ rtrim(baseUrl, '/') / ltrim(path, '/') }}" class="w-full h-full block">
            Your browser does not support SVG
        </object>
    </div>
    @if(slot->isNotEmpty() || isset(legendUrl))
        <footer class="mt-3 p-4 pt-0 border-t flex items-center justify-between text-sm text-gray-600 fullscreen:hidden">
            <div class="flex-1">@if(\(slot->isNotEmpty()) @inlineMarkdown(trim(\)slot)) @endif</div>
            <div class="shrink-0 text-xs">
                <a href="{{ \$legendUrl ?? '/docs/rdf-legend' }}" class="inline-flex items-center gap-1 font-semibold text-emerald-600 hover:text-emerald-700">
                    <span>How to read this graph</span> ↗
                </a>
            </div>
        </footer>
    @endif
</div>

@push('scripts')
<script>
    (function() {
        const init = () => {
            const id = '{{ \$id }}';
            const embed = document.getElementById(id);
            if (!embed) return;
            const start = () => {
                const wrapper = document.getElementById('wrapper-' + id);
                const container = embed.parentElement;
                const fsBtn = document.getElementById('fullscreen-' + id);
                const originalHeight = '{{ \$height }}'; 
                const instance = svgPanZoom(embed, { zoomEnabled: true, controlIconsEnabled: false, fit: true, center: true, maxZoom: 100, zoomScaleSensitivity: 0.3 });
                
                document.getElementById('zoom-in-' + id).onclick = () => instance.zoomIn();
                document.getElementById('zoom-out-' + id).onclick = () => instance.zoomOut();
                document.getElementById('reset-' + id).onclick = () => { instance.resetZoom(); instance.center(); instance.fit(); };
                
                if (fsBtn && wrapper && container) {
                    fsBtn.onclick = (e) => { e.preventDefault(); if (!document.fullscreenElement) { wrapper.requestFullscreen(); } else { document.exitFullscreen(); } };
                    document.addEventListener('fullscreenchange', () => {
                        if (document.fullscreenElement) { container.style.setProperty('height', 'calc(100vh - 48px)', 'important'); } 
                        else { container.style.setProperty('height', originalHeight, 'important'); }
                        setTimeout(() => { instance.resize(); instance.fit(); instance.center(); }, 200); 
                    });
                }
            };
            if (embed.contentDocument && embed.contentDocument.documentElement) { start(); } else { embed.addEventListener('load', start); }
        };
        window.addEventListener('load', init);
    })();
</script>
@endpush
```

### Automation Hooks (`package.json`)
Tasks to drive standard vs advanced layouts headlessly:
```json
"scripts": {
  "graph:clean": "rm -rf source/assets/images/rdf/*.svg",
  "graph:dot": "node generate-rdf-graphs.js --engine dot",
  "graph:neato": "node generate-rdf-graphs.js --engine neato",
  "shape:clean": "rm -rf source/assets/images/rdf/*-shape.svg",
  "shape:dot": "node generate-tcs-graphs.js --engine dot",
  "shape:neato": "node generate-tcs-graphs.js --engine neato",
  "shape:fdp": "node generate-tcs-graphs.js --engine fdp"
}
```

---

## 4. Next Action Items for Next Session
1.  **Tailwind Layout Legend Key:** Implement the global layout block file component (`graph-legend.blade.php`) inside the decoupled repository targeting your customized non-camel-cased classification names (`Type of Type`, `Taxon Rank`, etc.).
2.  **VicFlora Domain Injector:** Update your configuration map inside `generate-tcs-graphs.js` to map regional ontology nodes (e.g. `FloraProfile`, `Bioregion`) into the structural dictionary maps for downstream production runs.
3.  **Deployment Automation:** Configure `deploy.sh` to purge compilation channels (`npm run shape:clean`), execute the synchronous compiler runner pipeline, and copy the vector graphics straight to production directories.
