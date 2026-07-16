add() {
  # shellcheck disable=SC2086
  echo $(( $1 + $2 ))
}

subtract() {
  # shellcheck disable=SC2086
  echo $(( $1 - $2 ))
}
