/**
 * Module dependencies.
 */

var commands = require('./commands'),utils = require('./utils/utils'),Queue = require('./utils/queue'),fs = require('fs');

var crypto = require('crypto');
var Rewriter = require('../lib/rewriter/rewriter');
var SyncTimer = require('../lib/timer/synctimer');

var mutate = [];

Object.keys(commands).forEach(function(cmd){
  var fn = commands[cmd];
  if (fn.mutates) {mutate.push(cmd);}
});

/**
 * Initialize a new `DataSync` with the given `server` and `options`.
 *
 * Options:
 *
 * `filename`   Append-only file path
 * @param {Object} options
 */

var DataSync = module.exports = function DataSync(options) {
  options = options || {};
  this.dbs = [];
  this.selectDB(0);
  this.client = options.client;
  this.aof = options.aof || false;
  this.log = options.log || console;
  this.interval = options.interval || 1000 * 60;
  this.flushQueue =  new Queue();
  this.mergerMap = {};
  if (!!options.filename) {
    this.filename = options.filename;
  } else {
    var path = process.cwd() + '/logs';
    try {
      fs.mkdirSync(path);
    } catch(ex){
    }
    this.filename = path+'/dbsync.log';
  }
  this.rewriter = options.rewriter || new Rewriter(options,this);
  this.stream = fs.createWriteStream(this.filename, { flags: 'a' });
  this.timer = options.timer || new SyncTimer();
  this.timer.start(this);
};

/**
 * Expose commands to store.
 */

DataSync.prototype = commands;

/**
 * Select database at the given `index`.
 *
 * @param {Number} index
 */

DataSync.prototype.selectDB = function(index){
  var db = this.dbs[index];
  if (!db) {
    db = {};
    db.data = {};
    this.dbs[index] = db;
  }
  this.db = db;
};

/**
 *return the first used db
 *
 *
 */
DataSync.prototype.use = function() {
  this.selectDB(0);
  var db = this.dbs[0];
  var keys = Object.keys(db);
  var dbkey = keys[0];
  return db[dbkey];
};

/**
 * Lookup `key`, when volatile compare timestamps to
 * expire the key.
 *
 * @param {String} key
 * @return {Object}
 */

DataSync.prototype.lookup = function(key){
  var obj = this.db.data[key];
  if (obj && 'number' == typeof obj.expires && Date.now() > obj.expires) {
    delete this.db.data[key];
    return;
  }
  return obj;
};

/**
 * Write the given `cmd`, and `args` to the AOF.
 *
 * @param {String} cmd
 * @param {Array} args
 */

DataSync.prototype.writeToAOF = function(cmd, args){
  var self = this;
  if (!self.aof) {return;}

  var argc = args.length;
  var op = '*' + (argc + 1) + '\r\n' + cmd + '\r\n';

  // Write head length
  this.stream.write(op);
  var i = 0;
  // Write Args
  for (i = 0; i < argc; ++i) {
    var key = utils.string(args[i]);
    this.stream.write(key);
    this.stream.write('\r\n');
  }
};
