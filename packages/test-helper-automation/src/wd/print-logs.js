/**!
 *
 * Copyright (c) 2015-2017 Cisco Systems, Inc. See LICENSE file.
 */

/* eslint max-nested-callbacks: [0] */
/* eslint no-console: [0] */

'use strict';

var wd = require('wd');

wd.addPromiseChainMethod('printLogs', function printLogs() {
  return this
    .log('browser')
    .then(function doPrintLogs(logs) {
      logs.forEach(function formatLog(log) {
        try {
          log.message = JSON.parse(log.message);
          var method = console[log.message.message.level] || console.log;
          method.call(console, 'browser log:', log.message.message.text);
        }
        catch (err) {
          console.log('browser log:', log.message);
        }
      });
    })
    .catch(function handleError(reason) {
      console.warn('failed to fetch browser logs', reason);
    });
});
