const env          = process.env;
var isInProduction = process.env.NODE_ENV == 'production';
var Slack = require('node-slack');
var express = require('express');
var bodyParser = require('body-parser');
if (!isInProduction) {
	var ngrok = require('ngrok');
}
var multer = require('multer'); // v1.0.5

var app = express();

var webServer = {
	server: null,

	init: function (slackCommandResponder, authHandler) {
		this.initServer();
		this.registerToRequests(slackCommandResponder, authHandler);
		this.startServer();
		
		if (!isInProduction) {
			this.startNgrok();
		}
	},

	initServer: function() {
		app.set('port', (process.env.PORT || 5000));
		app.use(bodyParser.json());
		app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
	},

	startServer: function() {
		this.server = app.listen(app.get('port'), function () {
		    console.log('Node app is running on port', app.get('port'));
		}.bind(this));
	},

	registerToRequests: function(slackCommandResponder, authHandler) {
		var upload = multer(); // for parsing multipart/form-data
		var slack = new Slack();

		// Listen for post messages
		app.post('/', upload.array(), function (req, res, next) {
		    console.log("request received");
		    if (isInProduction) {
			    if (req.body && req.body.user_name) {
				    req.body.user_name = "[sanitized]";
					req.body.team_domain = "[sanitized]";
					if (req.body.channel_name != "directmessage" && 
						req.body.channel_name != "privategroup") {
						req.body.channel_name = "[sanitized]";
					}
				}
				console.log("request sanitized");
			}
		    console.log(req.body);

		    if (req.body.ssl_check == "1")
		    {
		    	console.log("ssl check");
		    	res.sendStatus(200);
		    	return;
		    }
		    
		    slack.respond(req.body, function (hook) {
		    	if (hook.token == "[INSERT HOOK TOKEN HERE]") {
			    	slackCommandResponder(hook, function(result) {
			    		res.json(result);
			    	});
		    	}
		    	else {
		    		res.sendStatus(403);
		    	}
		    });
		});

		// Listen for get messages
		app.get('/', function(req, res){
		    res.send('/Oops is up and running');
		});

		app.get('/auth', function(req, res) {
			authHandler(req, function(err, result) {
				if (err) {
					console.log("OAuth failed");
					res.redirect('http://www.galgreen.com/oops/');
					return;
				}
				console.log("OAuth succeeded :)");
				res.redirect('http://www.galgreen.com/oops/success.html');
			});
		});

		app.get('/health', function(req, res){
			res.sendStatus(200);
		});

		console.log("requests registered");
	},

	startNgrok: function() {
		ngrok.connect(3000, function (err, url) {
		    if (!err) {
		    	// use this url in the slash command configurations
		        console.log("ngrok url: " + url);
		    }
		    else {
		        console.log("ngrok error: " + err);
		    }
		});
	},
};

module.exports = {
	init: webServer.init.bind(webServer),
};