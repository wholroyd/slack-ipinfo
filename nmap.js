'use strict';

var Nmap = function () {
    var libnmap = require('libnmap'),
        superagent = require('superagent'),
        dns = require('dns'),
        validator = require('validator'),
        logger = require('./logger');

    function validateInput(input, callback) {
        if (validator.isIP(input)) {
            callback(true);
        } else {
            return dns.lookup(input, function (err, addresses, family) {
                if (err) {
                    callback(false);
                } else {
                    callback(true);
                }
            });
        }
    }

    this.sendResponse = function (res, payload) {
        logger.info('nmap request for `%s` from %s@%s[%s]', payload.text, payload.user_name, payload.team_domain, payload.channel_name);

        validateInput(payload.text, function (isValid) {
            if (!isValid) {
                res.send({
                    response_type: 'ephemeral',
                    text: "Please include a valid IP or domain."
                });
                return;
            }

            res.send({
                response_type: 'in_channel',
                text: 'Scanning ' + payload.text + ' now, your results will be posted to this channel soon.'
            });

            libnmap.scan({
                range: [payload.text],
                ports: '1-65535',
                flags: ['-T4']
            }, function (err, report) {
                if (err) {
                    logger.error('nmap error', err);
                    superagent.post(payload.response_url).send({
                        response_type: 'in_channel',
                        text: 'nmap encountered an error! ' + err
                    }).end(function (err, res) {
                        if (err) {
                            logger.error('Post to response_url error', err);
                        }
                    });
                    return;
                }

                let fields = [],
                    message = {
                        response_type: 'in_channel',
                        attachments: [{
                            title: 'nmap scan results for ' + payload.text,
                            fields: fields
                        }]
                    },
                    result = report[payload.text];

                function addField(title, value, short) {
                    if (value) {
                        fields.push({
                            title: title,
                            value: value,
                            short: short
                        });
                    }
                }

                var portsList = '• ' + result.host[0].ports[0].port.map(function (port) {
                        return port.item.portid + '/' + port.item.protocol + '  (' + port.service[0].item.name + ')';
                    }).join('\n • ');


                addField('IP Address', result.host[0].address[0].item.addr, true);
                addField('Status', 'Host is ' + result.host[0].status[0].item.state, true);
                addField('Open Ports', portsList, false);
                addField('Command Used', result.item.args, false);
                addField('Summary', result.runstats[0].finished[0].item.summary, false);

                logger.debug('message', message);
                logger.debug('posting to', payload.response_url);

                superagent.post(payload.response_url).send(message).end(function (err, res) {
                    if (err) {
                        logger.error('Post to response_url error', err);
                    }
                });
            });
        });
    };
};

module.exports = new Nmap();
