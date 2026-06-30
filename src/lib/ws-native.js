// React Native has WebSocket built-in globally.
// This shim replaces the `ws` Node.js package so metro does not try
// to bundle Node.js-only modules (stream, zlib, crypto, http, etc.).
class WS extends WebSocket {
  constructor(url, protocols) {
    super(url, protocols);
  }
}

WS.WebSocket = WS;
WS.Server = class {
  constructor() {
    throw new Error("WebSocket Server is not supported in React Native");
  }
};
WS.Receiver = class {};
WS.Sender = class {};

module.exports = WS;
module.exports.WebSocket = WS;
module.exports.default = WS;
