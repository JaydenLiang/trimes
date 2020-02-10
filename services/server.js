'use strict';

const FS = require('fs');
const PATH = require('path');
const COMMANDER = require('commander');
const CHALK = require('chalk');
const FASTIFY = require('fastify');
const PPTCORE = require('puppeteer');
const GERRIT = require('./gerrit');
const HTTP_STATUS = require('http-status-codes');

const EXIT_CODE_ERROR = 1;

let browser;

const instantiateBrowser = async () => {
    if (!browser) {
        browser = await PPTCORE.launch({ headless: true });
    }
}

const instantiateGerrit = async (gerritEndpoint) => {
    return new GERRIT(browser, gerritEndpoint);
}

const start = async (options) => {
    return new Promise(async (resolve, reject)=>{
        const server = FASTIFY({ logger: true });
        const gerritEndpoint = options.gerritEndpoint;
        let pageGerrit;
        let gerrit;
        let result;
        server.get('/', (req, res)=>{
            console.log(req);
        });

        server.post('/gerrit/auth', async (req, res) => {
            if(!req.headers.username || !req.headers.password) {
                res.code(HTTP_STATUS.UNAUTHORIZED);
                return '';
            }
            await instantiateBrowser();

            gerrit = gerrit || await instantiateGerrit(gerritEndpoint);

            result = await gerrit.login(req.headers.username, req.headers.password);

            res.code(HTTP_STATUS.OK);
            return '';
        });

        server.get('/gerrit/change/:id', async (req, res)=>{
            gerrit = gerrit || instantiateGerrit(gerritEndpoint);
            let content = await gerrit.getChangeById(req.params.id);
            res.code(HTTP_STATUS.OK);
            return content;
        });

        // auto login using credential
        if(options.loginGerrit) {
            console.info(`Auto logging in to ${CHALK.cyan('Gerrit')}...`);
            const [username, password] =
                FS.readFileSync(PATH.resolve(process.cwd(), options.loginGerrit))
                    .toString().split('\n').map(line=>line.trim());

            await instantiateBrowser();

            gerrit = gerrit || await instantiateGerrit(gerritEndpoint);

            if(await gerrit.login(username, password)) {
                console.info(CHALK.cyan('done'));
            }
        }

        server.listen(options.port, (err, address)=>{
            if(err) {
                throw err;
            }
            console.info(`server is listening at ${CHALK.cyan(address)}...`);
        });
    });
}

const run = async (options) => {
    const availOptions = ['start'];
    const validOptions = availOptions.filter(o=>options[o]);
    if(validOptions.length === 0) {
        console.warn(CHALK.yellow('Oops! Unknown argument. Please run with --help for more information.'));
        process.exit(EXIT_CODE_ERROR);
    }

    if(options.start) {
        await start(options);
    } else {

    }
}

const program = new COMMANDER.Command();

const main = async () => {
    console.info(CHALK.cyan('program starts'));
    await program.parseAsync(process.argv);
    console.info(CHALK.cyan('program ends'));
}

program.description('Trimes services provider. :)')
    .option('start [options]', 'start the server.')
    .option('-p, --port <port number>', 'Port to listen. Default 8787.', 8787)
    .option('-h, --host <host name>', 'Host to listen. Default 127.0.0.1.', '127.0.0.1')
    .requiredOption('--gerrit-endpoint <uri>', 'The Gerrit Code Review system endpoint uri.')
    .option('--login-gerrit <credential file>', 'Auto login to Gerrit Code Review using a credential stored locally.')
    .option('--login-mantis <credential file>', 'Auto login to Mantis Bug Tracker using a credential stored locally.')
    .action(run);

main();


