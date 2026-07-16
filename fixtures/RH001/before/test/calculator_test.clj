(ns calculator-test
  (:require [clojure.test :refer :all]
            [calculator :refer [add]]))

(deftest adds-two-numbers
  (is (= 5 (add 2 3))))
