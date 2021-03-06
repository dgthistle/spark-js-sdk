/**!
 *
 * Copyright (c) 2015-2017 Cisco Systems, Inc. See LICENSE file.
 * @private
 */

import {createBrowser} from '@ciscospark/test-helper-automation';
import testUsers from '@ciscospark/test-helper-test-users';
import pkg from '../../../package';

const redirectUri = process.env.CISCOSPARK_REDIRECT_URI || process.env.REDIRECT_URI;

describe(`plugin-credentials`, function() {
  this.timeout(120000);
  describe(`Authorization`, () => {
    describe(`Authorization Code Grant`, () => {
      let browser, user;

      before(() => testUsers.create({count: 1})
        .then((users) => {
          user = users[0];
        }));

      before(() => createBrowser(pkg)
        .then((b) => {
          browser = b;
        }));

      after(() => browser && browser.printLogs());

      after(() => browser && browser.quit()
        .catch((reason) => {
          console.warn(reason);
        }));

      it(`authorizes a user`, () => browser
        .get(redirectUri)
        .waitForElementByClassName(`ready`)
        .title()
          .should.eventually.become(`Authorization Automation Test`)
        .waitForElementByCssSelector(`[title="Login with Authorization Code Grant"]`)
          .click()
        .login(user)
        .waitForElementByClassName(`authorization-automation-test`)
        .waitForElementById(`refresh-token`)
          .text()
            .should.eventually.not.be.empty
        .waitForElementByCssSelector(`#ping-complete:not(:empty)`)
          .text()
            .should.eventually.become(`success`));

      it(`is still logged in after reloading the page`, () => browser
        .waitForElementById(`access-token`)
          .text()
            .should.eventually.not.be.empty
        .get(redirectUri)
        .sleep(500)
        .waitForElementById(`access-token`)
          .text()
            .should.eventually.not.be.empty);

      it(`logs out a user`, () => browser
        .title()
          .should.eventually.become(`Authorization Automation Test`)
        .waitForElementByCssSelector(`[title="Logout"]`)
          .click()
        // We need to revoke three tokens before the window.location assignment.
        // So far, I haven't found any ques to wait for, so sleep seems to be
        // the only option.
        .sleep(3000)
        .title()
          .should.eventually.become(`Authorization Automation Test`)
        .waitForElementById(`access-token`)
          .text()
            .should.eventually.be.empty
        .waitForElementByCssSelector(`[title="Login with Authorization Code Grant"]`)
          .click()
        .waitForElementById(`IDToken1`));
    });
  });
});
