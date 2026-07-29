<nav class="flex items-center justify-between">
    <div class="flex items-center space-x-10">
        {{-- Logo --}}
        <a href="/" class="flex items-center space-x-2 transition-opacity hover:opacity-80">
            <img src="{{ $page->baseUrl }}{{ $page->siteLogo }}" alt="{{ $page->siteName}}" class="h-8" height="32" />
            <span class="inline-block pl-4 text-2xl font-bold text-gray-900 dark:text-white">{{ $page->siteName }}</span>
        </a>

        {{-- Desktop Navigation (Matches React md:flex) --}}
        <div class="hidden items-center space-x-8 md:flex">
            @foreach ($page->siteMenu as $item)
                @if(isset($item->children))
                    {{-- Dropdown Menu --}}
                    <div class="group relative py-2">
                        <button class="flex items-center gap-1 text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400 transition-colors">
                            {{ $item->title }}
                            <svg class="h-4 w-4 transition-transform group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        
                        {{-- Dropdown Content --}}
                        <div class="absolute left-0 top-full z-50 hidden min-w-[200px] rounded-lg border border-gray-100 bg-white p-2 shadow-xl group-hover:block dark:border-gray-800 dark:bg-gray-900">
                            @foreach ($item->children as $child)
                                <a href="{{ str_contains($child->link, '://') ? $child->link : $page->appUrl . $child->link }}" 
                                  class="block rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-primary-50 hover:text-primary-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-primary-400">
                                    {{ $child->title }}
                                </a>
                            @endforeach
                        </div>
                    </div>
                @else
                    {{-- Standard Link --}}
                    <a href="{{ str_contains($item->link, '://') ? $item->link : $page->appUrl . $item->link }}" 
                      class="text-gray-600 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400 transition-colors">
                        {{ $item->title }}
                    </a>
                @endif
            @endforeach
        </div>
    </div>
            
    <div class="flex items-center gap-3">
        {{-- Desktop Actions (Matches sm:flex) --}}
        <div class="hidden md:flex items-center ml-auto">
            @includeFirst(['_partials.nav-right', '_shared._partials.nav-right-default'])
        </div>

        {{-- MOBILE TOGGLE BUTTON (Essential for mobile to work) --}}
        <button id="mobile-menu-toggle" class="p-2 md:hidden text-gray-600 dark:text-gray-300">
            <svg id="menu-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            <svg id="close-icon" class="hidden" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
    </div>
</nav>
