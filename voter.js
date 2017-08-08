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
const drivelist = require('drivelist')
const usbdetect = require('usb-detection')

const moment = require('moment')

const externalDrive = '/media/pi/MULTIBOOT'
const externalFolder = '/hsaka-pics'

//const externalDrive = '.'
//const externalFolder = '/public'

const externalPath = externalDrive + externalFolder

cron.schedule('0 0 2 * * *', startAllPendingImports)

db.connect(function(err) {
    assert.equal(err, null);

    collection = db.collection('pics');

    imports = db.collection('imports');

    collection.ensureIndex({sorting: -1})
    collection.ensureIndex({confidenceLevel: 1})

    var app = express();

    app.use(cors())

    app.use(bodyParser.json())

    app.use(express.static('public'))
    app.use(express.static(`${externalDrive}${externalFolder}`))

    app.param('picId', picMiddleware);

    //processFiles()

    setUpUsbScanning(imports)

    app.get('/newpic', function(req, res) {
        getLowestVotedPic(function(err, pic) {
            if(err == "NOT FOUND") {
                res.status(404).send();
                return;
            }

            res.status(200).json(pic);
        });
    })

    app.get('/pics/actions/recalc', function (res, req) {

        console.log("recalculating sorting!")
        collection
            .find()
            .toArray()
            .then(pics => {
                return Promise.all(
                        pics.map(pic => {
                            pic = fillPicWithSortings(pic)
                            return collection
                                .save(pic)
                        })
                )
                .then(array => {
                    console.log("done recalculating!")
                    req.status(200).send()
                })
            })
            .catch(err => {
                console.log("error while recalculating")
                console.dir(err)
                req.status(500).json(err)
            })
    })

    app.post('/:picId/votes', function(req, res) {
        if(isNaN(req.pic.ups)) {
            req.pic.ups = 0;
            req.pic.downs = 0;
        }

        console.log('voted ' + req.body.type + ' on ' + req.pic._id)

        if(req.body.type == "UP") {
            req.pic.ups++;
        } else {
            req.pic.downs++;
        }

        req.pic = fillPicWithSortings(req.pic)

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

            console.dir(array)
            if(err != null){
                console.error(err);
            }
            if(array == undefined && array.length == 0) {
                res.status(200).json([])
                return;
            }
            res.status(200).json(array)
        })
    })

    app.get('/stats', function (req, res) {
        getStats()
            .then(function (stats) {
                res.status(200).json(stats)
            })
    })

    app.listen(80, function(err) {
        assert.equal(err, null);

        console.log('Listening on 80');
    });
})

function fillPicWithSortings(pic) {
    var votes = pic.ups + pic.downs

    pic.sorting = confidenceLevel(pic.ups, pic.downs)
    pic.confidenceLevel = Math.abs(0.5 - confidenceLevel(pic.ups, pic.downs)) * (votes / 10)
    return pic
}

function randomWithBias(max) {
    const n = 4
    var unif = Math.random()

    const oneOver2N = 1 / Math.pow(2, n)
    const oneOverXPlus1N = 1 / Math.pow(unif + 1, n)

    var random = (oneOverXPlus1N - oneOver2N) / (1 - oneOver2N)
    return parseInt(random * max)
    // var beta = 1 - Math.pow(Math.sin(unif * Math.PI / 2), 2)
    // return parseInt(Math.abs(beta * max))
}

function getStats() {
    return collection
        .aggregate([
            {
                $group: {
                    _id: null,
                    ups: { $sum: "$ups" },
                    downs: { $sum: "$downs" },
                    pictures: {$sum: 1},
                }
            }
        ])
        .toArray()
        .then((stats) =>
            imports
                .aggregate([
                        {
                            $group: {
                                _id: "$author"
                            }
                        }
                    ]
                )
                .toArray()
                .then((authors) => {
                    return {
                            authors: authors,
                            stats: stats[0]
                        }
                })
        )
        .then(ret => {
            return ret.authors.reduce(
                    (promise, author) =>
                    promise
                        .then(ret =>
                            collection
                                .count({ filename: new RegExp(author._id, 'i')})
                                .then(count => {
                                    ret[author._id] = count
                                    return ret
                                })
                        )
                ,
                Promise.resolve({})
            )
            .then(authors => {
                var all ={
                    authors: authors,
                    stats: ret.stats
                }
                all.stats.votes = all.stats.ups + all.stats.downs
                return all
            })
        })
        .catch(err => console.error(err))
}


function getLowestVotedPic(cb) {

    collection
        .count()
        .then(length => {

            var random = randomWithBias(length - 1)
            if(random > length) {
                random = length - 1
            }

            collection
                .find({'sorting' : { $gt: -3}})
                .sort({'confidenceLevel': 1})
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
					if (elem && elem.confidenceLevel !== undefined && elem.ups !== undefined && elem.downs !== undefined) {
						cb(err, elem)
						console.log("serving " + random + "s picture with level " + elem.confidenceLevel + " and votes " + (elem.ups + elem.downs));
					} else {
					    console.error("invalid picture! ")
                        console.error(elem)
					}
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
    collection.find().sort({'sorting': -1}).limit(1000).toArray(function(err, array) {
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

    var currentImportPath = `${externalPath}/import/` + batch.id

    return fs
        .readdir(currentImportPath)
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

                    rimraf.sync(currentImportPath, {},  err => {})

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

    var currentImportPath = `${externalPath}/import/` + batch.id + '/' + filename
    var hash = md5File.sync(currentImportPath)

    return collection
        .findOne({hash: hash})
        .then(function(result) {
            if(!result) {
                return scaleAndCopyPicture(batch, filename, file, hash)
            } else {
                console.log('skipping, because of dublicate')
            }
        })
        .catch(err => {
            console.error(err)
        })
}

function scaleAndCopyPicture(batch, filename, file,  hash) {
    var authorDir = '/' + batch.author
    var newFileName = authorDir + '/' + file

    var currentImportPath = `${externalPath}/import/` + batch.id + '/' + filename
    var publicPath = `${externalPath}/pics`

    if (!fs.existsSync(publicPath + '/small' + authorDir)){
        fs.mkdirSync(publicPath + '/small' + authorDir);
    }

    if (!fs.existsSync(publicPath + '/orig' + authorDir)){
        fs.mkdirSync(publicPath + '/orig' + authorDir);
    }


    return sharp(currentImportPath)
    .resize(1920, 1200)
    .max()
    .toFormat('jpeg')
    .toFile(`${externalDrive}${externalFolder}/pics/small` + newFileName)
    .then(function() {
        console.log('[import][' + batch.id + '] adding ' + file)
        return fs
        .rename(currentImportPath, `${externalDrive}${externalFolder}/pics/orig` + newFileName)
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


function setUpUsbScanning(imports) {

    console.log('now scanning')

    usbdetect.on('add', function(device) {
        console.log('device added')
        setTimeout(function() {
            console.log('scanning device')
            drivelist.list((error, drives) => {
                if (error) throw error
                scanDrives(drives)
            })
        }, 2000)
    })

    function scanDrives(drives) {
        drives.forEach(function(drive) {
            if (drive.mountpoints.length == 0) return

            drive.mountpoints.forEach((point) => {
                console.log(`checking device ${point.path}`)
                // not a media device
                if (point.path.indexOf('media') == -1) {
                    console.log('not a media device')
                    return
                }
                // is external drive
                if (point.path.indexOf(externalDrive) != -1) {
                    console.log('was pic drive')
                    return
                }

                console.log('scanning dir: ' + point.path)
                fs.readdir(point.path, function(err, files) {
                    if (files.length == 0) {
                        console.log('no files')
                        return
                    }

                    files.forEach((file) => {
                        checkFile(file, point.path)
                    })
                })
            })

        })
    }

    function checkFile(file, path) {
        if (file.indexOf('bilder-hsaka-2017-') == -1)
            return

        var dirParts = file.split('-')
        let fullPath = `${path}/${file}`
        let author = dirParts[dirParts.length - 1]
        console.log('found image dir by ' + author + ' in ' + fullPath)
        let folderName = moment().format('x')
        let fullName = `${externalDrive}${externalFolder}/import/${author}-${folderName}`
        fs.copy(fullPath, fullName)
            .then(() => {
                console.log(`copied images of ${author}`)
                return imports.insertOne({
                    id: `${author}-${folderName}`,
                    author: author
                })
            })
        .catch((err) => {
            console.error(err)
        })
    }
}
