@echo off
rem PM 成长工作台 - 生产模式启动脚本（Windows）
rem 启动 Express 服务，同时托管前端页面与 API（端口 8787）
rem 前提：本机已安装 Node.js（v18+）

cd /d "%~dp0"

echo ============================================
echo   PM 成长工作台 - 生产模式
echo ============================================
echo   地址: http://localhost:8787
echo   按 Ctrl+C 停止服务
echo ============================================
echo.

rem 首次运行自动安装依赖
if not exist "node_modules" (
  echo [首次运行] 正在安装依赖，请稍候...
  call npm install
  echo.
)

if not exist "client\dist\index.html" (
  echo [提示] 前端构建产物不存在，正在构建...
  call npm run build
  echo.
)

echo 正在启动服务...
call npm run start -w server

pause
