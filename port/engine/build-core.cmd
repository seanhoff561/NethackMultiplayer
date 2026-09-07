@echo off
if not defined NETHACK_VCVARS set "NETHACK_VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
call "%NETHACK_VCVARS%" >nul
set "INCLUDE=%~dp0..\..\.tools\sdk\headers\c\Include\10.0.22621.0\ucrt;%~dp0..\..\.tools\sdk\headers\c\Include\10.0.22621.0\um;%~dp0..\..\.tools\sdk\headers\c\Include\10.0.22621.0\shared;%INCLUDE%"
set "LIB=%~dp0..\..\.tools\sdk\x64\c\ucrt\x64;%~dp0..\..\.tools\sdk\x64\c\um\x64;%LIB%"
set "PATH=%~dp0..\..\.tools\sdk\headers\c\bin\10.0.22621.0\x64;%PATH%"
set "CL=/FIinttypes.h"
cd /d "%~dp0..\..\src"
nmake /nologo "SOUND_LIBRARIES=" "WANT_CURSES=N" "DEBUGINFO=N" envchk.tag libdir.tag ottydirx64.tag outldirx64.tag oluadirx64.tag ..\binary\NetHack.exe binary.tag


