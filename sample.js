const DHT = require('./index')

const dht = new DHT({
  bootstrap: [
    '0.0.0.0:2001',
    '0.0.0.0:2002',
    // '0.0.0.0:2003',
  ]
})

function main() {
  const port = process.argv[2] ? Number(process.argv[2]) : 3000
  const isBroadcast = process.argv[3] 

  dht.listen(port, () => {
    console.log('now listening on:', port)
  })

  dht.on('node', (node) => {
    console.log('find new peer %s:%d', node.host, node.port)
  })

  dht.on('broadcast', (msg, peer) => {
    //console.log('receive broadcast from peer %s:%d', peer.host, peer.port, msg.topic.toString('utf8'), msg.counter, msg.args[0], msg.args[1].toString('utf8'))
  })

  dht.on('remove', (id) => {
    console.log('node disconnected:', id)
  })

  let i = 0
  if (isBroadcast) {
    setInterval(() => {
      dht.broadcast({topic: 'hello', counter: ++i, args: [1000, Buffer.from("abcd")], recursive: 1})
    }, 5000)
  }

  setInterval(() => {
    console.log('nodes:', dht.nodes.toArray().map(n=>`${n.host}:${n.port}@${n.seen}`))
  }, 5000)

  setInterval(()=>{
    const allNodes = dht.nodes.toArray() || []
    const bootstrapNodes =[
      { host: '127.0.0.1', port: 2001 },
      { host: '127.0.0.1', port: 2002 },
      //{ host: '127.0.0.1', port: 2003 }
    ];
    
    bootstrapNodes.filter( node => !allNodes.some(item => ( item.host === node.host && item.port === node.port )))
    .forEach( node => dht.addNode(node) )
  }, 10000)

}

main()
