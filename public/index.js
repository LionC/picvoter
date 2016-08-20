'use strict';

var SERVER_URL = ""
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
            self.getNextPicUrl = getNextPicUrl;

            var pic;
            var nextPic;

            self.voting = false;

            var timeout;

            loadNewPicture();
            $timeout(loadNewPicture, 100);

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

            function getNextPicUrl() {

                    return SERVER_URL + "/pics/" + nextPic.filename;
            }
            function loadNewPicture() {
                pic = nextPic;
                nextPic = undefined;
                $http.get(SERVER_URL + "/newpic").then(function(response) {
                    nextPic = response.data;
                }).catch(function(err) {
                    console.log("error")
                    console.dir(err)
                })
                resetTimeout()
            }

            function upVote() {
                if(self.voting) {
                    return;
                }

                self.voting = true;
                $http.post(SERVER_URL + "/" + pic._id + "/votes" , {"type": "UP"}).then(function() {
                    self.voting = false;
                })
                loadNewPicture();
            }


            function downVote() {
                if(self.voting) {
                    return;
                }

                voting = true;
                $http.post(SERVER_URL + "/" + pic._id + "/votes", {"type": "DOWN"}).then(function() {
                        self.voting = false;
                })
                loadNewPicture();
            }


        }]);

    app.controller("BestController", [
        '$http',
        '$interval',
        function($http, $interval) {
            var self = this;

            self.pics = [];

            self.getUrl = getUrl;

            $interval(getBestPics, 5 * 60 * 1000);
            getBestPics();

            function getBestPics() {
                $http.get(SERVER_URL + "/hotpics").then(function(response) {
                    self.pics = response.data;
                })
            }

            function getUrl(pics) {
                return SERVER_URL + "/pics/" + pic.filename;
            }
        }
    ])
})();
