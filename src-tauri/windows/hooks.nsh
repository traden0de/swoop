; Правило брандмауэра: без него iPhone не достучится до сервера Swoop.
; Разрешаем входящие подключения к swoop.exe только в частных и доменных сетях.
!macro NSIS_HOOK_POSTINSTALL
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Swoop"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Swoop" dir=in action=allow program="$INSTDIR\swoop.exe" enable=yes profile=private,domain'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Swoop"'
!macroend
