@echo off
chcp 65001 >nul
cd /d "%~dp0.."
rem Lance Envol sur http://localhost:8000 (rien n'est envoye sur GitHub). Fermer la fenetre pour arreter.
where node >nul 2>nul || (echo Il faut Node.js : https://nodejs.org & pause & exit /b 1)
start "" cmd /c "timeout /t 1 >nul & start http://localhost:8000"
node tools\serve.mjs 8000
