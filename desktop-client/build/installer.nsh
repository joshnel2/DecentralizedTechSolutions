; Apex Drive NSIS Installer Script
; Handles WinFsp/Dokan driver installation for virtual file system

!include "MUI2.nsh"

; Custom variables
Var WINFSP_INSTALLED
Var WINFSP_PATH

; Check for WinFsp during installation
Function CheckWinFsp
  ; Check if WinFsp is installed
  ReadRegStr $WINFSP_PATH HKLM "SOFTWARE\WOW6432Node\WinFsp" "InstallDir"
  
  StrCmp $WINFSP_PATH "" 0 +3
    ReadRegStr $WINFSP_PATH HKLM "SOFTWARE\WinFsp" "InstallDir"
  
  StrCmp $WINFSP_PATH "" WinFspNotFound WinFspFound
  
  WinFspNotFound:
    StrCpy $WINFSP_INSTALLED "0"
    Return
    
  WinFspFound:
    StrCpy $WINFSP_INSTALLED "1"
    Return
FunctionEnd

; Installation hooks
!macro customInstall
  ; Check if WinFsp is installed
  Call CheckWinFsp
  
  ; If not installed, prompt to install
  StrCmp $WINFSP_INSTALLED "1" SkipWinFspInstall
  
    MessageBox MB_YESNO|MB_ICONQUESTION "Apex Drive requires WinFsp to create the virtual drive.$\n$\nWould you like to download and install WinFsp now?" IDYES InstallWinFsp IDNO SkipWinFspInstall
    
    InstallWinFsp:
      ; Download WinFsp installer
      NSISdl::download "https://github.com/winfsp/winfsp/releases/download/v1.12/winfsp-1.12.22339.msi" "$TEMP\winfsp-installer.msi"
      Pop $0
      StrCmp $0 "success" +3
        MessageBox MB_OK|MB_ICONEXCLAMATION "Failed to download WinFsp. Please install it manually from https://winfsp.dev"
        Goto SkipWinFspInstall
      
      ; Run WinFsp installer
      ExecWait 'msiexec /i "$TEMP\winfsp-installer.msi" /qn'
      
      ; Clean up
      Delete "$TEMP\winfsp-installer.msi"
      
      ; Verify installation
      Call CheckWinFsp
      StrCmp $WINFSP_INSTALLED "1" +2
        MessageBox MB_OK|MB_ICONEXCLAMATION "WinFsp installation may have failed. Please install it manually from https://winfsp.dev"
  
  SkipWinFspInstall:
  
  ; Create Start Menu shortcut
  CreateDirectory "$SMPROGRAMS\Apex Drive"
  CreateShortCut "$SMPROGRAMS\Apex Drive\Apex Drive.lnk" "$INSTDIR\Apex Drive.exe"
  CreateShortCut "$SMPROGRAMS\Apex Drive\Uninstall Apex Drive.lnk" "$INSTDIR\Uninstall Apex Drive.exe"
  
  ; Create Desktop shortcut
  CreateShortCut "$DESKTOP\Apex Drive.lnk" "$INSTDIR\Apex Drive.exe"
  
  ; Register as startup program (optional - handled by app settings)
  ; WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ApexDrive" "$INSTDIR\Apex Drive.exe --hidden"
!macroend

!macro customUnInstall
  ; Remove Start Menu shortcuts
  Delete "$SMPROGRAMS\Apex Drive\Apex Drive.lnk"
  Delete "$SMPROGRAMS\Apex Drive\Uninstall Apex Drive.lnk"
  RMDir "$SMPROGRAMS\Apex Drive"
  
  ; Remove Desktop shortcut
  Delete "$DESKTOP\Apex Drive.lnk"
  
  ; Remove startup registry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ApexDrive"
  
  ; Clean up cache folder (ask user)
  MessageBox MB_YESNO|MB_ICONQUESTION "Would you like to remove the Apex Drive cache folder?$\n$\nThis will delete any locally cached files." IDNO SkipCacheRemoval
    RMDir /r "$LOCALAPPDATA\apex-drive-desktop"
  SkipCacheRemoval:
!macroend
