module CalculatorSpec (spec) where

import Test.Hspec
import Data.Maybe (isJust)
import Calculator (safeDivide)

spec :: Spec
spec = do
  describe "safeDivide" $ do
    it "divides two numbers" $ do
      let result = safeDivide 6 3
      result `shouldBe` Just 2
