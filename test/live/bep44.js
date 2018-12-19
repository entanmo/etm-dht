var test = require('tape')
var DHT = require('../../')
var ed = require('ed25519-supercop')

test('Set and get before ready is emitted', function (t) {
  var dht1 = new DHT()
  var dht2 = new DHT()

  dht1.put({v: 'myvalue'}, function (err, hash, n) {
    t.error(err)
    t.ok(hash)
    dht2.get(hash, function (err, value) {
      t.error(err)
      t.same(value.v.toString(), 'myvalue')
      dht1.destroy()
      dht2.destroy()
      t.end()
    })
  })
})

test('put mutable', function (t) {
  var dht1 = new DHT()
  var dht2 = new DHT({verify: ed.verify})
  var k = kp()

  dht1.put({
    k: k.publicKey,
    v: 'myvalue',
    sign: sign,
    seq: 0
  }, function (err, hash, n) {
    t.error(err)
    t.ok(hash)
    dht2.get(hash, function (err, value) {
      t.error(err)
      t.same(value.v.toString(), 'myvalue')
      dht1.destroy()
      dht2.destroy()
      t.end()
    })
  })

  function sign (buf) {
    return ed.sign(buf, k.publicKey, k.secretKey)
  }
})

test('put mutable (salted)', function (t) {
  var dht1 = new DHT()
  var dht2 = new DHT({verify: ed.verify})
  var k = kp()
  var salt = ed.createSeed().slice(0, 20)

  dht1.put({
    k: k.publicKey,
    v: 'myvalue',
    sign: sign,
    seq: 0,
    salt: salt
  }, function (err, hash, n) {
    t.error(err)
    t.ok(hash)
    dht2.get(hash, function (_, value) {
      t.ok(!value, 'salt required')
      dht2.get(hash, {salt: salt}, function (err, value) {
        t.error(err)
        t.same(value.v.toString(), 'myvalue')
        dht1.destroy()
        dht2.destroy()
        t.end()
      })
    })
  })

  function sign (buf) {
    return ed.sign(buf, k.publicKey, k.secretKey)
  }
})

function kp () {
  return ed.createKeyPair(ed.createSeed())
}
