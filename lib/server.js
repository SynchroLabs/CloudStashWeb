var express = require('express');
var exphbs  = require('express-handlebars');
var cookieParser = require('cookie-parser');
var request = require('request');
var path = require('path');

// !!! To make the Dropbox API work with a different domain, we need to replace the getBaseUrl function
//     in ../node_modules/dropbox/src/get-base-url
//
var Dropbox = require('dropbox');

// Config needs to contain CLIENT_ID, CLIENT_SECRET, and REDIRECT_URL.  It may also contain OAUTH_BASE to auth to 
// service other than Dropbox.
//
module.exports = function(config)
{
    var log = require('./../lib/logger').getLogger("server");

    log.info("Dropbox:", Dropbox);

    var server = express();

    server.use(cookieParser("cookie_secret_420"));

    server.engine('handlebars', exphbs({defaultLayout: 'main'}));
    server.set('view engine', 'handlebars');

    server.get('/auth', function(req, res)
    {
        log.info("Auth callback from OAuth:", req.query);

        var form =
        {
            code: req.query.code,                       // required The code acquired by directing users to /oauth2/authorize?response_type=code.
            grant_type: "authorization_code",           // required The grant type, which must be authorization_code.
            client_id: config.get('CLIENT_ID'),         // If credentials are passed in POST parameters, this parameter should be present and should be the app's key (found in the App Console).
            client_secret: config.get('CLIENT_SECRET'), // If credentials are passed in POST parameters, this parameter should be present and should be the app's secret.
            redirect_uri: config.get('REDIRECT_URL')    // Only used to validate that it matches the original /oauth2/authorize, not used to redirect again.
        }

        request.post({ url: config.get('OAUTH_BASE') + "token", form: form }, function (e, r, body)
        {
            if (e || r.statusCode !== 200)
            {
                log.error("Error getting token from code:", e, r.statusCode);
                res.status(500).send('Error getting token from code');
            }
            else
            {
                var tokenResponse = JSON.parse(body);

                // The token response body should look like this:
                //
                // { 
                //     access_token: '<bunch of hex>',
                //     token_type: 'bearer',
                //     uid: '99999999',
                //     account_id: 'dbid:<bunch of hex with dashes>' 
                // }

                log.info("Got token response:", tokenResponse);

                res.cookie("dbx_access_token", tokenResponse.access_token, { signed: true });
                res.redirect('/');
            }
        });
    });

    server.get('/logout', function(req, res)
    {
        log.info("Clearing access token cookie");
        res.clearCookie("dbx_access_token", { signed: true });
        res.redirect('/');
    });

    server.use('/public', express.static('public'))

    server.get('/download', function (req, res) 
    {
        if (req.signedCookies && req.signedCookies.dbx_access_token)
        {
            var filepath = decodeURI(req.query.file);

            log.info("Download path:", filepath)

            var dbx = new Dropbox({ accessToken: req.signedCookies.dbx_access_token });
            dbx.filesDownload({path: filepath})
              .then(function(response) {
                res.writeHead(200, {
                  'Content-Type': 'application/octet-stream',
                  'Content-Disposition': 'attachment; filename=' + path.basename(filepath),
                  'Content-Length': response.size
                });
                res.end(response.fileBinary, 'binary');
              })
              .catch(function(error) {
                log.error(error);
              });
        }
        else
        {
            log.error("No access token");
        }
    });

    server.get('/*', function (req, res) 
    {
        if (req.signedCookies && req.signedCookies.dbx_access_token)
        {
            var dirpath = decodeURI(req.url) || '/';

            log.info("Path:", dirpath)

            var pathElements = dirpath.split('/');
            pathElements[0] = { name: "Home", link: "/" };
            if ((pathElements.length > 1) && (pathElements[pathElements.length-1] === ''))
            {
                pathElements.pop();
            }
            if (pathElements.length > 1)
            {
                var currPath = "";
                for (var i = 1; i < pathElements.length; i++) 
                {
                    currPath += "/" + pathElements[i]
                    pathElements[i] = { name: pathElements[i], link: currPath };
                }
            }
            delete pathElements[pathElements.length-1].link;

            log.info("Path elements:", pathElements);

            if (dirpath === '/')
            {
                dirpath = '';
            }

            log.info("Access token present, doing Dropbox stuff");
            var dbx = new Dropbox({ accessToken: req.signedCookies.dbx_access_token });
            dbx.filesListFolder({path: dirpath})
              .then(function(response) {
                response.entries.forEach(function(entry)
                {
                    if (entry['.tag'] === 'folder')
                    {
                        entry.folder = true;
                    }
                })
                res.render('home', { path: dirpath, pathElements: pathElements, entries: response.entries } );
              })
              .catch(function(error) {
                log.error(error);
              });
        }
        else
        {
            log.info("No access token, redirecting to login");

            // The Dropbox JS SDK doesn't support OAuth "code flow" directly, so we just build the auth endpoint URI the hard way...
            //
            var authUrl = config.get('OAUTH_BASE') + "authorize?response_type=code&client_id=" + config.get('CLIENT_ID') + "&redirect_uri=" + config.get('REDIRECT_URL');
            log.info("Auth url:", authUrl);
            res.redirect(authUrl);
        }
    });

    return server;
}