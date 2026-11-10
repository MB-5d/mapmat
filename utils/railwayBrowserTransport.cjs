const WebSocket = require('ws');
// Railway's current tcp-proxy rejects SDK WebSockets without its dashboard
// Origin, even with a valid scoped shell token. The supported SDK transport hook
// supplies that header; token authentication and TLS verification remain intact.
class RailwayBrowserTransport extends WebSocket {
  constructor(url, protocols) {
    const target = new URL(url);
    if (target.protocol !== 'wss:' || target.hostname !== 'ssh.railway.com' || target.port !== '2226') {
      throw Error('Unexpected Railway browser transport endpoint.');
    }
    super(url, protocols, { origin:'https://railway.com', maxPayload:64*1024*1024, perMessageDeflate:false });
  }
}
module.exports={RailwayBrowserTransport};
