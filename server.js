var mongo = require('mongodb');
var express = require('express');
var bodyParser = require('body-parser');
var uuid = require('uuid').v2;

var fs = require('fs');
var assert = require('assert');
var path = require('path');

var app = express();

app.use(bodyParser.json());

app.use(express.static('public'));

function reindexFiles() {
    var ids = getAllIds();

    fs.readdir('public/pics', onDirRead);

    function onDirRead(err, files) {
        assertEquals(err, null);

        files.forEach(function(file) {
            var id = path.basename(file, '.jpg');

            if(ids.indexOf(id) == -1) {
                createNewPic(id);
            }
        });
    }
}

function getAllIds() {

}


function createNewPic(id) {

}
