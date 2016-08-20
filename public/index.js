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
            self.getPicUrlForPic = getPicUrlForPic;

            var picBuffer = [];

            self.voting = false;

            var timeout;

            init();
            function init() {
                loadNewPicture();
            }

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
                return SERVER_URL + "/pics/" + picBuffer[0].filename;
            }

            function getPicUrlForPic(pic) {
                    return SERVER_URL + "/pics/" + pic.filename;
            }


            function changePicture() {
                picBuffer.splice(0,1);
                loadNewPicture();
            }

            var loading = false;
            function loadNewPicture() {
                if(loading) {
                    return;
                }
                var loadPic = function() {
                    loading = true;
                    $http.get(SERVER_URL + "/newpic").then(function(response) {
                        picBuffer.push(nextPic);
                        if(picBuffer.length <= 5) {
                            loadPic();
                        } else {
                            loading = false;
                        }
                    }).catch(function(err) {
                        loading = false;
                        console.log("error")
                        console.dir(err)
                    })
                }
                resetTimeout();
            }

            function upVote() {
                if(self.voting) {
                    return;
                }

                self.voting = true;
                $http.post(SERVER_URL + "/" + picBuffer[0]._id + "/votes" , {"type": "UP"}).then(function() {
                    self.voting = false;
                })
                changePicture()
            }


            function downVote() {
                if(self.voting) {
                    return;
                }

                self.voting = true;
                $http.post(SERVER_URL + "/" + picBuffer[0]._id + "/votes", {"type": "DOWN"}).then(function() {
                        self.voting = false;
                })
                changePicture()
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
