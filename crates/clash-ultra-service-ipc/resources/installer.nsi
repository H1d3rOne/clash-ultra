OutFile "ClashUltraServiceInstaller.exe"

InstallDir "$PROGRAMFILES\ClashUltraService"

Page directory
Page instfiles

Section "Install"
    SetOutPath $INSTDIR

    ;FILES_PLACEHOLDER

    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ExecShell "" "$INSTDIR\clash-ultra-service-install.exe"
SectionEnd

Section "Uninstall"
    Delete "$INSTDIR\*.exe"
    Delete "$INSTDIR\Uninstall.exe"
    RMDir "$INSTDIR"
SectionEnd
