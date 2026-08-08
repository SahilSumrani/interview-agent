@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Create venv first: py -3.10 -m venv .venv
  exit /b 1
)
set CHATTERBOX_PORT=7861
set CHATTERBOX_DEVICE=cpu
set CHATTERBOX_MODEL=base
".venv\Scripts\python.exe" chatterbox_server.py
