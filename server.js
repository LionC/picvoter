var mongo = require('mongodb');
var express = require('express');
var bodyParser = require('body-parser');
var uuid = require('uuid').v4;

var fs = require('fs');
var assert = require('assert');
var path = require('path');

var db = require('./db');

var collection = null;

db.connect(function(err) {
    assert.equal(err, null);

    collection = db.collection('pics');

    reindexFiles();

    setInterval(reindexFiles, 5 * 60 * 1000);

    var app = express();

    app.use(bodyParser.json());

    app.use(express.static('public'));

    app.param('picId', picMiddleware);

    app.post('/:picId/votes', function(req, res) {
        req.pic.rating += req.body.value;
        req.pic.votes++;

        save(req.pic, function(err) {
            assert.equal(err, null);

            res.status(201).send();
        });
    });

    app.get('/newpic', function(req, res) {
        getLowestVotedPic(function(err, pic) {
            assert.equal(err, null);

            res.status(200).json(pic);
        });
    })

    app.listen(8080, function(err) {
        assert.equal(err, null);

        console.log('Listening on 8080');
    });
})

function reindexFiles() {
    getAllKnownFiles(function(err, knownFiles) {
        assert.equal(err, null);

        fs.readdir('public/pics', onDirRead);

        function onDirRead(err, files) {
            assert.equal(err, null);

            files.forEach(function(file) {
                var filename = path.basename(file);

                if(knownFiles.indexOf(filename) == -1) {
                    createNewPic(filename, function(err) {
                        assert.equal(err, null);

                        console.log('Found new pic: ' + filename);
                    });
                }
            });
        }
    });
}

function getAllKnownFiles(cb) {
    collection.find().toArray(function(err, pics) {
        assert.equal(err, null);

        cb(null, pics.map(function(pic) {
            return pic.filename;
        }));
    });
}


function createNewPic(filename, cb) {
    var newPic = {
        _id: uuid(),
        filename: filename,
        rating: 0,
        votes: 0
    };

    collection.insertOne(newPic, cb || function(){});
}

function save(pic, cb) {
    collection.save(pic, cb);
}

function getLowestVotedPic(cb) {
    collection.find().sort('votes', 1).limit(100).toArray(function(err, array) {
        if(array == undefined) {
            cb("NOT FOUND");
        }
        cb(err, array[parseInt(Math.random() * array.length)])
    });
}

function picMiddleware(req, res, next, picId) {
    collection.findOne({_id: picId}, function(err, pic) {
        assert.equal(err, null);

        req.pic = pic;

        next();
    });
}
