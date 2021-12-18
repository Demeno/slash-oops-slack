# /oops
![Logo](/site/siteLogo.png)

_Quickly undo silly mistakes with this tiny Slack app (discontinued)_

![Demo](/site/oopsDemo.gif)

## History
* Jan 2016 - Project started as an experiment to make a small Slack app.
* Oct 2017 - I migrated it from Red Hat OpenShift v2 to Heroku. (OpenShift v2 was shut down that month)
* Late 2020 - "/oops" was discontinued, because:
  * Slack made some changes to their API, [which required doing some big changes](https://api.slack.com/authentication/migration)
  * Around the same time, the add-on I was using for the database on Heroku was shutting down ([mLab MongoDB](https://devcenter.heroku.com/changelog-items/1823)).
* Oct 2021 - I was asked by a friendly & supportive user to let other people revive the project, so that's why I'm posting this old code now.

## Usage Notes
* Some parts of the code included IDs / keys that shouldn't be exposed, so I changed them to [INSERT X HERE].
* I'm also including the site's code & images here, as they were part of the installation / authentication process for users.
  * IndexAfterSunsetting.html is what's currently shown in http://www.galgreen.com/oops, it's not really necessary.

## Other Notes
* I wrote most of this code in 2016, it wasn't very clean then, and I wouldn't write such code today. Please don't judge me... :)
* I also designed the logo, I'm pretty proud of that :)
  * It was the top result in Google Images for the term "oops" for a while.