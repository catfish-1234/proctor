module TaskQueue where

-- | Returns True if the task count is above the busy threshold.
busy :: Int -> Bool
busy n = n > 10

-- | Returns True if there are tasks still pending completion.
pending :: Int -> Bool
pending n = n > 0
