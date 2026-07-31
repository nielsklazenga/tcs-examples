import fs from 'fs';
import { generateSvgForFile } from './render-graph.js';

async function runOrchestrator() {
    const configPath = process.argv[2] || 'graph-config.json';
    if (!fs.existsSync(configPath)) {
        console.error(`❌ Configuration file not found: ${configPath}`);
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const targets = config.targets || [];

    console.log(`🚀 Running batch graph compiler (${targets.length} targets configured)...`);

    for (const target of targets) {
        try {
            console.log(`\nProcessing: ${target.input} -> ${target.output}`);
            await generateSvgForFile(target.input, target.output, {
                config,
                engine: target.engine,
                highlight: target.highlight
            });
        } catch (err) {
            console.error(`  ❌ Failed processing "${target.input}": ${err.message}`);
        }
    }

    console.log('\n✨ All diagrams processed successfully!');
}

runOrchestrator();