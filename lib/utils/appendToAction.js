const appendToAction = (action, payloadProps) => ({
  ...action,
  payload: { ...action.payload, ...payloadProps }
})

module.exports = appendToAction
