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

    app.get('/hotpics', function(req, res) {
        getBestPictures(function(err, pics) {
            res.status(200).json(pics);
        })
    })

    app.get('/stats', function(req, res) {
        getAllVotes(function(votes) {
            getHighestRating(function(highestRating) {
                getAverageRating(function(averageRating) {
                    res.status(200).json({
                        'allVotes': votes,
                        'rating': {
                            'highest': highestRating,
                            'average': averageRating
                        }
                    })
                })
            })
        })
    })

    app.post('/:picId/votes', function(req, res) {
        if(isNaN(req.pic.rating)) {
            req.pic.votes = 0;
            req.pic.rating = 0;
        }
        if(req.body.type == "UP") {
            req.pic.rating++;
        } else {
            req.pic.rating--;
        }
        req.pic.votes++;

        save(req.pic, function(err) {
            assert.equal(err, null);

            res.status(201).send();
        });
    });

    app.get('/newpic', function(req, res) {
        getLowestVotedPic(function(err, pic) {
            if(err == "NOT FOUND") {
                res.status(404).send();
                return;
            }

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


function getAllVotes(cb) {
    collection.find().toArray(function (err, array) {
        cb(array.map(function(pic) {
            return pic.votes;
        }).reduce(function(a, b) {
            return a + b;
        }));
    })
}

function getHighestRating(cb) {
    collection.find().sort({'rating:': -1}).limit(1).nextObject(function(err, pic) {
        cb(pic.rating);
    });
}

function getAverageRating(cb) {
    collection.find().toArray(function(err, array) {
        cb(array.map(function(pic) {
            if(isNaN(pic.rating)) {
                console.log("NaN")
                return 0;
            }
            return pic.rating;
        }).reduce(function(a,b) {
            return a + b;
        }) / array.length);
    });
}

function save(pic, cb) {
    collection.save(pic, cb);
}

function getBestPictures(cb) {
    collection.find().sort({'rating': -1}).limit(100).toArray(function(err, array) {
        cb(err, array);
    })
}

function getLowestVotedPic(cb) {
    collection.find({'rating' : { $gt: -3}}).sort({'votes': 1}).limit(100).toArray(function(err, array) {
        if(err != null){
            console.log(err);
        }
        if(array == undefined) {
            cb("NOT FOUND");
            return;
        }
        var elem = array[parseInt(Math.random() * array.length)];
        cb(err, elem)
        console.log("serving with rate " + elem.rating + " and votes " + elem.votes);
    });
}

function picMiddleware(req, res, next, picId) {
    collection.findOne({_id: picId}, function(err, pic) {
        assert.equal(err, null);

        req.pic = pic;

        next();
    });
}
