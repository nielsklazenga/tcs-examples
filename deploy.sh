#!/bin/bash

# Configuration
DOCS_DIR="/var/www/tcs-examples"

JIGSAW_SOURCE="$DOCS_DIR/source"

# Helper function for usage
usage() {
    echo "Usage: $0 {test|github|prod|all}"
    echo "  test:   Build for test and sync to local Laravel app"
    echo "  github: Build for GitHub and push to gh-pages branch"
    echo "  prod:   Build for production and sync to local Laravel app"
    echo "  all:    Run all of the above"
    exit 1
}

# Check if an argument was provided
if [ -z "$1" ]; then
    usage
fi

echo "🔄 Updating shared resources..."
git submodule update --remote --merge

echo "📦 Compiling assets..."
NODE_NO_WARNINGS=1 npm run build 

cd "$DOCS_DIR"

case "$1" in
    test)
        git add . && git commit -m "Commit uncommitted  changes before deployment"

        echo "🚀 Building for Staging (Test)..."

        ./vendor/bin/jigsaw build staging
        ;;

    github)
        git add . && git commit -m "Commit uncommitted  changes before deployment"

        echo "🌐 Building for GitHub Pages..."

        ./vendor/bin/jigsaw build github

        echo "⬆️ Pushing to GitHub..."
        git add build_github -f
        git commit -m "Deploy docs to GitHub: $(date)"
        git subtree push --prefix build_github origin gh-pages
        ;;

    prod)
        git add . && git commit -m "Commit uncommitted  changes before deployment"

        echo "💎 Building for Production..."

        php "$PROJECT_ROOT"/artisan docs:generate \
            --baseUrl="" \
            --output="$JIGSAW_SOURCE"

        npm run build-erd
        ./vendor/bin/jigsaw build production
        ;;

    all)
        $0 test
        $0 github
        $0 prod
        ;;

    *)
        usage
        ;;
esac

echo "✅ Done!"