skip <- function(n, xs) {
  xs[-(seq_len(min(n, length(xs))))]
}
