@echo off
echo ========================================
echo GitHub Upload fuer reservation-sync-tool
echo ========================================
echo.
echo Repository URL: https://github.com/marlin-ship-it/reservation-sync-tool
echo.
echo WICHTIG: Du wirst nach deinen GitHub Zugangsdaten gefragt:
echo - Username: marlin-ship-it
echo - Password: Dein Personal Access Token (NICHT dein Passwort!)
echo.
echo Falls du noch keinen Token hast:
echo 1. Gehe zu: https://github.com/settings/tokens
echo 2. Klicke "Generate new token (classic)"
echo 3. Waehle "repo" scope
echo 4. Kopiere den Token
echo.
pause
echo.
echo Starte Upload...
git push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================
    echo SUCCESS! Code wurde hochgeladen!
    echo ========================================
    echo.
    echo Dein Repository: https://github.com/marlin-ship-it/reservation-sync-tool
) else (
    echo ========================================
    echo FEHLER beim Upload!
    echo ========================================
    echo.
    echo Falls "Permission denied":
    echo - Stelle sicher, dass du als "marlin-ship-it" angemeldet bist
    echo - Verwende einen Personal Access Token statt Passwort
)
echo.
pause
