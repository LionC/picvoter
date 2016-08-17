'use strict';

var SERVER_URL = "localhost:8080"
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

            var picId;

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
                return "./test.jpg"
                return SERVER_URL + "/pics/" + picId  + ".jpg";
            }

            function loadNewPicture() {
                $http.get(SERVER_URL + "/pic").then(function(data) {
                    picId = data.response.id;
                })
                resetTimeout()
            }

            function upVote() {
                $http.post(SERVER_URL + "/votes/" + picId, {"type": "UP"}).then(function() {
                    loadNewPicture();
                })
            }


            function downVote() {
                $http.post(SERVER_URL + "/votes/" + picId, {"type": "DOWN"}).then(function() {
                    loadNewPicture();
                })
            }


        }]);
})();
