var cloudStashUxServer = require('./lib/server');
var cloudStashUxConfig = require('./lib/config');
var pkg = require('./package.json');

// Process command line params
//
var commander = require('commander');
commander.version(pkg.version);
commander.option('-p, --port <n>', 'The port on which the CloudStash server will listen', parseInt);
commander.option('-c, --config <value>', 'Use the specified configuration file');
commander.parse(process.argv);

var overrides = {};

if (commander.port)
{
    overrides.PORT = commander.port;
}

var config = cloudStashUxConfig.getConfig(commander.config, overrides);

var loggerModule = require('./lib/logger');
loggerModule.createMainLogger(config);

var log = loggerModule.getLogger("app");

log.info("CloudStash server v%s loading - %s", pkg.version, config.configDetails);

var server = cloudStashUxServer(config);

server.listen(config.get('PORT'), function () 
{
    log.info('CloudStashUX listening on port:', this.address().port);
});

process.on('SIGTERM', function ()
{
    log.info('SIGTERM - preparing to exit.');
    process.exit();
});

process.on('SIGINT', function ()
{
    log.info('SIGINT - preparing to exit.');
    process.exit();
});

process.on('exit', function (code)
{
    log.info('Process exiting with code:', code);
});