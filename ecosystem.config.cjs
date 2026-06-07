module.exports = {
  apps : [{
    name   : "world_maker_server",
    script : "server.js",
    watch  : ["server.js"]
  }, {
    name   : "world_maker_builder",
    script : "./node_modules/vite/bin/vite.js",
    args   : "build --watch",
    watch  : false
  }]
}
