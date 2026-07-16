module CalculatorSpec (spec) where

import Test.Hspec
import Calculator (add)

spec :: Spec
spec = describe "add" $ do
  it "adds two numbers" $ do
    add 2 3 `shouldBe` 5
