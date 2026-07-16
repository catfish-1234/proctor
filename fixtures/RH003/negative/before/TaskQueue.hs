module TaskQueue where

-- | Returns True if the task count is above the busy threshold.
busy :: Int -> Bool
busy n = n > 10
