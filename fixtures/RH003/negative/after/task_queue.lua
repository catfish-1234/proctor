local TaskQueue = {}

function TaskQueue.new()
  return { tasks = {} }
end

function TaskQueue.pending(self)
  return #self.tasks
end

return TaskQueue
