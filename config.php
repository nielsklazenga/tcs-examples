<?php

$navigation = require('navigation.php');

$path = function ($page) {
    $collection = $page->collection ?? $page->getCollection();

    $folder = \Illuminate\Support\Str::replace('_', '-', (string) $collection);
    
    return $page->getFilename() === 'introduction' 
        ? $folder
        : $folder . '/' . Illuminate\Support\Str::slug($page->getFilename());
};

$collections = [
    'intro' => ['path' => $path, 'sort' => 'order'],
    'examples' => ['path' => $path, 'sort' => 'order'],
];

return [
    'baseUrl' => '',
    'appUrl' => '',
    'siteName' => 'TCS Examples',
    'documentationTitle' => '',
    'siteLogo' => '/assets/images/tdwg-logo-long.svg',
    'siteMenu' => [],
    'collections' => $collections,
    'navigation' => $navigation,
];