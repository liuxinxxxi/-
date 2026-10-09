@echo off
rem PM 成长工作台一键启动脚本（Windows）
rem 将便携版 Node 加入当前会话 PATH，然后同时启动 Express(8787) 与 Vite(5173)
set "PATH=C:\Users\lx\.cache\node-portable;%PATH%"
cd /d "%~dp0"
echo Starting PM Growth Workbench...
echo   API server : http://localhost:8787
echo   Web client : http://localhost:5173
call npm run dev
pause
