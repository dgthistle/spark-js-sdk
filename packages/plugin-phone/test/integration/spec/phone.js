/**!
 *
 * Copyright (c) 2015-2017 Cisco Systems, Inc. See LICENSE file.
 */

import '../..';

import {assert} from '@ciscospark/test-helper-chai';
import {maxWaitForEvent} from '@ciscospark/test-helper-mocha';
import sinon from '@ciscospark/test-helper-sinon';
import CiscoSpark from '@ciscospark/spark-core';
import testUsers from '@ciscospark/test-helper-test-users';
import handleErrorEvent from '../lib/handle-error-event';

if (process.env.NODE_ENV !== `test`) {
  throw new Error(`Cannot run the plugin-phone test suite without NODE_ENV === "test"`);
}

describe(`plugin-phone`, function() {
  this.timeout(30000);

  describe(`Phone`, () => {
    let mccoy, spock;
    before(`create users and register`, () => testUsers.create({count: 2})
      .then((users) => {
        [mccoy, spock] = users;
        spock.spark = new CiscoSpark({
          credentials: {
            authorization: spock.token
          }
        });

        mccoy.spark = new CiscoSpark({
          credentials: {
            authorization: mccoy.token
          }
        });
        return Promise.all([
          spock.spark.phone.register(),
          mccoy.spark.phone.register()
        ]);
      }));

    let ringMccoy;
    beforeEach(() => {
      ringMccoy = sinon.spy();
      mccoy.spark.phone.on(`call:incoming`, ringMccoy);
    });

    after(`unregister spock and mccoy`, () => Promise.all([
      spock && spock.spark.phone.deregister()
        .catch((reason) => console.warn(`could not disconnect spock from mercury`, reason)),
      mccoy && mccoy.spark.phone.deregister()
        .catch((reason) => console.warn(`could not disconnect mccoy from mercury`, reason))
    ]));

    describe(`#createLocalMediaStream()`, () => {
      it(`returns a MediaStreamObject`, () => {
        return spock.spark.phone.createLocalMediaStream()
          .then((stream) => {
            assert.instanceOf(stream, MediaStream);
          });
      });
    });

    describe(`#deregister()`, () => {
      let mercuryDisconnectSpy;
      beforeEach(() => {
        mercuryDisconnectSpy = sinon.spy(spock.spark.mercury, `disconnect`);
      });

      afterEach(() => mercuryDisconnectSpy.restore());

      it(`disconnects from mercury`, () => {
        return spock.spark.phone.deregister()
          .then(() => assert.calledOnce(mercuryDisconnectSpy))
          .then(() => assert.isFalse(spock.spark.mercury.connected, `Mercury is not connected`))
          .then(() => assert.isFalse(spock.spark.phone.connected, `Mercury (proxied through spark.phone) is not connected`))
          .then(() => mercuryDisconnectSpy.restore());
      });

      it(`unregisters from wdm`, () => assert.isFulfilled(spock.spark.phone.deregister()
        .then(() => assert.isUndefined(spock.spark.device.url))
        .then(() => spock.spark.phone.register())));

      it(`is a noop when not registered`, () => assert.isFulfilled(spock.spark.phone.deregister()
        .then(() => spock.spark.phone.deregister())
        .then(() => spock.spark.phone.register())));
    });

    describe(`#dial()`, () => {
      it(`initiates a video-only call`, () => {
        const call = spock.spark.phone.dial(mccoy.email, {
          constraints: {
            video: true,
            audio: false
          }
        });

        return handleErrorEvent(call, () => mccoy.spark.phone.when(`call:incoming`)
          .then(() => maxWaitForEvent(10000, `connected`, call))
          .then(() => {
            assert.isFalse(call.sendingAudio);
            assert.isTrue(call.sendingVideo);
            assert.isFalse(call.receivingAudio);
            assert.isTrue(call.receivingVideo);
          }));
      });

      it(`initiates an audio-only call`, () => {
        const call = spock.spark.phone.dial(mccoy.email, {
          constraints: {
            video: false,
            audio: true
          }
        });

        return handleErrorEvent(call, () => mccoy.spark.phone.when(`call:incoming`)
          .then(() => maxWaitForEvent(10000, `connected`, call))
          .then(() => {
            assert.isTrue(call.sendingAudio);
            assert.isFalse(call.sendingVideo);
            assert.isTrue(call.receivingAudio);
            assert.isFalse(call.receivingVideo);
          }));
      });

      it(`initiates a receive-only call`, () => {
        const call = spock.spark.phone.dial(mccoy.email, {
          constraints: {
            video: false,
            audio: false
          },
          offerOptions: {
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          }
        });

        return handleErrorEvent(call, () => mccoy.spark.phone.when(`call:incoming`)
          .then(() => maxWaitForEvent(10000, `connected`, call))
          .then(() => {
            assert.isFalse(call.sendingAudio);
            assert.isFalse(call.sendingVideo);
            assert.isTrue(call.receivingAudio);
            assert.isTrue(call.receivingVideo);
          }));
      });

      it(`calls a user by email address`, () => {
        let mccoyCall;
        return handleErrorEvent(spock.spark.phone.dial(mccoy.email), (call) => Promise.all([
          call.when(`connected`)
            .then(() => {
              assert.isDefined(call.correlationId);
              assert.equal(call.locus.self.devices[0].correlationId, call.correlationId);
            }),
          mccoy.spark.phone.when(`call:incoming`)
            .then(([c]) => {
              mccoyCall = c;
              return c.answer()
                .then(() => {
                  assert.equal(mccoyCall.locus.self.devices[0].correlationId, mccoyCall.correlationId);
                  assert.isDefined(mccoyCall.correlationId);
                });
            })
        ]));
      });

      // TODO [SSDK-574]
      it(`calls a user by AppID username`);

      // TODO [SSDK-507] currently timing out because the PSTN participant is
      // showing up as inactive
      it.skip(`calls a PSTN phone number`, () => {
        const call = spock.spark.phone.dial(`3175276955`);
        return handleErrorEvent(call, () => call.when(`connected`)
          .then(() => call.hangup()));
      });

      // Not implementing this feature at this time: doing so would introduce a
      // dependency on an internal microservice (convo).
      it.skip(`calls a user by hydra room id`, () => spock.spark.request({
        method: `POST`,
        service: `hydra`,
        resource: `messages`,
        body: {
          toPersonEmail: mccoy.email,
          text: `test message`
        }
      })
        .then((res) => {
          const call = spock.spark.phone.dial(res.body.roomId);
          return handleErrorEvent(call, () => mccoy.spark.phone.when(`call:incoming`));
        })
        .then(() => assert.calledOnce(ringMccoy)));

      // Not implementing this feature at this time: doing so would introduce a
      // dependency on an internal microservice (convo).
      it(`calls a user by room url`);

      it(`calls a user by hydra user id`, () => mccoy.spark.request({
        method: `GET`,
        service: `hydra`,
        resource: `people/me`
      })
        .then((res) => handleErrorEvent(spock.spark.phone.dial(res.body.id),
          (call) => mccoy.spark.phone.when(`call:incoming`)
            .then(() => call.hangup()))));

      it(`calls a user by uuid`, () => handleErrorEvent(spock.spark.phone.dial(mccoy.id),
          (call) => mccoy.spark.phone.when(`call:incoming`)
            .then(() => call.hangup())));

      // TODO [SSDK-233, SSDK-508, SSDK-56, SSDK-149, SSDK-3] need to figure out
      // what entitlements are required to dial sip addresses. Also, might be
      // blocked by the sip calling test app being offline.
      // const call = spock.spark.phone.dial(`sip:...`);
      it(`calls a user by sip uri`);

      it(`places a call with an existing MediaStreamObject`, () => {
        return spock.spark.phone.createLocalMediaStream()
          .then((localMediaStream) => handleErrorEvent(spock.spark.phone.dial(mccoy.email, {localMediaStream}), (call) => {
            return mccoy.spark.phone.when(`call:incoming`, ([c]) => c.answer())
              .then(() => assert.equal(call.localMediaStream, localMediaStream));
          }));
      });
    });

    describe(`#register()`, () => {
      let kirk;
      beforeEach(() => testUsers.create({count: 1})
        .then(([user]) => {
          kirk = user;
          kirk.spark = new CiscoSpark({
            credentials: {
              authorization: kirk.token
            }
          });
        }));

      afterEach(`unregister kirk`, () => kirk && kirk.spark.phone.deregister());

      it(`registers with wdm`, () => {
        const spy = sinon.spy();
        kirk.spark.phone.on(`change:registered`, spy);
        return kirk.spark.phone.register()
          .then(() => {
            assert.isDefined(kirk.spark.device.url);
            assert.called(spy);
          });
      });

      it(`connects to mercury`, () => {
        assert.isFalse(kirk.spark.mercury.connected, `Mercury is not connected`);
        assert.isFalse(kirk.spark.phone.connected, `Mercury (proxied through spark.phone) is not conneted`);
        const spy = sinon.spy();
        kirk.spark.phone.on(`change:connected`, spy);
        return kirk.spark.phone.register()
          .then(() => {
            assert.isTrue(kirk.spark.mercury.connected, `Mercury is connected after calling register`);
            assert.isTrue(kirk.spark.phone.connected, `spark.phone.connected proxies to spark.mercury.connected`);
            assert.called(spy);
          });
      });

      let call;
      afterEach(`end current call`, () => Promise.resolve(call && call.hangup()
        .catch((reason) => console.warn(`failed to end call`, reason))
        .then(() => {call = undefined;})));

      it(`fetches active calls`, () => {
        call = spock.spark.phone.dial(kirk.email);
        // use change:locus as the trigger for determining when the post to
        // /call completes.
        return handleErrorEvent(call, () => call.when(`change:locus`)
          .then(() => {
            assert.isFalse(kirk.spark.phone.registered);
            kirk.spark.phone.register();
            return kirk.spark.phone.when(`call:incoming`)
              .then(() => assert.isTrue(kirk.spark.phone.registered, `By the time spark.phone can emit call:incoming, spark.phone.registered must be true`));
          }));
      });

      it(`is a noop when already registered`, () => assert.isFulfilled(spock.spark.phone.register()));
    });

    describe(`when a call is received`, () => {
      it(`emits a call:incoming event`, () => {
        spock.spark.phone.dial(mccoy.email);
        return mccoy.spark.phone.when(`call:incoming`)
          .then(() => assert.calledOnce(ringMccoy));
      });
    });
  });
});
