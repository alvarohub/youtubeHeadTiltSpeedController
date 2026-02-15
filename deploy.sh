#!/bin/bash

# GitHub Pages Deployment Script for Head Tilt YouTube Controller

echo "🚀 GitHub Pages Deployment Script"
echo "=================================="
echo ""

# Check if git is initialized
if [ ! -d .git ]; then
    echo "📦 Initializing Git repository..."
    git init
    echo "✅ Git initialized"
    echo ""
fi

# Check if already committed
if ! git rev-parse HEAD >/dev/null 2>&1; then
    echo "📝 Creating initial commit..."
    git add .
    git commit -m "Initial commit: Head Tilt YouTube Controller"
    echo "✅ Files committed"
    echo ""
else
    echo "✅ Git repository already initialized"
    echo ""
fi

# Check if remote exists
if ! git remote get-url origin >/dev/null 2>&1; then
    echo "🔗 Setting up GitHub remote..."
    echo ""
    echo "Please enter your GitHub username:"
    read -r username
    echo ""
    echo "Please enter your repository name (e.g., youtube-head-controller):"
    read -r reponame
    echo ""
    
    git remote add origin "https://github.com/$username/$reponame.git"
    
    echo "✅ Remote added: https://github.com/$username/$reponame.git"
    echo ""
    echo "⚠️  IMPORTANT: Before pushing, make sure you've created this repository on GitHub!"
    echo ""
    echo "   👉 Go to: https://github.com/new"
    echo "   👉 Create a repository named: $reponame"
    echo "   👉 Keep it PUBLIC (required for free GitHub Pages)"
    echo "   👉 DON'T initialize with README, .gitignore, or license"
    echo ""
    read -p "Press Enter when you've created the GitHub repository..."
    echo ""
fi

# Set default branch to main
current_branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$current_branch" != "main" ]; then
    echo "📌 Setting default branch to 'main'..."
    git branch -M main
    echo "✅ Branch set to main"
    echo ""
fi

# Push to GitHub
echo "⬆️  Pushing to GitHub..."
if git push -u origin main; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo ""
    
    # Extract remote URL
    remote_url=$(git remote get-url origin)
    username=$(echo "$remote_url" | sed -E 's/.*github\.com[:/]([^/]+)\/.*/\1/')
    reponame=$(echo "$remote_url" | sed -E 's/.*\/(.+)(\.git)?$/\1/' | sed 's/\.git$//')
    
    echo "=================================="
    echo "🎉 DEPLOYMENT SUCCESSFUL!"
    echo "=================================="
    echo ""
    echo "📍 Repository: https://github.com/$username/$reponame"
    echo ""
    echo "🔧 NEXT STEPS:"
    echo ""
    echo "1. Enable GitHub Pages:"
    echo "   👉 Go to: https://github.com/$username/$reponame/settings/pages"
    echo "   👉 Under 'Source': select branch 'main' and folder '/ (root)'"
    echo "   👉 Click 'Save'"
    echo ""
    echo "2. Wait 1-2 minutes for deployment"
    echo ""
    echo "3. Your app will be live at:"
    echo "   🌐 https://$username.github.io/$reponame/"
    echo ""
    echo "4. Open that URL on your phone and add to home screen!"
    echo ""
    echo "=================================="
else
    echo ""
    echo "❌ Push failed. This might be because:"
    echo "   1. The repository doesn't exist on GitHub yet"
    echo "   2. You need to authenticate with GitHub"
    echo "   3. You don't have permission to push"
    echo ""
    echo "💡 Solutions:"
    echo "   - Make sure the repository exists: https://github.com/new"
    echo "   - Try: gh auth login (if you have GitHub CLI)"
    echo "   - Or use SSH keys: https://docs.github.com/en/authentication"
    echo ""
fi
