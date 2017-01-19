var crypto = require('crypto');

module.exports = function (server) {
  
  const encode = function(pwd) {
    var hash = crypto.createHash('sha256').update(pwd).digest('hex');
    return hash;
  };
  
  const login = function (request, reply) {

    if (request.auth.isAuthenticated) {
		      return reply.continue();
    } 
  
    var message;
    var username;
    var password;
    var checked = false;
    var processing = true;

    var loginForm = function(reply){
      return reply('<!DOCTYPE html><html><head><title>Login Required</title>'
          + '<link rel="stylesheet" href="/bundles/commons.style.css">'
          + '<link rel="stylesheet" href="/bundles/kibana.style.css">'
          + '</head><body style="background: #222222;">'
          + '<center><div class="container" style="width: 20%;margin-left: auto;margin-right:auto;margin-top: 10%;">'
          + (message ? '<h3 style="color:white;">' + message + '</h3><br/>' : '')
          + '<form id="login-form" class="ng-valid ng-dirty ng-valid-parse" method="get" action="/login">'
          + '<div class="form-group inner-addon left-addon">'
          + '  <input type="text" style="margin-bottom:8px;font-size: 1.25em;height: auto;" name="username" placeholder="Username" class="form-control ng-valid ng-touched ng-dirty">'
          + '  <input type="password" style="font-size: 1.25em;height: auto;" name="password" placeholder="Password" class="form-control ng-valid ng-touched ng-dirty">'
          + '</div><div style="width:200px;margin-left:auto;margin-right:auto;">'
          + '<input type="submit" value="Login" class="btn btn-default login" style="width: 80%;font-size: 1.5em;background-color: #94c63d;">'
          + '</div></form></div></center></body></html>');
    }

    if (request.method === 'post') {
      username = request.payload.username;
      password = request.payload.password;
    } else if (request.method === 'get') {
      username = request.query.username;
      password = request.query.password;
    }

    if (!username && !password) { processing = false; }
    if (username || password){
      var encPass = encode(password);
      var client = server.plugins.elasticsearch.client;
      var callWithRequest = server.plugins.elasticsearch.callWithRequest;
      //callWithRequest(request, 'search', {
      client.search({
          index:".http_user_auth",
          allowNoIndices: false,
          body: {
          "size": 1,
             "query": {
                "match": {
                  "username": username
                 }
               }
              }
       })
       .then(
          function (res) {
            if (res.hits.hits[0] && res.hits.hits[0]._source.password == encPass) {
		    var checked = true;
		    var uuid = 1;
		    const sid = String(++uuid);
		    request.server.app.cache.set(sid, { username: username }, 0, (err) => {

		      if (err) {
		        reply(err);
		      }

		      request.auth.session.set({ sid: sid });
		      // var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
		      return reply.redirect("/");

		    });

            } else { 
                message = 'Invalid username or password';
        	loginForm(reply);
            }
          },
          function (error) {
            var checked = false;
            message = 'Invalid username or password';
	    loginForm(reply);
          }
       );
      
    } else if (request.method === 'post') {
	var processing = false;
        message = 'Missing username or password';
    }

    if (!checked && !processing) {
	loginForm(reply);
    }
  };

  const logout = function (request, reply) {
    request.auth.session.clear();
    return reply.redirect('/');
  };

  server.register(require('hapi-auth-cookie'), (err) => {

    if (err) {
      throw err;
    }

    const cache = server.cache({ segment: 'sessions', expiresIn: 3 * 24 * 60 * 60 * 1000 });
    server.app.cache = cache;

    server.auth.strategy('session', 'cookie', true, {
      password: 'secret',
      cookie: 'sid',
      redirectTo: '/login',
      isSecure: false,
      validateFunc: function (request, session, callback) {

        cache.get(session.sid, (err, cached) => {

          if (err) {
            return callback(err, false);
          }

          if (!cached) {
            return callback(null, false);
          }

          return callback(null, true, cached.username);
        });
      }
    });

    server.route([
      {
        method: ['GET', 'POST'],
        path: '/login',
        config: {
          handler: login,
          auth: { mode: 'try' },
          plugins: { 'hapi-auth-cookie': { redirectTo: false } }
        }
      },
      { method: 'GET', path: '/logout', config: { handler: logout } }
    ]);

  });
};
