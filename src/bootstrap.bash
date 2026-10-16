if [[ -n ${BASH_VERSION:-} ]] && (( BASH_VERSINFO[0] > 3 || (BASH_VERSINFO[0] == 3 && BASH_VERSINFO[1] >= 2) )); then
  if ! command -v base64 >/dev/null || ! command -v tr >/dev/null; then
    builtin printf '\036ATB1|__ATB_NONCE__|__ATB_REQUEST__|REJECT|MISSING_DEPENDENCY\037';
  else
  __atb_load___ATB_NONCE__() {
    local _op=${1-} _req=${2-} _seq=${3-} _chunk=${4-} _source;
    [[ $_req =~ ^[a-f0-9]{32}$ ]] || return 0;
    if [[ $_seq != "$_atb_index___ATB_NONCE__" ]]; then
      builtin printf '\036ATB1|__ATB_NONCE__|%s|REJECT|TRANSFER_SEQUENCE\037' "$_req"; return 0;
    fi;
    case $_op in
      append)
        if [[ ! $_chunk =~ ^[A-Za-z0-9+/=]+$ ]] || (( ${#_chunk} > 384 || ${#_atb_buffer___ATB_NONCE__} + ${#_chunk} > 16384 )); then
          builtin printf '\036ATB1|__ATB_NONCE__|%s|REJECT|TRANSFER_LIMIT\037' "$_req"; return 0;
        fi;
        _atb_buffer___ATB_NONCE__="$_atb_buffer___ATB_NONCE__$_chunk";
        _atb_index___ATB_NONCE__=$((_atb_index___ATB_NONCE__ + 1));
        ;;
      commit)
        if [[ $_chunk != "${#_atb_buffer___ATB_NONCE__}" ]] || ! _source=$(builtin printf '%s' "$_atb_buffer___ATB_NONCE__" | command base64 -d && builtin printf '.'); then
          builtin printf '\036ATB1|__ATB_NONCE__|%s|REJECT|TRANSFER_DECODE\037' "$_req"; return 0;
        fi;
        builtin eval "${_source%.}" || return 0;
        builtin unset _atb_buffer___ATB_NONCE__ _atb_index___ATB_NONCE__;
        builtin unset -f __atb_load___ATB_NONCE__;
        ;;
      *) return 0 ;;
    esac;
    builtin printf '\036ATB1|__ATB_NONCE__|%s|ACK\037' "$_req";
  };
  _atb_buffer___ATB_NONCE__=; _atb_index___ATB_NONCE__=0;
  export -n -f __atb_load___ATB_NONCE__;
  builtin printf '\036ATB1|__ATB_NONCE__|__ATB_REQUEST__|ACK\037';
  fi;
else
  printf '\036ATB1|__ATB_NONCE__|__ATB_REQUEST__|REJECT|UNSUPPORTED_SHELL\037';
fi
