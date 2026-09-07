@echo off
title NetHack: Descent
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0port\launch.ps1"
if errorlevel 1 pause
