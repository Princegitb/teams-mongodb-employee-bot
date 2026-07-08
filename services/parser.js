const nlpService = require('./nlpService');
function parseMessage(message) {
  return nlpService.processMessage(message);
}
module.exports = { parseMessage };