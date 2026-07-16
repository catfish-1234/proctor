module CalculatorSpec (spec) where

import Test.Hspec
import Calculator (add)

spec :: Spec
spec = do
  it "adds two numbers" $
    add 1 2 `shouldBe` 3
