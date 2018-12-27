const DHT = require('./index')


function main() {
  const port =   Number(process.argv[2])
 // const id =    process.argv[3]
  const magic =    process.argv[3]
  const isBroadcast = true ;//process.argv[3]
  const dht = new DHT({
    magic:magic,
   // nodeId:id,
    bootstrap: [
      //'0.0.0.0:2001',
     // '0.0.0.0:2001',
      '192.168.2.78:4096',//219.140.208.250
    ]
  })
  
  dht.listen(port, () => {
    console.log('now listening on:', port)
  })

  dht.on('node', (node) => {
    console.log('find new peer ' + JSON.stringify(node))
    ///console.log('find new peer %s:%d', node.host, node.port)
  })

  dht.on('broadcast', (msg, peer) => {
   console.log('receive broadcast from peer %s:%d', peer.host, peer.port)//, msg, peer
  })
  dht.on('ready', () => {
    console.log('node ready' )
  })
  dht.on('remove', (id) => {
    console.log('node disconnected:', id)
  })

  let i = 0
  if (isBroadcast) {
    setInterval(() => {
      dht.broadcast({topic: 'hello', counter: ++i, args: [1000, Buffer.from("abcd")]})
    }, 2000)
  }
}

main()
