@echo off
REM 重建 index.html（需 Node >= 22.13）
cd /d "%~dp0"
node build.js
echo.
echo 构建完成，可双击 index.html 试玩。
pause
