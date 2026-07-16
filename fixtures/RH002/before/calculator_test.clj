(ns calculator-test
  (:require [clojure.test :refer :all]
            [calculator :refer [add]]))

(deftest add-test
  (testing "adds two numbers"
    (is (= (add 2 3) 5))))
