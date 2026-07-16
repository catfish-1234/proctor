add :: Int -> Int -> Int
{-# ANN add ("HLint: ignore") #-}
add a b = a + b

subtract' :: Int -> Int -> Int
{-# ANN subtract' ("HLint: ignore") #-}
subtract' a b = a - b
