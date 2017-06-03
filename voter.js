var mongo = require('mongodb');
var express = require('express');
var bodyParser = require('body-parser');
var uuid = require('uuid').v4;

var fs = require('fs');
var assert = require('assert');
var path = require('path');

var db = require('./db');
var md5File = require('md5-file')


var collection = null;


db.connect(function(err) {
      assert.equal(err, null);

      collection = db.collection('pics');

      imports = db.collection('imports');


      var app = express();

      app.use(bodyParser.json());

      app.use(express.static('public'));

      app.param('picId', picMiddleware);

      processFiles()

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
          req.pic.confidenceLevel = confidenceLevel(req.pic.ups, req.pic.downs)

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

      app.listen(8080, function(err) {
          assert.equal(err, null);

          console.log('Listening on 8080');
      });
})


function getLowestVotedPic(cb) {
    collection.find({'confidenceLevel' : { $gt: -3}}).sort({'confidenceLevel': 1}).limit(100).toArray(function(err, array) {
        if(err != null){
            console.log(err);
        }
        if(array == undefined && array.length == 0) {
            cb("NOT FOUND");
            return;
        }
        var elem = array[parseInt(Math.random() * array.length)];
        cb(err, elem)
        console.log("serving with level " + elem.confidenceLevel + " and votes " + (elem.ups + elem.downs));
    });
}

function confidenceLevel(ups, downs) {
    if (ups == 0)
        return -downs

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

function processFiles() {

  console.log('checkung for imports')
  imports.find().limit(1).toArray(function(err, array){
    if(err != null || array.length == 0) {
      return
    }
    var batch = array[0]

    console.log('importing id "' + batch.id + '" from author ' + batch.author)
    /*
    id
    author
    */


    fs.readdir('import/' + batch.id, onDirRead);

    function onDirRead(err, files) {
        assert.equal(err, null);
        console.log('[import][' + batch.id + '] found ' + files.length + ' files')

        files.forEach(function(file) {
            var filename = path.basename(file)

            var hash = md5File.sync('import/' + batch.id + '/' + filename)

            collection.findOne({hash: hash}, function(err, result) {
              if(result == null) {

                console.log('[import][' + batch.id + '] adding ' + file)
                var authorDir = '/pics/' + batch.author
                var newFileName = authorDir + '/' + file


                if (!fs.existsSync('./public' + authorDir)){
                  fs.mkdirSync('./public' + authorDir);
                }

                fs.rename('./import/' + batch.id + '/' + filename, './public' + newFileName, function(err) {
                  assert.equal(err, null)
                  createNewPic(newFileName, hash)
                })
              }
            })
        });

        imports.deleteOne({_id:batch._id})

    }

  })
}



function createNewPic(filename, hash, cb) {
    var newPic = {
        _id: uuid(),
        filename: filename,
        hash: hash,
        ups: 0,
        downs: 0,
        confidenceLevel: confidenceLevel(0,0),
    };

    collection.insertOne(newPic, cb || function(){});
}


function save(pic, cb) {
    collection.save(pic, cb);
}
