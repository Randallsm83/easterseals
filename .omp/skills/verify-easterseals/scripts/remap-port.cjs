// Verification scaffolding: app.js hardcodes port 8001; rebind it to VERIFY_PORT on loopback only.
const net = require('net')
const port = Number(process.env.VERIFY_PORT)
if (!Number.isInteger(port)) throw new Error('remap-port: VERIFY_PORT not set')
const listen = net.Server.prototype.listen
net.Server.prototype.listen = function (...args) {
  if (args[0] === 8001) {
    const cb = args.find((a) => typeof a === 'function')
    return listen.call(this, port, '127.0.0.1', () => {
      console.log(`verify: app port 8001 remapped to http://127.0.0.1:${port}`)
      if (cb) cb()
    })
  }
  return listen.apply(this, args)
}
