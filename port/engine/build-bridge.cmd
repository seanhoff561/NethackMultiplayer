@echo off
if not defined NETHACK_VCVARS set "NETHACK_VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
call "%NETHACK_VCVARS%" >nul
set "INCLUDE=%~dp0..\..\.tools\sdk\headers\c\Include\10.0.22621.0\ucrt;%~dp0..\..\.tools\sdk\headers\c\Include\10.0.22621.0\um;%~dp0..\..\.tools\sdk\headers\c\Include\10.0.22621.0\shared;%INCLUDE%"
set "LIB=%~dp0..\..\.tools\sdk\x64\c\ucrt\x64;%~dp0..\..\.tools\sdk\x64\c\um\x64;%LIB%"
set "PATH=%~dp0..\..\.tools\sdk\headers\c\bin\10.0.22621.0\x64;%PATH%"
set "CL=/FIinttypes.h"
cd /d "%~dp0..\..\src"
set "BFLAGS=/nologo /c /MT /O2 /DWIN32 /DWIN64 /D_WIN64 /DWIN32CON /D_CONSOLE /DHAS_STDINT_H /DHAS_INLINE /D_CRT_SECURE_NO_DEPRECATE /D_CRT_NONSTDC_NO_DEPRECATE /DDLB /DSHIM_GRAPHICS /DCHDIR /I..\include /I..\sys\windows /I..\submodules\lua"
cl %BFLAGS% /Fo..\port\engine\build\windmain.o ..\port\engine\windmain-bridge.c
if errorlevel 1 exit /b 1
cl %BFLAGS% /Fo..\port\engine\build\windows.o windows.c
if errorlevel 1 exit /b 1
cl %BFLAGS% /Fo..\port\engine\build\winshim.o ..\win\shim\winshim.c
if errorlevel 1 exit /b 1
cl %BFLAGS% /Fo..\port\engine\build\bridge.o ..\port\engine\bridge.c
if errorlevel 1 exit /b 1
link /NOLOGO /INCREMENTAL:NO /SUBSYSTEM:CONSOLE /STACK:8388608 /OUT:..\port\engine\bin\nethack-engine.exe @..\port\engine\engine.lnk ..\lib\lua5.4.8-x64-static.lib objtty\x64\hacklib-x64-static.lib kernel32.lib advapi32.lib gdi32.lib ole32.lib Shell32.lib UserEnv.lib dbghelp.lib Rpcrt4.lib user32.lib winmm.lib bcrypt.lib

