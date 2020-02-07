'use strict';

const COMMANDER = require('commander');
const CHALK = require('chalk');
const FASTIFY = require('fastify');
const PPTCORE = require('puppeteer');
const GERRIT = require('./gerrit');
const HTTP_STATUS = require('http-status-codes');

const EXIT_CODE_ERROR = 1;

const start = async (options) => {
    return new Promise(async (resolve, reject)=>{
        const server = FASTIFY({ logger: true });
        let browser, pageGerrit;
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
            if (!browser) {
                browser = await PPTCORE.launch({ headless: true });
            }
            if (!gerrit) {
                gerrit = new GERRIT(browser, 'https://gerrit.fortinet.com/g');
                result = await gerrit.login(req.headers.username, req.headers.password);
            }

            res.code(HTTP_STATUS.OK);
            return '';
        });

        server.get('/gerrit/change/:id', async (req, res)=>{
            let content = await gerrit.getChangeById(req.params.id);
            res.code(HTTP_STATUS.OK);
            return content;
        });

        server.listen(options.port, (err, address)=>{
            if(err) {
                throw err;
            }
            console.info(`server is listening at ${address}...`);
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
    .action(run);

main();


