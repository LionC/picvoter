var mongo = require('mongodb');
var express = require('express');
var bodyParser = require('body-parser');
var uuid = require('uuid').v4;
var promise = require('promise')

var fs = require('fs-extra');
var assert = require('assert');
var path = require('path');

var db = require('./db');
var md5File = require('md5-file')

var gaussian = require('gaussian');
var sharp = require('sharp')

require('console-stamp')(console, 'HH:MM:ss.l')
var cors = require('cors')
var rimraf = require('rimraf')

var cron = require('node-cron');

var collection = null;

cron.schedule('0 0 2 * * *', startAllPendingImports)

db.connect(function(err) {
      assert.equal(err, null);

      collection = db.collection('pics');

      imports = db.collection('imports');

      collection.ensureIndex({sorting: -1, confidenceLevel: 1})

      var app = express();

      app.use(cors())

      app.use(bodyParser.json())

      app.use(express.static('public'))

      app.param('picId', picMiddleware);

      //processFiles()

      app.get('/newpic', function(req, res) {
          getLowestVotedPic(function(err, pic) {
              if(err == "NOT FOUND") {
                  res.status(404).send();
                  return;
              }

              res.status(200).json(pic);
          });
      })

      app.post('/:picId/votes', function(req, res) {
          if(isNaN(req.pic.ups)) {
              req.pic.ups = 0;
              req.pic.downs = 0;
          }
          if(req.body.type == "UP") {
              req.pic.ups++;
          } else {
              req.pic.downs++;
          }

          req.pic.sorting = confidenceLevel(req.pic.ups, req.pic.downs)
          req.pic.confidenceLevel = Math.abs(0.5 - confidenceLevel(req.pic.ups, req.pic.downs))

          save(req.pic, function(err) {
              assert.equal(err, null);

              res.status(201).send();
          });
      });


      app.get('/hotpics', function(req, res) {
          getBestPictures(function(err, pics) {
              res.status(200).json(pics);
          })
      })


     app.get('/imports/actions/start', function (req,res) {
         startAllPendingImports()
         res.status(201)
     })

     app.get('/imports', function (req,res) {
         imports.find().toArray(function(err, array)  {

             if(err != null){
                 console.log(err);
             }
             if(array == undefined && array.length == 0) {
                 res.status(200).json([])
                 return;
             }
             res.status(200).json(array)
         })
     })

      app.listen(8080, function(err) {
          assert.equal(err, null);

          console.log('Listening on 8080');
      });
})

function randomWithBias(max) {
    var unif = Math.random()
    var beta = 1 - Math.pow(Math.sin(unif * Math.PI / 2), 2)
    return parseInt(Math.abs(beta * max))
}


function getLowestVotedPic(cb) {

    collection
        .count()
        .then(length => {

            var random = randomWithBias(length / 2)

            collection
                .find({'sorting' : { $gt: -3}})
                .sort({'sorting': -1})
                .limit(1)
                .skip(random)
                .toArray(function(err, array) {
                    if(err != null){
                        console.log(err);
                    }
                    if(array == undefined && array.length == 0) {
                        cb("NOT FOUND");
                        return;
                    }
                    var elem = array[0];
                    cb(err, elem)
                    console.log("serving " + random + "s picture with level " + elem.confidenceLevel + " and votes " + (elem.ups + elem.downs));
                });

        })
}

function confidenceLevel(ups, downs) {
    if (ups == 0) {
      if(downs == 0)
        return 0.5
      return -downs
    }

    n = ups + downs
    z = 1.64485 //1.0 = 85%, 1.6 = 95%
    phat = ups / n
    return (phat + z * z / ( 2 * n ) - z * Math.sqrt((phat * ( 1 - phat ) + z * z / ( 4 * n )) / n))/( 1 + z * z  / n)
}


function getBestPictures(cb) {
    collection.find().sort({'confidenceLevel': -1}).limit(1000).toArray(function(err, array) {
        cb(err, array);
    })
}

function picMiddleware(req, res, next, picId) {
    collection.findOne({_id: picId}, function(err, pic) {
        assert.equal(err, null);

        req.pic = pic;

        next();
    });
}

function startAllPendingImports() {

    console.log('starting pending imports')
    imports
        .find({status: { $exists: false }})
        .toArray(function(err, array){
            if(err != null || array.length == 0) {
                console.log("did not find any imports pending!")
                return
            }

            array.reduce((promise, elem) => {
                return promise.then(a => {
                    return processImport(elem)
                })
            }, Promise.resolve())
        })
}

function processImport(batch) {
    console.log('importing id "' + batch.id + '" from author ' + batch.author)
    /*
    id
    author
    */

    batch.status = 'importing'

    return fs
        .readdir('import/' + batch.id)
        .then(onDirRead);

    function onDirRead(files) {
        console.log('[import][' + batch.id + '] found ' + files.length + ' files')

        batch.files = files.length
        batch.started = new Date()

        imports.save(batch)

        var promisses = files.map(file => processFile(batch, file))

        return Promise
            .all(promisses)
            .then(values => {
                console.log('deleting import/' + batch.id)

                rimraf.sync('import/' + batch.id, {},  err => {})

                return imports
                    .findOne({_id: batch._id}, (err, batch) => {
                        if(err != null) {
                            console.error(err)
                        }
                        batch.status = 'done'
                        batch.ended = new Date()
                        var dif = batch.ended - batch.started
                        batch.took = dif / 1000
                        console.log('import ' + batch.id + ' done. took ' + batch.took + 's')
                        return imports.save(batch)
                    })
            })
            .catch(err => {
                console.error(err)
            })
    }
}

function processFile(batch, file) {
    var filename = path.basename(file)

    var hash = md5File.sync('import/' + batch.id + '/' + filename)

    return collection
        .findOne({hash: hash})
        .then (function(err, result) {
            if(result == null) {
                return scaleAndCopyPicture(batch, filename, file, hash)
            }
        })
        .catch(err => {
            console.error(err)
        })
}

function scaleAndCopyPicture(batch, filename, file,  hash) {
    var authorDir = '/' + batch.author
    var newFileName = authorDir + '/' + file

    if (!fs.existsSync('./public/pics/small' + authorDir)){
      fs.mkdirSync('./public/pics/small' + authorDir);
    }

    if (!fs.existsSync('./public/pics/orig' + authorDir)){
      fs.mkdirSync('./public/pics/orig' + authorDir);
    }

    return sharp('./import/' + batch.id + '/' + filename)
        .resize(1920, 1200)
        .max()
        .toFormat('jpeg')
        .toFile('./public/pics/small' + newFileName)
        .then(function() {

            console.log('[import][' + batch.id + '] adding ' + file)
            return fs
                .rename('./import/' + batch.id + '/' + filename, './public/pics/orig' + newFileName)
                .then(a => {
                    return createNewPic(batch, '/pics/small' + newFileName, hash)
                })
            })
        .catch(function (error) {
            console.log('[import][' + batch.id + '] error resizing ' + file)
            console.dir(error)
        })
}


function createNewPic(batch, filename, hash) {
    var newPic = {
        _id: uuid(),
        filename: filename,
        hash: hash,
        ups: 0,
        downs: 0,
        sorting: confidenceLevel(0,0),
        confidenceLevel: Math.abs(0.5 - confidenceLevel(0,0)),
    };

    return collection.insertOne(newPic);
}


function save(pic, cb) {
    collection.save(pic, cb);
}
