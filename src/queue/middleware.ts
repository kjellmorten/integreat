import debugLib = require('debug')
import nextSchedule from '../utils/nextSchedule'
import enqueue from './enqueue'

const debug = debugLib('great')

const getNextTime = action => {
  if (action.meta && action.meta.schedule) {
    try {
      return nextSchedule(action.meta.schedule, true)
    } catch (error) {
      debug('Error when rescheduling action %o', action)
    }
  }
  return null
}

const enqueueNext = (queue, action) => {
  const nextTime = getNextTime(action)

  if (nextTime) {
    const nextAction = {
      ...action,
      meta: { ...action.meta, queue: nextTime.getTime() }
    }
    return enqueue(queue, nextAction)
  }
  return
}

function middleware(next, queue) {
  return async action => {
    if (action.meta && action.meta.queue) {
      return enqueue(queue, action)
    } else {
      const response = next(action)
      enqueueNext(queue, action)
      return response
    }
  }
}

export default middleware
