/**!
 *
 * Copyright (c) 2015-2016 Cisco Systems, Inc. See LICENSE file.
 */

import UserService from '../..';

import {assert} from '@ciscospark/test-helper-chai';
import MockSpark from '@ciscospark/test-helper-mock-spark';
import sinon from '@ciscospark/test-helper-sinon';
import uuid from 'uuid';

describe(`plugin-user`, () => {
  describe(`User`, () => {
    let spark, userService;

    beforeEach(() => {
      spark = new MockSpark({
        children: {
          user: UserService
        }
      });

      userService = spark.user;
    });

    describe(`#activate()`, () => {
      it(`requires a \`verificationToken\``, () => {
        return assert.isRejected(userService.activate(), /`options.verificationToken` is required/);
      });
    });

    describe(`#asUUID()`, () => {
      it(`requires a \`user\``, () => {
        return assert.isRejected(userService.asUUID(), /`user` is required/);
      });

      it(`requires a \`user\` in the array`, () => {
        return assert.isRejected(userService.asUUID([``]), /`user` is required/);
      });

      it(`requires a valid email`, () => {
        return assert.isRejected(userService.asUUID(`not valid email`), /Provided user object does not appear to identify a user/);
      });

      it(`resolves id if id is passed`, () => {
        const id = uuid.v4();
        return assert.isFulfilled(userService.asUUID(id))
          .then((res) => {
            assert.equal(res, id);
          });
      });
    });

    describe(`#recordUUID()`, () => {
      it(`requires a \`user\``, () => {
        return assert.isRejected(userService.recordUUID(), /`user` is required/);
      });

      it(`requires an \`id\``, () => {
        return assert.isRejected(userService.recordUUID({}), /`user.id` is required/);
      });

      it(`requires the \`id\` to be a uuid`, () => {
        return assert.isRejected(userService.recordUUID({
          id: `not a uuid`
        }), /`user.id` must be a uuid/);
      });

      it(`requires an \`emailAddress\``, () => {
        return assert.isRejected(userService.recordUUID({
          id: uuid.v4()
        }), /`user.emailAddress` is required/);
      });

      it(`requires the \`emailAddress\` to be a uuid`, () => {
        return assert.isRejected(userService.recordUUID({
          id: uuid.v4(),
          emailAddress: `not an email address`
        }), /`user.emailAddress` must be an email address/);
      });

      it(`places the user in the userstore`, () => {
        const spy = sinon.stub(userService.store, `add`).returns(Promise.resolve());

        const user = {
          id: uuid.v4(),
          emailAddress: `test@example.com`
        };

        userService.recordUUID(user);

        assert.calledWith(spy, user);
      });
    });

    describe(`#setPassword()`, () => {
      it(`requires a \`password\``, () => {
        return assert.isRejected(userService.setPassword(), /`options.password` is required/);
      });
    });

    describe(`#update()`, () => {
      it(`requires a \`displayName\``, () => {
        return assert.isRejected(userService.update(), /`options.displayName` is required/);
      });
    });

    describe(`#verify()`, () => {
      it(`requires an \`email\` param`, () => {
        return assert.isRejected(userService.verify(), /`options.email` is required/);
      });
    });

  });
});
