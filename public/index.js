'use strict';

var SERVER_URL = "http://localhost:8080"
var NEW_PICTURE = 30 * 1000;


(function(){
    var app = angular.module("picvoter", []);

    app.controller("PicController", [
        '$http',
        '$timeout',
        function($http, $timeout) {
            var self = this;

            self.getPicUrl = getPicUrl;
            self.upVote = upVote;
            self.downVote = downVote;
            self.keyDown = keyDown;

            var pic;

            var timeout;

            loadNewPicture();

            var upKeys = "uiopü+jklöä#nm,.-"
            var downKeys = 'qwertasdfgyxcv'

            function keyDown(event) {
                if(upKeys.indexOf(event.key.toLowerCase()) != -1) {
                    upVote();
                }

                if(downKeys.indexOf(event.key.toLowerCase()) != -1) {
                    downVote();
                }
            }

            function resetTimeout() {
                $timeout.cancel(timeout);
                timeout = $timeout(loadNewPicture, NEW_PICTURE);
            }

            function getPicUrl() {
                return SERVER_URL + "/pics/" + pic.filename;
            }

            function loadNewPicture() {
                $http.get(SERVER_URL + "/newpic").then(function(response) {
                    pic = response.data;
                }).catch(function(err) {
                    console.log("error")
                    console.dir(err)
                })
                resetTimeout()
            }

            function upVote() {
                $http.post(SERVER_URL + "/" + pic._id + "/votes" , {"type": "UP"}).then(function() {
                    loadNewPicture();
                })
            }


            function downVote() {

                    $http.post(SERVER_URL + "/" + pic._id + "/votes", {"type": "DOWN"}).then(function() {
                    loadNewPicture();
                })
            }


        }]);
})();
