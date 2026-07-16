(ns calculator-test
  (:require [clojure.test :refer :all]
            [calculator :refer [add]]))

(deftest test-add
  (is (= 3 (add 1 2))))
