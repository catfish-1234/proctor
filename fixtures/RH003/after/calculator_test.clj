(ns calculator-test
  (:require [clojure.test :refer :all]
            [calculator :refer [add]]))

(deftest ^:kaocha/skip test-add
  (is (= 3 (add 1 2))))
