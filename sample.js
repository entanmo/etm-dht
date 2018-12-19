const DHT = require('./index')

const dht = new DHT({
  bootstrap: [
    '0.0.0.0:2001',
    '0.0.0.0:2002',
    '0.0.0.0:2003',
  ]
})

function main() {
  const port = Number(process.argv[2])
  const isBroadcast = process.argv[3]

  dht.listen(port, () => {
    console.log('now listening on:', port)
  })

  dht.on('node', (node) => {
    console.log('find new peer %s:%d', node.host, node.port)
  })

  dht.on('broadcast', (msg, peer) => {
    console.log('receive broadcast from peer %s:%d', peer.host, peer.port, msg, peer)
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
