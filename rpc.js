var socket = require('./socket')
var KBucket = require('k-bucket')
var equals = require('buffer-equals')
var events = require('events')
var randombytes = require('randombytes')
var util = require('util')
var Buffer = require('safe-buffer').Buffer
var uuidv4 = require('uuid/v4')

var K = 20
var MAX_CONCURRENCY = 16
var BOOTSTRAP_NODES = []

module.exports = RPC

function RPC (opts) {
  if (!(this instanceof RPC)) return new RPC(opts)
  if (!opts) opts = {}

  var self = this

  this._idLength = opts.idLength || 20
  this.id = toBuffer(opts.id || opts.nodeId || randombytes(this._idLength))
  this.socket = opts.krpcSocket || socket(opts)
  this.bootstrap = toBootstrapArray(opts.nodes || opts.bootstrap)
  this.concurrency = opts.concurrency || MAX_CONCURRENCY
  this.backgroundConcurrency = opts.backgroundConcurrency || (this.concurrency / 4) | 0
  this.k = opts.k || K
  this.destroyed = false
  this.magic = opts.magic
  this.pending = []
  this.nodes = null
  this.bannedSet = new Set()

  this.socket.setMaxListeners(0)
  this.socket.on('query', onquery)
  this.socket.on('broadcast', onbroadcast)
  this.socket.on('response', onresponse)
  this.socket.on('warning', onwarning)
  this.socket.on('error', onerror)
  this.socket.on('update', onupdate)
  this.socket.on('listening', onlistening)

  events.EventEmitter.call(this)
  this.clear()

  function onupdate () {
    while (self.pending.length && self.socket.inflight < self.concurrency) {
      var next = self.pending.shift()
      self.query(next[0], next[1], next[2])
    }
  }

  function onerror (err) {
    self.emit('error', err)
  }

  function onlistening () {
    self.emit('listening')
  }

  function onwarning (err) {
    self.emit('warning', err)
  }

  function onbanned_message(peer, type, message ) {
    self.emit('banned_message', peer, type, message)
  }

  function onquery (query, peer) {
    if(!query.a.magic || query.a.magic.toString()!= self.magic){
      console.log('onquery wrong net work '+JSON.stringify(peer))
      return
    }
    const ip = peer.host || peer.address
    if (self.bannedSet.has(ip)) {
      return onbanned_message(peer, 'query', query)
    }

    addNode(query.a, peer)
    self.emit('query', query, peer)
  }

  function onresponse (reply, peer) {
    if(!reply.r.magic || reply.r.magic.toString() != self.magic ){
      console.log('onresponse wrong net work '+JSON.stringify(peer))
      return
    }
    const ip = peer.host || peer.address
    if (self.bannedSet.has(ip)) {
      return onbanned_message(peer, 'response', reply )
    }

    addNode(reply.r, peer)
  }

  function onbroadcast (message, peer) {
    // console.log('onbroadcast '+JSON.stringify(message.magic )+JSON.stringify(self.magic))
    if(!message.magic ||message.magic != self.magic){
      console.log('wrong net work ')
      return
    }
    const ip = peer.host || peer.address
    if (self.bannedSet.has(ip)) {
      return onbanned_message(peer, 'boradcast', message )
    }

    addNode(message, peer)
    self.emit('broadcast', message, peer)
    if (message.recursive) {
      self.broadcast(message)
    }
  }

  function addNode (data, peer) {
    if (data && isNodeId(data.id, self._idLength) && !equals(data.id, self.id)) {
      var old = self.nodes.get(data.id)
      if (old) {
        old.seen = Date.now()
        return
      }
      self._addNode({
        id: data.id,
        host: peer.address || peer.host,
        port: peer.port,
        distance: 0,
        seen: Date.now()
      })
    }
  }
}

util.inherits(RPC, events.EventEmitter)

RPC.prototype.removeNode = function (id, reason) {
  this.nodes.remove(id)
  this.emit('remove', id, reason)
}

RPC.prototype.ban = function (...ips) {
  for( let ip of ips) {
    if (!this.bannedSet.has(ip)) {
      this.bannedSet.add(ip)
    }
  }

  this.nodes.toArray()
    .filter(n => ips.includes(n.host))
    .forEach(n => this.removeNode(n.id, `ban node ${n.host}:${n.port}` ))
}

RPC.prototype.unban = function (ip) {
  if (this.bannedSet.has(ip)) this.bannedSet.delete(ip)
}

RPC.prototype.response = function (node, query, response, nodes, cb) {
  if (typeof nodes === 'function') {
    cb = nodes
    nodes = null
  }

  if (!response.id) response.id = this.id
  if (!response.magic) response.magic = this.magic
  if (nodes) response.nodes = encodeNodes(nodes, this._idLength)
  this.socket.response(node, query, response, cb)
}

RPC.prototype.error = function (node, query, error, cb) {
  this.socket.error(node, query, error, cb)
}

// bind([port], [address], [callback])
RPC.prototype.bind = function () {
  this.socket.bind.apply(this.socket, arguments)
}

RPC.prototype.address = function () {
  return this.socket.address()
}

RPC.prototype.queryAll = function (nodes, message, visit, cb) {
  if (!message.a) message.a = {}
  if (!message.a.id) message.a.id = this.id
  if (!message.a.magic) message.a.magic = this.magic
  var stop = false
  var missing = nodes.length
  var hits = 0
  var error = null

  if (!missing) return cb(new Error('No nodes to query'), 0)

  for (var i = 0; i < nodes.length; i++) {
    this.query(nodes[i], message, done)
  }

  function done (err, res, peer) {
    if (!err) hits++
    else if (err.code >= 300 && err.code < 400) error = err
    if (!err && !stop) {
      if (visit && visit(res, peer) === false) stop = true
    }
    if (!--missing) cb(hits ? null : error || new Error('All queries failed'), hits)
  }
}

RPC.prototype.query = function (node, message, cb) {
  if (this.socket.inflight >= this.concurrency) {
    this.pending.push([node, message, cb])
  } else {
    if (!message.a) message.a = {}
    if (!message.a.id) message.a.id = this.id
    if (!message.a.magic) message.a.magic = this.magic
    if (node.token) message.a.token = node.token
    this.socket.query(node, message, cb)
  }
}

RPC.prototype.destroy = function (cb) {
  this.destroyed = true
  this.socket.destroy(cb)
}

RPC.prototype.clear = function () {
  var self = this

  this.nodes = new KBucket({
    localNodeId: this.id,
    numberOfNodesPerKBucket: this.k,
    numberOfNodesToPing: this.concurrency
  })

  this.nodes.on('ping', onping)

  function onping (older, newer) {
    const ip = newer.host || newer.address
    if (self.bannedSet.has(ip)) {
      return onbanned_message(newer, 'ping' )
    }
    self.emit('ping', older, function swap (deadNode) {
      if (!deadNode) return
      if (deadNode.id) self.removeNode(deadNode.id, new Error('k-bucket ping dead node'))
      self._addNode(newer)
    })
  }
}

RPC.prototype.broadcast = function (message, peers) {

  function getRandomPeers(count, avaliblePeers) {
    if (avaliblePeers.length <= count) return avaliblePeers

    const randomPeers = []
    while(count-- > 0 && avaliblePeers.length > 0) {
      const rnd = Math.floor(Math.random() * avaliblePeers.length)
      const peer = avaliblePeers[rnd]
      avaliblePeers.splice(rnd, 1)
      randomPeers.push(peer)
    }
    return randomPeers
  }

  if (!message.mid) message.mid = uuidv4()
  message.id = this.id
  message.magic = this.magic
  peers = Array.isArray(peers) && peers.length > 0 ? peers : 
    getRandomPeers(K, this.nodes.toArray().filter(n => !this.bannedSet.has(n.host)))
  for(let peer of peers) {
     this.socket.notify(peer, message)
  }
}

RPC.prototype.populate = function (target, message, cb) {
  this._closest(target, message, true, null, cb)
}

RPC.prototype.closest = function (target, message, visit, cb) {
  this._closest(target, message, false, visit, cb)
}

RPC.prototype._addNode = function (node) {
  var old = this.nodes.get(node.id)
  this.nodes.add(node)
  if (!old) this.emit('node', node)
}

RPC.prototype._closest = function (target, message, background, visit, cb) {
  if (!cb) cb = noop

  var self = this
  var count = 0
  var queried = {}
  var pending = 0
  var once = true
  var stop = false

  if (!message.a) message.a = {}
  if (!message.a.id) message.a.id = this.id
  if (!message.a.magic) message.a.magic = this.magic
  var table = new KBucket({
    localNodeId: target,
    numberOfNodesPerKBucket: this.k,
    numberOfNodesToPing: this.concurrency
  })

  var evt = background ? 'postupdate' : 'update'
  this.socket.on(evt, kick)
  kick()

  function kick () {
    if (self.destroyed || self.socket.inflight >= self.concurrency) return

    var otherInflight = self.pending.length + self.socket.inflight - pending
    if (background && self.socket.inflight >= self.backgroundConcurrency && otherInflight) return

    var closest = table.closest(target, self.k)
    if (!closest.length || closest.length < self.bootstrap.length) {
      closest = self.nodes.closest(target, self.k)
      if (!closest.length || closest.length < self.bootstrap.length) bootstrap()
    }
    for (var i = 0; i < closest.length; i++) {
      if (stop) break
      if (self.socket.inflight >= self.concurrency) return

      var peer = closest[i]
      var id = peer.host + ':' + peer.port
      if (queried[id]) continue
      queried[id] = true

      pending++
      self.socket.query(peer, message, afterQuery)
    }

    if (!pending) {
      self.socket.removeListener(evt, kick)
      process.nextTick(done)
    }
  }

  function done () {
    cb(null, count)
  }

  function bootstrap () {
    if (!once) return
    once = false
    self.bootstrap.forEach(function (peer) {
      pending++
      self.socket.query(peer, message, afterQuery)
    })
  }

  function afterQuery (err, res, peer) {
    pending--
    if (peer) queried[(peer.address || peer.host) + ':' + peer.port] = true // need this for bootstrap nodes

    if (peer && peer.id && self.nodes.get(peer.id)) {
      if (err && (err.code === 'EUNEXPECTEDNODE' || err.code === 'ETIMEDOUT')) {
        self.removeNode(peer.id, err)
      }
    }

    var r = res && res.r
    if (!r) return kick()

    if (!err && isNodeId(r.id, self._idLength)) {
      count++
      add({
        id: r.id,
        port: peer.port,
        host: peer.host || peer.address,
        distance: 0
      })
    }

    var nodes = r.nodes ? parseNodes(r.nodes, self._idLength) : []
    for (var i = 0; i < nodes.length; i++) add(nodes[i])

    if (visit && visit(res, peer) === false) stop = true

    kick()
  }

  function add (node) {
    if (equals(node.id, self.id)) return
    table.add(node)
  }
}

function toBootstrapArray (val) {
  if (val === false) return []
  if (val === true) return BOOTSTRAP_NODES
  return [].concat(val || BOOTSTRAP_NODES).map(parsePeer)
}

function isNodeId (id, idLength) {
  return id && Buffer.isBuffer(id) && id.length === idLength
}

function encodeNodes (nodes, idLength) {
  var buf = Buffer.allocUnsafe(nodes.length * (idLength + 6))
  var ptr = 0

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i]
    if (!isNodeId(node.id, idLength)) continue
    node.id.copy(buf, ptr)
    ptr += idLength
    var ip = (node.host || node.address).split('.')
    for (var j = 0; j < 4; j++) buf[ptr++] = parseInt(ip[j] || 0, 10)
    buf.writeUInt16BE(node.port, ptr)
    ptr += 2
  }

  if (ptr === buf.length) return buf
  return buf.slice(0, ptr)
}

function parseNodes (buf, idLength) {
  var contacts = []

  try {
    for (var i = 0; i < buf.length; i += (idLength + 6)) {
      var port = buf.readUInt16BE(i + (idLength + 4))
      if (!port) continue
      contacts.push({
        id: buf.slice(i, i + idLength),
        host: parseIp(buf, i + idLength),
        port: port,
        distance: 0,
        token: null
      })
    }
  } catch (err) {
    // do nothing
  }

  return contacts
}

function parseIp (buf, offset) {
  return buf[offset++] + '.' + buf[offset++] + '.' + buf[offset++] + '.' + buf[offset++]
}

function parsePeer (peer) {
  if (typeof peer === 'string') return {host: peer.split(':')[0], port: Number(peer.split(':')[1])}
  return peer
}

function noop () {}

function toBuffer (str) {
  if (Buffer.isBuffer(str)) return str
  if (ArrayBuffer.isView(str)) return Buffer.from(str.buffer, str.byteOffset, str.byteLength)
  if (typeof str === 'string') return Buffer.from(str, 'hex')
  throw new Error('Pass a buffer or a string')
}
