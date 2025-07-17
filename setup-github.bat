@echo off
echo.
echo ===============================================
echo   🚢 Pirate Radio - GitHub Setup 📻
echo ===============================================
echo.

REM Check if git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Git is not installed!
    echo Please install Git and try again.
    pause
    exit /b 1
)

echo ✅ Git is available
echo.

echo 📋 Before running this script:
echo 1. Create a new repository on GitHub (e.g., 'pirate-stream')
echo 2. Make sure it's PUBLIC (required for free GitHub Pages)
echo 3. Don't initialize with README, .gitignore, or license
echo.

set /p GITHUB_USERNAME="Enter your GitHub username: "
set /p REPO_NAME="Enter your repository name (e.g., pirate-stream): "

echo.
echo 🔧 Initializing Git repository...

REM Initialize git repo
git init

REM Add files
git add index.html README.md start-pirate-radio.bat
git commit -m "Initial commit: Pirate Radio web interface"

REM Add remote origin
git remote add origin https://github.com/%GITHUB_USERNAME%/%REPO_NAME%.git

REM Push to GitHub
echo.
echo 📤 Pushing to GitHub...
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ✅ Successfully pushed to GitHub!
    echo.
    echo 🌐 Next steps:
    echo 1. Go to https://github.com/%GITHUB_USERNAME%/%REPO_NAME%
    echo 2. Click Settings → Pages
    echo 3. Under Source, select "Deploy from a branch"
    echo 4. Choose "main" branch and "/ (root)"
    echo 5. Click Save
    echo.
    echo 🎉 Your site will be available at:
    echo https://%GITHUB_USERNAME%.github.io/%REPO_NAME%/
    echo.
) else (
    echo.
    echo ❌ Failed to push to GitHub
    echo Make sure your repository exists and you have proper access.
)

pause
