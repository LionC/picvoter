'use strict';

var SERVER_URL = ""
var NEW_PICTURE = 10 * 1000;


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
                var timeout = $timeout(loadNewPicture,NEW_PICTURE);
            }

            function getPicUrl() {
                return SERVER_URL + "/pics/" + pic.fileName;
            }

            function loadNewPicture() {
                $http.get(SERVER_URL + "/newpic").then(function(data) {
                    pic = data.response;
                })
                resetTimeout()
            }

            function upVote() {
                $http.post(SERVER_URL + "/" + pic.id + "/votes" , {"type": "UP"}).then(function() {
                    loadNewPicture();
                })
            }


            function downVote() {

                    $http.post(SERVER_URL + "/" + pic.id + "/votes", {"type": "DOWN"}).then(function() {
                    loadNewPicture();
                })
            }


        }]);
})();
