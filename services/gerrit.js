'use strict';
const AXIOS = require('axios');
const PPTCORE = require('puppeteer');
const OS = require('os');
const TMP = require('tmp');
const FS = require('fs');
const PATH = require('path');

TMP.setGracefulCleanup();

class Gerrit {
    constructor(browser, serverEndpoint) {
        this.serverEndpoint = serverEndpoint;
        this.browser = browser;
    }

    async login(username, password) {
        if(!this.mainPage) {
            this.mainPage = await this.browser.newPage();
            try {
                this.mainPage.on('pageerror', error => {
                    console.log('page error');
                });
                this.mainPage.on('error', error=>{
                    console.log(error);
                });
                // this.mainPage.on('console', msg => {
                //     for (let i = 0; i < msg.args().length; ++i)
                //         console.log(`${i}: ${msg.args()[i]}`);
                // });
                await this.mainPage.goto(`${this.serverEndpoint}/login`);
                // consider navigation to be finished when there are no more than 0 network connections for at least 500 ms.
                // await this.mainPage.waitForNavigation({ waitUntil: ['networkidle2', 'load' , 'domcontentloaded'] });
                await this.mainPage.waitForSelector('form input[id="f_user"]').then(()=>{
                    return this.mainPage.$eval('form input[id="f_user"]', (element, username) => {
                        element.value = username;
                    }, username);
                });
                await this.mainPage.waitForSelector('form input[id="f_pass"]').then(() => {
                    return this.mainPage.$eval('form input[id="f_pass"]', (element, password) => {
                        element.value = password;
                    }, password);
                });
                await this.mainPage.waitForSelector('form input[id="f_remember"]').then(() => {
                    return this.mainPage.$eval('form input[id="f_remember"]', element => {
                        element.checked = true;
                    });
                });
                await this.mainPage.waitForSelector('form input[id="b_signin"]').then(() => {
                    return this.mainPage.click('form input[id="b_signin"]');
                });

                await Promise.race([
                    this.mainPage.waitForSelector('div#error_message').then(()=>{
                        throw new Error('Authentication failed. Invalid usernam or password.');
                    }),
                    this.mainPage.waitForNavigation({waitUntil: 'networkidle0'})
                ]);

                return true;
            } catch (error) {
                console.error(error);
                this.mainPage.close();
                this.mainPage = null;
                return false;
            }
        } else {
            return false;
        }
    }

    async logout() {

    }

    async request(method, uri, headers, body) {
        const tempDir = TMP.dirSync();
        let requestPage = await this.browser.newPage();
        await requestPage.setRequestInterception(true);
        await requestPage._client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: tempDir.name,
        });

        let res;
        await new Promise((resolve, reject)=>{
            const reqMethod = method.toString().trim().toUpperCase();
            if(!['GET', 'POST', 'PUT', 'DELETE'].includes(reqMethod)) {
                reject(`Cannot send request using unsupported method: ${method}`);
                return;
            }
            requestPage.once('request', interceptedRequest => {
                let data = {
                    method: reqMethod,
                    headers: {
                        ...interceptedRequest.headers(),
                        'Content-Type': 'text/plain',
                        'Content-Disposition': 'inline'
                    }
                };
                if(headers) {
                    for(let h in headers) {
                        data.headers[h] = headers[h];
                    }
                }
                if(reqMethod === 'POST' && body) {
                    data.postData = body;
                }
                interceptedRequest.continue(data);
            });
            resolve();
        });

        const onResponse = new Promise((resolve, reject)=>{
            requestPage.once('response', interceptedResponse=>{
                resolve(interceptedResponse);
            });
        });

        const retrieveDownloadedFile = async (interceptedResponse) => {
            let count = 4;
            let fileName = await new Promise((resolve, reject)=>{
                let interval;
                interval = setInterval(()=>{
                    const files = FS.readdirSync(tempDir.name);
                    // NOTE: assume that there's only one file downloaded per temp dir
                    if(files.length > 0 || --count === 0) {
                        clearInterval(interval);
                        resolve(files.length > 0 && files[0] || null);
                    }
                }, 500);
            });
            if(fileName){
                const content = FS.readFileSync(PATH.resolve(tempDir.name, fileName));
                const [, json] = /\)]}'\n([\S\s]*)/gm.exec(content);
                return json && decodeURIComponent((JSON.stringify(JSON.parse(json)))) || null;
            } else {
                return null;
            }
        }

        const closePage = async () => {
            if (requestPage) {
                await requestPage.close();
                requestPage = null;
            }
            return null;
        }
        // NOTE: puppeteer returns net::ERR_ABORTED on gerrit downloading a file
        let [responseContent, gotoPageHandler] = await Promise.all([
            onResponse.then(retrieveDownloadedFile),
            requestPage.goto(uri).catch(e=>console.error)
        ]);
        await closePage();
        return responseContent;
    }

    async getChangeById(id) {
        try {
            return this.request('get', `${this.serverEndpoint}/changes/?q=${id}&pp=0`);
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    close() {
        this.browser = null;
        if(this.mainPage) {
            this.mainPage = null;
        }
    }
}

module.exports = Gerrit;
