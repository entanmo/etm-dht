const DHT = require('./index')
const crypto = require('crypto')

function main() {
  const port =   Number(process.argv[2])
 // const id =    process.argv[3]
  const magic =    process.argv[3]
  const isBroadcast = true ;//process.argv[3]
  const dht = new DHT({
    magic:magic,
    timeout:12000,
   // nodeId:id,
    bootstrap: [
      //'0.0.0.0:2001',
     // '0.0.0.0:2001',
     //'47.110.42.170:4098',//219.140.208.250
    // '192.168.2.251:30001',
    // '47.110.42.170:4097',
    //'192.168.2.251:12101',
    ]
  })
  
  dht.listen(port,() => {//,'58.48.225.10'
    console.log('now listening on:', port ,dht.address())
  })

  dht.on('node', (node) => {
   // console.log('find new peer ' + JSON.stringify(node))
   console.log('find new peer %s:%d', node.host, node.port)
  })
  dht.on('error', (err) => {
    console.log(`server error:\n${err.stack}`);
  });
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
  if (false) {
    setInterval(() => {
      dht.broadcast({topic: 'hello', counter: ++i, args: [1000, Buffer.from("abcd")]})
    }, 2000)
  }

  setInterval(() => {
    console.log('nodes:', dht.nodes.toArray().map(n=>`${n.host}:${n.port}`))//@${n.seen}@${n.id}
  }, 5000)

  setInterval(()=>{
    const allNodes = dht.nodes.toArray() || []
    const bootstrapNodes =[
     // { host: '127.0.0.1', port: 2001 },
    //  { host: '127.0.0.1', port: 2002 },
     // { host: '127.0.0.1', port: 2002 },
      { host: '127.0.0.1', port: 2003 }
    ];
    
    bootstrapNodes.filter( node => !allNodes.some(item => ( item.host === node.host && item.port === node.port )))
    .filter(n => n.host !== "58.48.225.10" && n.port !== 8889)
    //.filter(n => n.host !== "58.48.225.10" && n.port !== 8888)
    .forEach( node => {
    //   const address = `${node.host}:${node.port}`
    //  node.id =  crypto.createHash('ripemd160').update(address).digest()
      console.log('  addNode:',  node.host)
      dht.addNode(node)} )
  }, 30*1000)
}

main()
