@echo off
REM ------------------------------------------------------------------
REM  Backup option: fetch updates from YOUR computer (Indian internet)
REM  and publish them to the app. Use this only if the automatic
REM  GitHub run reports that the government sites are blocking it.
REM  Schedule it daily with Windows Task Scheduler (see README).
REM ------------------------------------------------------------------
cd /d "%~dp0"
git pull --quiet
python fetcher\fetch.py
git add docs\data
git diff --cached --quiet && (echo Nothing new.) || (
  git commit -m "Updates from my PC %date% %time%"
  git push
)
