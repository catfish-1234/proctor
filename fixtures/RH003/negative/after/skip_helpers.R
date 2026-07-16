skip <- function(n, xs) {
  xs[-(seq_len(min(n, length(xs))))]
}

skip_if_short <- function(n, xs) {
  if (length(xs) < n) return(xs)
  skip(n, xs)
}
