var request = require('request');

var slackApiCaller = {
	callApi: function(actionString, params, callback) {
		request.post(
		    "https://slack.com/api/" + actionString,
		    { form: params },
		    callback);
	},
};

module.exports = {
	callApi: slackApiCaller.callApi.bind(slackApiCaller),
};