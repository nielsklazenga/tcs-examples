{{-- source/_shared/_components/svg-viewer.blade.php --}}
@php
    $container = \Illuminate\Container\Container::getInstance();
    $jigsawPage = $container->has('pageData') ? $container->make('pageData')->page : null;

    $baseUrl = $jigsawPage->baseUrl ?? '';

    $id = $id ?? 'svg-' . uniqid();
    $height = $height ?? '500px';
    $path = $path ?? '';
    $maxZoom = $maxZoom ?? 10;
    $bgColor = $bgColor ?? 'bg-white dark:bg-black';
    $legend = $legend ?? null;
@endphp

<div id="wrapper-{{ $id }}" class="flex flex-col border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-black backdrop-blur-sm fullscreen:h-screen fullscreen:bg-white dark:fullscreen:bg-gray-900 relative">
    
    {{-- Header Bar --}}
    <div class="flex items-center justify-between px-4 py-2 bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 z-20">
        <div class="flex items-center gap-2 ml-auto">
            <button id="zoom-in-{{ $id }}" class="hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 w-8 h-8 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 font-bold text-lg transition-colors" title="Zoom In">+</button>
            <button id="zoom-out-{{ $id }}" class="hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 w-8 h-8 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 font-bold text-lg transition-colors" title="Zoom Out">−</button>
            <button id="reset-{{ $id }}" class="hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 w-8 h-8 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-lg transition-colors" title="Reset View">⟲</button>
            <button id="fullscreen-{{ $id }}" class="hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 w-8 h-8 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-lg transition-colors" title="Toggle Full Screen">⛶</button>
        </div>
    </div>

    {{-- Viewer Area --}}
    <div class="svg-viewer-container p-4 transition-all duration-300 relative bg-white dark:bg-gray-950" style="height: {{ $height }};">
        <object id="{{ $id }}" type="image/svg+xml" data="{{ rtrim($baseUrl, '/') }}/{{ ltrim($path, '/') }}" class="w-full h-full block">
            Your browser does not support SVG
        </object>
    </div>

    {{-- The Caption Slot --}}
    @if($slot->isNotEmpty())
        <figcaption class="mt-3 p-4 text-sm leading-relaxed text-gray-600 dark:text-gray-400 fullscreen:hidden">
            @inlineMarkdown(trim($slot))
        </figcaption>
    @endif
</div>

@push('scripts')
<script>
    (function() {
        const init = () => {
            const id = '{{ $id }}';
            const embed = document.getElementById(id);
            if (!embed) return;

            const start = () => {
                const wrapper = document.getElementById('wrapper-' + id);
                const container = embed.parentElement;
                const fsBtn = document.getElementById('fullscreen-' + id);
                const originalHeight = '{{ $height }}'; 
                const legendPath = '{{ $legend ? rtrim($baseUrl, '/') . '/' . ltrim($legend, '/') : '' }}';

                const instance = svgPanZoom(embed, {
                    zoomEnabled: true,
                    controlIconsEnabled: false,
                    fit: true,
                    center: true,
                    maxZoom: {{ $maxZoom }},
                    zoomScaleSensitivity: 0.3
                });

                // Zoom & Reset Controls
                document.getElementById('zoom-in-' + id).onclick = () => instance.zoomIn();
                document.getElementById('zoom-out-' + id).onclick = () => instance.zoomOut();
                document.getElementById('reset-' + id).onclick = () => {
                    instance.resetZoom();
                    instance.center();
                    instance.fit();
                };

                // Interactive Tooltip / Legend Hook with increased inner margins
                if (legendPath) {
                    fetch(legendPath)
                        .then(res => res.json())
                        .then(legendData => {
                            const labelMap = {};
                            legendData.forEach(item => {
                                labelMap[item.indexId] = item.labels;
                            });

                            let tooltip = document.getElementById('tooltip-' + id);
                            if (!tooltip) {
                                tooltip = document.createElement('div');
                                tooltip.id = 'tooltip-' + id;
                                tooltip.style.position = 'absolute';
                                tooltip.style.top = '24px';  
                                tooltip.style.left = '24px'; 
                                tooltip.style.display = 'none';
                                tooltip.style.background = '#ffffff';
                                tooltip.style.color = '#1e293b';
                                tooltip.style.border = '1px solid #cbd5e1';
                                tooltip.style.padding = '10px 14px';
                                tooltip.style.borderRadius = '8px';
                                tooltip.style.fontSize = '12px';
                                tooltip.style.pointerEvents = 'none';
                                tooltip.style.zIndex = '50';
                                tooltip.style.maxWidth = '300px';
                                tooltip.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)';
                                container.appendChild(tooltip);
                            }

                            if (document.documentElement.classList.contains('dark')) {
                                tooltip.style.background = '#0f172a';
                                tooltip.style.color = '#f8fafc';
                                tooltip.style.border = '1px solid #334155';
                            }

                            const svgDoc = embed.contentDocument || embed.getSVGDocument();
                            if (!svgDoc) return;

                            // Strictly target only groups that wrap a valid node circle and number
                            svgDoc.querySelectorAll('.node-circle, .node-number').forEach(element => {
                                const group = element.closest('g');
                                if (!group) return;

                                const numberText = group.querySelector('.node-number');
                                if (!numberText) return;

                                const nodeIndex = parseInt(numberText.textContent.trim(), 10);
                                if (isNaN(nodeIndex)) return;

                                element.style.cursor = 'pointer';

                                element.addEventListener('mouseenter', () => {
                                    const labels = labelMap[nodeIndex] || ['Taxon Concept'];
                                    tooltip.innerHTML = `<strong style="color: #2563eb;">Node #${nodeIndex}</strong><br>` + labels.join('<br>');
                                    tooltip.style.display = 'block';
                                });

                                element.addEventListener('mouseleave', () => {
                                    tooltip.style.display = 'none';
                                });
                            });
                        })
                        .catch(err => console.error('Failed to load legend JSON:', err));
                }

                // Full Screen Logic
                if (fsBtn && wrapper && container) {
                    fsBtn.onclick = (e) => {
                        e.preventDefault();
                        if (!document.fullscreenElement) {
                            wrapper.requestFullscreen().catch(err => {
                                console.error(`Fullscreen error: ${err.message}`);
                            });
                        } else {
                            document.exitFullscreen();
                        }
                    };

                    document.addEventListener('fullscreenchange', () => {
                        if (document.fullscreenElement) {
                            container.style.setProperty('height', 'calc(100vh - 48px)', 'important');
                            container.style.flex = '1';
                        } else {
                            container.style.setProperty('height', originalHeight, 'important');
                            container.style.flex = 'none';
                        }

                        setTimeout(() => {
                            instance.resize();
                            instance.fit();
                            instance.center();
                        }, 200); 
                    });
                }
            };

            if (embed.contentDocument && embed.contentDocument.querySelector('svg')) {
                start();
            } else {
                embed.addEventListener('load', start);
            }
        };

        window.addEventListener('load', init);
    })();
</script>
@endpush