"use strict";
var slackApiCaller = require('./slackApiCaller');
var webServer = require('./webServer');
var MongoClient = require('mongodb').MongoClient;
var ua = require('universal-analytics');
var isInProduction = process.env.NODE_ENV == 'production';

var main = {
	commandToResponderMapping: {},
	userTokensCollection: null,
	clientId: "[INSERT SLACK APP CLIENT ID HERE]",
	clientSecret: "[INSERT SLACK APP CLIENT SECRET HERE]",
	googleAnalyticsId: "[INSERT GOOGLE ANALYTICS ID HERE]",

	init: function() {
		if (isInProduction) {
			this.initMongo();
		}
		this.initCommandToResponderMapping();
		webServer.init(this.respondToSlackCommand.bind(this), this.authHandler.bind(this));
	},

	initMongo: function() {
		// default to a 'localhost' configuration:
		var connection_string = 'mongodb://127.0.0.1:27017';
		
		if(isInProduction){
			connection_string = process.env.MONGODB_URI;
		}

		// Connect to the db
		MongoClient.connect(connection_string, function(err, db) {			
		  	if(err) {
		  		console.log("Error connecting to DB: " + err);
		  		return;
		  	}

	    	console.log("MongoDB connected");

	    	db.collection('userTokens', function(err, collection) {
	    		this.userTokensCollection = collection;
	    	}.bind(this));
		}.bind(this));
	},

	saveAccessTokenDetails: function(body) {
		console.log("Saving access token details...");
		console.log(body);

		console.log("Removing old entries if exist...");
		this.userTokensCollection.remove({user_id: body.user_id, team_id: body.team_id}, function(err, result) {
			this.userTokensCollection.insert(body);
			console.log("New token details saved");
		}.bind(this));
	},

	authHandler: function(req, callback) {
		console.log(req.query);
		if (!req.query) {
			// Weird
			callback();
			return;
		};

		// todo: handle state parameter

		var code = req.query.code;

		slackApiCaller.callApi(
			"oauth.access", 
			{ 
				client_id: this.clientId,
				client_secret: this.clientSecret,
				code: code,
			}, function(error, response, body) {
				if (error) {					
					// Handle error
					console.log(error);
					callback(error);
					return;
				}

				var jsonBody = JSON.parse(body);

				if (!jsonBody.ok)
				{
					console.log(jsonBody.error);
					callback(jsonBody.error);
					return;
				}

				this.saveAccessTokenDetails(jsonBody);
				
				console.log("Auth Success");

				callback(null, "success");
			}.bind(this));
	},

	getToken: function(hook, callback) {
		if (isInProduction) {
			this.getTokenByHookOrNull(hook, callback);
		}
		else {
			callback(null, "[INSERT TESTING TOKEN HERE]");
		}		
	},

	getTokenByHookOrNull: function(hook, callback) {
		this.userTokensCollection.findOne({user_id: hook.user_id, team_id: hook.team_id}, function(err, item) {
			if (err) {
				callback(err);
				return;
			}

			var token = null;
			if (item) {
				// Verify mandatory scopes (other scopes checked when used)
				if (item.scope.includes("identify") && 
					item.scope.includes("commands") && 
					item.scope.includes("chat:write:user"))
				{
					token = item.access_token;
				}
				else
				{
					console.log("Missing scope");
				}					
			}

			callback(null, token);
		});
	},

	respondToSlackCommand: function(hook, callback) {
		var params = hook.text.split(" ");
		var actionString = params[0];

		var responseMakerFunc = this.getResponseMakerByActionString(actionString);
		
		responseMakerFunc(params, hook, callback);		
	},

	getResponseMakerByActionString: function(actionString) {
		var responseMakerFunc;

		if (!actionString) { actionString = "oops" }

		responseMakerFunc = this.commandToResponderMapping[actionString];

		if (!responseMakerFunc) {
			responseMakerFunc = function(params, hook, callback) { callback({ text: 'Unrecognized command' }); }
		}
		
		return responseMakerFunc.bind(this);
	},

	initCommandToResponderMapping: function() {
		this.commandToResponderMapping = {		
			"oops":		this.respondToCommand_oops,
			"/help": 	this.respondToCommand_help,
			"/?": 		this.respondToCommand_help,
			"--help": 	this.respondToCommand_help,
			"help": 	this.respondToCommand_help,
		};
	},

	respondToCommand_help: function(params, hook, callback) {
		this.sendGoogleAnalyticsForCommand("help", hook.team_id + "_" + hook.user_id);

		callback({ text: "Please visit <http://www.galgreen.com/oops/#faq|our FAQ> for more information" });
		return;
	},

	respondToCommand_oops: function(params, hook, callback) {
		this.sendGoogleAnalyticsForCommand("oops", hook.team_id + "_" + hook.user_id);

		console.log("responding to command oops...");		
		console.log("hook", hook);

		var needPermissionsCallback = function() {
			callback({ 
				text: "",
				attachments : [{
					text: "<https://slack.com/oauth/authorize?client_id="+this.clientId+"&scope=chat:write:user,commands,channels:history,im:history,groups:history&team="+hook.team_id+"|/oops needs your permission>",
					color: "warning",
				}],
			});
		};

		var errorCallback = function(error) {
			console.log("ERROR!");
			console.log(error);

			if (error == "token_revoked" ||
				error == "invalid_auth" ||
				error == "missing_scope") {
				needPermissionsCallback();
				return;
			}

			var responseMessage = {};
			responseMessage.text = "";

			if (error == "compliance_exports_prevent_deletion") {
				responseMessage.attachments = [{
					text: "/oops is unable to delete messages because your team has restricted that functionality (Compliance exports are on)",
					color: "warning",
				}];
			}
			else if (error == "cant_delete_message") {
				responseMessage.attachments = [{
					text: "/oops is unable to delete this message on your behalf because you don't have permission to delete it",
					color: "warning",
				}];
			}
			else {
				responseMessage.attachments = [{
					text: "Your message wasn't deleted because something went wrong with /oops, oh the irony...",
					color: "warning",
				}];
			}

			console.log("error response", responseMessage);

			callback(responseMessage);
		};		
		
		var cloneAndLogMessagesObfuscated = function(messages) {
			var obfuscateMessages = function(messages2) {
				var obfuscateText = function(text) {
					if (text.length > 4) {
						text = text.substr(0,2) + "..(length:" + text.length +").." + text.substr(text.length - 2, 2);
					}
					return text;
				};
				
				for (let message of messages2) {
					if (message.text) {
						//message.text = "[sanitized]"; 
						message.text = obfuscateText(message.text);
					}
					if (message.username) {
						message.username = "[sanitized]";
					}
					if (message.file) { 
						message.file = "[sanitized]"; 
					}
					if (message.attachments) {
						message.attachments = "[sanitized]";
					}
					if (message.comment) {
						message.comment = "[sanitized]";
					}
				}			
			};

			// obfuscating messages before writing them to the logs for privacy reasons
			if (isInProduction) {
				var clonedMessagesForLog = JSON.parse(JSON.stringify(messages));			
				obfuscateMessages(clonedMessagesForLog);
				console.log("obfuscated messages", clonedMessagesForLog);
			}
			else {
				console.log("messages", messages);
			}			
		};
		
		this.getToken(hook, function(error, token) {
			if (error) {
				errorCallback(error);
				return;
			}
			if (!token) {
				needPermissionsCallback();
				return;
			}
			
			this.getRecentChannelOrGroupOrDirectMessageHistory(token, hook, 
				function(error2, response, body) {			
					if (error2) {
						errorCallback(error2);
						return;
					}

					console.log("channels.history Slack call succeeded");
					//console.log("body", body);

					var res = JSON.parse(body);										

					if (!res.ok) {
						errorCallback(res.error);
						return;
					}

					console.log("channels.history result ok");

					var messages = res.messages;

					var theMessage = null;

					if (messages) {						
						cloneAndLogMessagesObfuscated(messages);

						var filteredMessages = messages.filter(function (value) { 
							return value.user == hook.user_id && value.subtype != "channel_join";
						});

						if (filteredMessages.length > 0) {
							theMessage = filteredMessages[0];						
						}						
					}

					if (theMessage) {
						slackApiCaller.callApi(
							"chat.delete", 
							{ 
								token: token,
								channel: hook.channel_id,
								ts: theMessage.ts,
							}, function(error3, response2, body2) {
								if (error3) {
									errorCallback(error3);
									return;
								}

								console.log("chat.delete Slack call succeeded");

								var res2 = JSON.parse(body2);
								if (!res2.ok) {									
									errorCallback(res2.error);
									return;
								}
								
								console.log("chat.delete result ok");
								
								var responseMessage = {};
								responseMessage.text = "Your text was: \"" + theMessage.text + "\"";
								
								if (theMessage.subtype == "file_share") {
									responseMessage.attachments = [{
										text: "Note: this does not delete <" + theMessage.file.permalink + "|the file itself>*",
										color: "warning",
									}];
								}

								console.log("Success");

								callback(responseMessage);
							});
					}
					else
					{
						console.log("No recent message found");

						callback({ text: "No recent message to oops" });
					}
				}
			);
		}.bind(this));
	},	

	getRecentChannelOrGroupOrDirectMessageHistory: function(token, hook, callback) {
		var fiveMinutesAgo = Date.now() / 1000 - (60 * 5) // 5 = 5 minutes

		if (hook.channel_name == "privategroup") {			
			slackApiCaller.callApi(
				"groups.history", 
				{
					token: token,
					channel: hook.channel_id,
					oldest: fiveMinutesAgo,
				}, callback);
		}
		else if (hook.channel_name == "directmessage") {
			slackApiCaller.callApi(
				"im.history", 
				{
					token: token,
					channel: hook.channel_id,
					oldest: fiveMinutesAgo,
				}, callback);
		}
		else {
			slackApiCaller.callApi(
				"channels.history", 
				{
					token: token,
					channel: hook.channel_id,
					oldest: fiveMinutesAgo,
				}, callback);
		}
	},

	sendGoogleAnalyticsForCommand: function(command, userId) {
		var visitor = ua(this.googleAnalyticsId, userId, {strictCidFormat: false});
		visitor.event("Slack Slash Command", command).send();
	},
};

main.init();