local TaskQueue = {}

function TaskQueue.new()
  return { tasks = {} }
end

return TaskQueue
