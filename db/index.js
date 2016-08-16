var DB_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/picvoter';

var mongo = require('mongodb');

var mongoClient = mongo.MongoClient;
var db = null;

function connect(cb) {
    mongoClient.connect(DB_URL, function(err, dbResult) {
        db = dbResult;

        cb(err);
    });
}

exports.connect = connect;

exports.collection = function collection(name) {
    return db.collection(name);
};

exports.id = function(id) {
    return new mongo.ObjectId(id);
}
