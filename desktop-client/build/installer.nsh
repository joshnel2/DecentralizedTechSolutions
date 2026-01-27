; Apex Drive NSIS Installer Script

!include "MUI2.nsh"

; Pre-installation: Try to close running instance
!macro customInit
  ; Try to close any running instance of Apex Drive
  nsExec::ExecToLog 'taskkill /F /IM "Apex Drive.exe"'
  ; Give it a moment to close
  Sleep 1000
!macroend

; Installation hooks
!macro customInstall
  ; Create Start Menu shortcut
  CreateDirectory "$SMPROGRAMS\Apex Drive"
  CreateShortCut "$SMPROGRAMS\Apex Drive\Apex Drive.lnk" "$INSTDIR\Apex Drive.exe"
  CreateShortCut "$SMPROGRAMS\Apex Drive\Uninstall Apex Drive.lnk" "$INSTDIR\Uninstall Apex Drive.exe"
  
  ; Create Desktop shortcut
  CreateShortCut "$DESKTOP\Apex Drive.lnk" "$INSTDIR\Apex Drive.exe"
!macroend

!macro customUnInstall
  ; Remove Start Menu shortcuts
  Delete "$SMPROGRAMS\Apex Drive\Apex Drive.lnk"
  Delete "$SMPROGRAMS\Apex Drive\Uninstall Apex Drive.lnk"
  RMDir "$SMPROGRAMS\Apex Drive"
  
  ; Remove Desktop shortcut
  Delete "$DESKTOP\Apex Drive.lnk"
  
  ; Clean up cache folder (ask user)
  MessageBox MB_YESNO|MB_ICONQUESTION "Would you like to remove the Apex Drive cache folder?" IDNO SkipCacheRemoval
    RMDir /r "$LOCALAPPDATA\apex-drive-desktop"
  SkipCacheRemoval:
!macroend
