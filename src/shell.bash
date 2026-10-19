if [[ -n ${BASH_VERSION:-} ]] && (( BASH_VERSINFO[0] > 3 || (BASH_VERSINFO[0] == 3 && BASH_VERSINFO[1] >= 2) )); then
  __atb___ATB_NONCE__() {
    local _atb_op=${1-} _atb_request=${2-} _atb_payload=${3-}
    local _atb_source _atb_rc _atb_host _atb_user _atb_cwd
    [[ $_atb_request =~ ^[a-f0-9]{32}$ ]] || return 0
    if [[ $- == *e* || $- == *x* || $- == *T* ]] || [[ -n $(builtin trap -p DEBUG RETURN ERR) ]]; then
      builtin printf '\036ATB1|__ATB_NONCE__|%s|REJECT|UNSUPPORTED_ENV\037' "$_atb_request"
      return 0
    fi
    if ! command -v base64 >/dev/null || ! command -v tr >/dev/null; then
      builtin printf '\036ATB1|__ATB_NONCE__|%s|REJECT|MISSING_DEPENDENCY\037' "$_atb_request"
      return 0
    fi
    case $_atb_op in
      probe)
        _atb_host=$(command hostname) || return 0
        _atb_user=$(command id -un) || return 0
        _atb_host=$(builtin printf '%s' "$_atb_host" | command base64 | command tr -d '\n') || return 0
        _atb_user=$(builtin printf '%s' "$_atb_user" | command base64 | command tr -d '\n') || return 0
        _atb_cwd=$(builtin printf '%s' "$PWD" | command base64 | command tr -d '\n') || return 0
        if (( ${#_atb_host} > 340 || ${#_atb_user} > 172 || ${#_atb_cwd} > 5464 )); then
          builtin printf '\036ATB1|__ATB_NONCE__|%s|REJECT|METADATA_LIMIT\037' "$_atb_request"
          return 0
        fi
        builtin printf '\036ATB1|__ATB_NONCE__|%s|PROBE|%s|%s|%s|%s|%s.%s.%s\037' "$_atb_request" "$_atb_host" "$_atb_user" "$_atb_cwd" "${BASH_VERSINFO[0]}" "${BASH_VERSINFO[0]}" "${BASH_VERSINFO[1]}" "${BASH_VERSINFO[2]}"
        ;;
      run)
        if (( ${#_atb_payload} > 2732 )) || [[ ! $_atb_payload =~ ^[A-Za-z0-9+/]+={0,2}$ ]]; then
          builtin printf '\036ATB1|__ATB_NONCE__|%s|REJECT|BAD_PAYLOAD\037' "$_atb_request"
          return 0
        fi
        _atb_source=$(builtin printf '%s' "$_atb_payload" | command base64 -d && builtin printf '.') || {
          builtin printf '\036ATB1|__ATB_NONCE__|%s|REJECT|BAD_PAYLOAD\037' "$_atb_request"
          return 0
        }
        _atb_source=${_atb_source%.}
        builtin printf '\036ATBV1|__ATB_NONCE__|%s|COMMAND|%s\037' "$_atb_request" "$_atb_payload"
        builtin printf '\036ATB1|__ATB_NONCE__|%s|BEGIN\037' "$_atb_request"
        if (builtin unset BASH_ENV ENV; "$BASH" --noprofile --norc -c "$_atb_source") </dev/null; then
          _atb_rc=0
        else
          _atb_rc=$?
        fi
        builtin printf '\036ATB1|__ATB_NONCE__|%s|END|%s\037' "$_atb_request" "$_atb_rc"
        ;;
      *) builtin printf '\036ATB1|__ATB_NONCE__|%s|REJECT|BAD_OPERATION\037' "$_atb_request" ;;
    esac
    return 0
  }
  export -n -f __atb___ATB_NONCE__
else
  printf '%s\n' 'Agent Terminal Bridge requires Bash >=3.2 in the selected target shell.' >&2
fi
