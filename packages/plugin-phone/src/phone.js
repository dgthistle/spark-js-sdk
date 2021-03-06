/**!
 *
 * Copyright (c) 2016-2017 Cisco Systems, Inc. See LICENSE file.
 * @private
 */

import {SparkPlugin} from '@ciscospark/spark-core';
import {defaults} from 'lodash';
import Call from './call';
import {shouldRing} from './state-parsers';
import {getUserMedia} from './webrtc';

/**
 * Incoming Call Event
 *
 * Emitted when a call begins and when {@link Phone#register} is invoked and
 * there are active calls.
 *
 * @event call:incoming
 * @instance
 * @memberof Phone
 * @type {Object}
 * @property {Call} call The incoming call
 */

/**
 * @class
 * @extends SparkPlugin
 * The calling feature in the SDK is currently available in limited beta. If you'd like to join the beta program and share your feedback, please visit the [developer portal](https://developer.ciscospark.com/sdkaccess/). If you qualify, a Cisco employee will reach out to you.
 */
const Phone = SparkPlugin.extend({
  session: {
    /**
     * Indicates whether or not the WebSocket is connected
     * @instance
     * @memberof Phone
     * @member {Boolean}
     * @readonly
     */
    connected: {
      default: false,
      type: `boolean`
    },
    /**
     * Specifies the facingMode to be used by {@link Phone#dial} and
     * {@link Call#answer} when no constraint is specified. Does not apply if
     * - a {@link MediaStream} is passed to {@link Phone#dial} or
     * {@link Call#answer}
     * - constraints are passed to {@link Phone#dial} or  {@link Call#answer}
     * The only valid values are `user` and `environment`. For any other values,
     * you must provide your own constrains or {@link MediaStream}
     * @default `user`
     * @instance
     * @memberof {Phone}
     * @type {string}
     */
    defaultFacingMode: {
      default: `user`,
      type: `string`,
      values: [`user`, `environment`]
    },
    /**
     * indicates whether or not the client is registered with the Cisco Spark
     * cloud
     * @instance
     * @memberof Phone
     * @member {Boolean}
     * @readonly
     */
    registered: {
      default: false,
      type: `boolean`
    }
  },

  namespace: `phone`,

  /**
   * Indicates if the current browser appears to support webrtc calling. Note:
   * at this time, there's no way to determine if the current browser supports
   * h264 without asking for camera permissions
   * @returns {Promise<Boolean>}
   */
  isCallingSupported() {
    return new Promise((resolve) => {
      // I'm not thrilled by this, but detectrtc breaks the global namespace in
      // a way that screws up the browserOnly/nodeOnly test helpers.
      // eslint-disable-next-line global-require
      const DetectRTC = require(`detectrtc`);
      resolve(DetectRTC.isWebRTCSupported);
    });
  },

  /**
   * Registers the client with the Cisco Spark cloud and starts listening for
   * WebSocket events.
   *
   * Subsequent calls refresh the device registration.
   * @instance
   * @memberof Phone
   * @returns {Promise}
   */
  register() {
    // Ideally, we could call spark.refresh via spark-core, but it doesn't know
    // about the wdm plugin, and all of the leaky abstractions I can think of
    // seem risky.

    return this.spark.device.refresh()
      .then(() => {
        if (this.connected) {
          return Promise.resolve();
        }
        return Promise.all([
          this.spark.mercury.when(`event:mercury.buffer_state`)
            .then(([message]) => {
              if (message.data.bufferState.locus === `UNKNOWN`) {
                return this.spark.locus.list();
              }
              return Promise.resolve();
            })
            .then((loci) => {
              if (!loci) {
                return;
              }
              // eslint-disable-next-line max-nested-callbacks
              loci.forEach((locus) => {
                this.trigger(`call:incoming`, Call.make({
                  locus
                }, {
                  parent: this.spark
                }));
              });
            }),
          this.spark.mercury.connect()
        ]);
      });
  },

  /**
   * Disconnects from WebSocket and unregisters from the Cisco Spark cloud.
   *
   * Subsequent calls will be a noop.
   * @instance
   * @memberof Phone
   * @returns {Promise}
   */
  deregister() {
    return this.spark.mercury.disconnect()
      .then(() => this.spark.device.unregister());
  },

  /**
   * Create a MediaStream to be used for video preview.
   *
   * Note: You must explicitly pass the resultant stream to {@link Call#answer()}
   * or {@link Phone#dial()}
   * @instance
   * @memberof Phone
   * @param {Object|MediaStreamConstraints} options
   * @param {MediaStreamConstraints} options.constraints
   * @returns {Promise<MediaStream>}
   */
  createLocalMediaStream(options) {
    options = options || {};
    const constraints = options.constraints || options;
    defaults(constraints, {
      audio: true,
      video: true
    });

    return getUserMedia(constraints);
  },

  /**
   * Initializer
   * @instance
   * @memberof Phone
   * @param {Object} attrs
   * @param {Object} options
   * @private
   * @returns {undefined}
   */
  initialize(...args) {
    Reflect.apply(SparkPlugin.prototype.initialize, this, args);

    this.listenTo(this.spark.mercury, `event:locus`, (event) => this._onLocusEvent(event));

    // Note: we need to manually wire up change:connected because derived props
    // can't read through this.parent
    this.listenTo(this.spark.mercury, `change:connected`, () => {
      this.connected = this.spark.mercury.connected;
      this.registered = !!this.spark.device.url && this.connected;
    });

    // Note: we need to manually wire up change:url because derived props
    // can't read through this.parent
    this.listenTo(this.spark.device, `change:url`, () => {
      this.registered = !!this.spark.device.url && this.connected;
    });
  },

  /**
   * Determines if the {@link call:incoming} event should be emitted for the
   * specified {@link Types~MercuryEvent}
   * @emits call:incoming
   * @instance
   * @memberof Phone
   * @param {Types~MercuryEvent} event
   * @returns {undefined}
   */
  _onLocusEvent(event) {
    if (shouldRing(event, this.spark)) {
      this.trigger(`call:incoming`, Call.make({
        locus: event.data.locus
      }, {
        parent: this.spark
      }));
    }
  },

  /**
   * Place a call to the specified dialString. A dial string may be an email
   * address or sip uri.
   * @instance
   * @memberof Phone
   * @param {string} dialString
   * @param {Object} options
   * @param {MediaStreamConstraints} options.constraints
   * @param {MediaStream} options.localMediaStream if no stream is specified, a
   * new one will be created based on options.constraints
   * @returns {Call}
   */
  dial(dialString, options) {
    const call = Call.make({}, {parent: this.spark});

    call.dial(dialString, options);
    return call;
  }
});

export default Phone;
