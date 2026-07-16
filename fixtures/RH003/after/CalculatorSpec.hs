module CalculatorSpec (spec) where

import Test.Hspec
import Calculator (add)

spec :: Spec
spec = do
  xit "adds two numbers" $
    add 1 2 `shouldBe` 3
