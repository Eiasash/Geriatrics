@echo off
REM A REAL dispatch wrapper. The gate is a precondition ON the action, not advice beside it.
REM Usage: gated-dispatch.cmd "<what this action is>" <command...>
REM The command is UNREACHABLE unless gate.mjs exits 0, because it is downstream of the check
REM in the same process, not merely printed next to it.

setlocal
REM capture the script directory BEFORE shift - %~dp0 is not stable across shift, which cost a
REM false result the first time this was tested.
set HERE=%~dp0
set WHAT=%~1
shift

node "%HERE%gate.mjs" %WHAT%
if errorlevel 1 (
  echo.
  echo === DISPATCH REFUSED ===
  echo The command was NOT executed. Nothing was queued. Reissue it after answering the lane.
  exit /b 1
)

echo === DISPATCH ALLOWED ===
%1 %2 %3 %4 %5 %6 %7 %8 %9
exit /b %ERRORLEVEL%
