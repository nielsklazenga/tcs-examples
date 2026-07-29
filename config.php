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
];

return [
    'baseUrl' => '',
    'appUrl' => '',
    'siteName' => 'TCS Examples',
    'documentationTitle' => 'Data model',
    'siteLogo' => '/assets/images/rbgv-logo.svg',
    'siteMenu' => [
        ['title' => 'Docs', 'link' => '/docs'],
    ],
    'collections' => $collections,
    'navigation' => $navigation,
];