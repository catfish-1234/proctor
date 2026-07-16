(defn add [a b]
  #_{:clj-kondo/ignore [:unresolved-symbol]}
  (+ a b))

(defn subtract [a b]
  #_{:clj-kondo/ignore [:unresolved-symbol]}
  (- a b))
