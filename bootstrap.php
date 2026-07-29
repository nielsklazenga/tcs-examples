<?php

use Illuminate\Container\Container;
use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\Attributes\AttributesExtension;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\Footnote\FootnoteExtension;
use League\CommonMark\Extension\GithubFlavoredMarkdownExtension;
use League\CommonMark\Extension\HeadingPermalink\HeadingPermalinkExtension;
use League\CommonMark\MarkdownConverter;
use Mni\FrontYAML\Markdown\MarkdownParser;

// 1. Suppress the 'convertToHtml' deprecation warning from the Jigsaw bridge
set_error_handler(function ($errno, $errstr) {
    // 1. Check for the CommonMark deprecation
    if (str_contains($errstr, 'convertToHtml')) {
        return true;
    }

    // 2. Check for the Jigsaw/Vite "hot" file warning
    if (str_contains($errstr, 'source/hot')) {
        return true;
    }

    // Otherwise, let PHP handle it normally
    return false;
});
error_reporting(E_ALL & ~E_DEPRECATED);

$container = Container::getInstance();

$container->bind('markdownParser', function () {
    $config = [
        'html_input' => 'allow',
        'allow_unsafe_links' => false,
        'heading_permalink' => [
            'html_class' => 'heading-permalink',
            'id_prefix' => '', // No prefix so your slugs match exactly
            'fragment_prefix' => '',
            'insert' => 'none', // We don't want the visible '#' icon
            'apply_id_to_heading' => true, // CRITICAL: This puts id="" on the <h2>
            'heading_class' => '',
        ],
    ];

    $environment = new Environment($config);
    $environment->addExtension(new AttributesExtension());
    $environment->addExtension(new CommonMarkCoreExtension());
    $environment->addExtension(new FootnoteExtension());
    $environment->addExtension(new GithubFlavoredMarkdownExtension());
    $environment->addExtension(new HeadingPermalinkExtension());

    $converter = new MarkdownConverter($environment);

    return new SilentMarkdownParser($converter);
});

// Register the @markdown directive for Blade components
$container->make('bladeCompiler')->directive('markdown', function ($expression) {
    return "<?php echo \Illuminate\Container\Container::getInstance()->make('markdownParser')->parse($expression); ?>";
});

$container->make('bladeCompiler')->directive('inlineMarkdown', function ($expression) {
    return "<?php 
        \$content = \Illuminate\Container\Container::getInstance()->make('markdownParser')->parse($expression);
        echo preg_replace('/^<p>(.*)<\/p>$/s', '$1', trim(\$content)); 
    ?>";
});


/**
 * Custom Parser to bridge modern CommonMark with Jigsaw's interface
 */
class SilentMarkdownParser implements MarkdownParser
{
    protected $converter;

    public function __construct($converter)
    {
        $this->converter = $converter;
    }

    // Change the parameter name and type to match the interface exactly
    public function parse(string $text): string
    {
        // Use the modern 'convert' method to stop the warnings
        return (string) $this->converter->convert($text);
    }
}


$bladeCompiler = $container->make('bladeCompiler');

// Register aliases for your shared components
$bladeCompiler->component('_shared._components.alert', 'alert');
$bladeCompiler->component('_shared._components.badge', 'badge');
$bladeCompiler->component('_shared._components.button', 'button');
$bladeCompiler->component('_shared._components.card', 'card');
$bladeCompiler->component('_shared._components.code', 'code');
$bladeCompiler->component('_shared._components.csv-table', 'csv-table');
$bladeCompiler->component('_shared._components.debug-badge', 'debug-badge');
$bladeCompiler->component('_shared._components.figcaption', 'figcaption');
$bladeCompiler->component('_shared._components.figure', 'figure');
$bladeCompiler->component('_shared._components.responsive-table', 'responsive-table');
$bladeCompiler->component('_shared._components.svg-viewer', 'svg-viewer');
