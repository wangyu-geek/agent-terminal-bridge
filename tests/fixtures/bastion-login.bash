#!/bin/bash
# Local fake SSH boundary: an older bastion knows screen/xterm terminfo only.
printf 'Terminal: %s\n' "$TERM"
printf 'Locale variables present: [%s%s%s%s%s]\n' "${LANG+x}" "${LC_ALL+x}" "${LC_CTYPE+x}" "${LC_TERMINAL+x}" "${LC_TERMINAL_VERSION+x}"
printf 'Preserved environment: %s|%s|%s\n' "$ATB_FIXTURE_KEEP" "$SSH_AUTH_SOCK" "$LC_TIME"
known_terminal=true
case "$TERM" in
  screen|screen-256color|xterm|xterm-256color) ;;
  *) printf "'%s': unknown terminal type.\n" "$TERM"; known_terminal=false ;;
esac
printf 'Select server> '
IFS= read -r selection || exit 1
if [[ "$known_terminal" != true || "$selection" != 1 ]]; then
  printf 'Selection failed\n'
  exit 1
fi
printf 'Verification code> '
IFS= read -r -s verification || exit 1
printf '\n'
if [[ "$verification" != 123456 ]]; then
  printf 'Authentication failed\n'
  exit 1
fi
printf 'Authenticated target> '
IFS= read -r command
