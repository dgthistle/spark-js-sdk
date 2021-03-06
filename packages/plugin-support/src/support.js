/**!
 *
 * Copyright (c) 2015-2017 Cisco Systems, Inc. See LICENSE file.
 * @private
 */

import {SparkPlugin} from '@ciscospark/spark-core';
import {defaults} from 'lodash';
import uuid from 'uuid';

const Support = SparkPlugin.extend({
  namespace: `Support`,

  getFeedbackUrl(options) {
    options = options || {};
    return this.request({
      method: `POST`,
      api: `conversation`,
      resource: `users/deskFeedbackUrl`,
      body: defaults(options, {
        appVersion: this.config.appVersion,
        appType: this.config.appType,
        feedbackId: options.feedbackId || uuid.v4(),
        languageCode: this.config.languageCode
      })
    })
      .then((res) => res.body.url);
  },

  getSupportUrl() {
    return this.spark.request({
      method: `GET`,
      api: `conversation`,
      resource: `users/deskSupportUrl`,
      qs: {
        languageCode: this.config.languageCode
      }
    })
      .then((res) => res.body.url);
  },

  submitLogs(metadata, logs) {
    const metadataArray = this._constructFileMetadata(metadata);
    if (!logs && this.spark.logger.buffer) {
      logs = this.spark.logger.buffer.join(`\n`);
    }

    let filename;
    if (metadata.locusId && metadata.callStart) {
      filename = `${metadata.locusId}_${metadata.callStart}.txt`;
    }
    else {
      filename = `${this.spark.sessionId}.txt`;
    }

    let userId;
    return this.spark.credentials.getAuthorization()
      .catch(() => this.spark.credentials.getClientCredentialsAuthorization())
      .then((authorization) => {
        const headers = {authorization};

        return this.spark.upload({
          file: logs,
          api: `atlas`,
          resource: `logs/url`,
          shouldAttemptReauth: false,
          headers,
          phases: {
            initialize: {
              body: {
                file: filename
              }
            },
            upload: {
              $uri: (session) => session.tempURL
            },
            finalize: {
              api: `atlas`,
              resource: `logs/meta`,
              $body: (session) => {
                userId = session.userId;
                return {
                  filename: session.logFilename,
                  data: metadataArray,
                  userId: this.spark.device.userId || session.userId
                };
              }
            }
          }
        });
      })
      .then((body) => {
        if (userId && !body.userId) {
          body.userId = userId;
        }

        return body;
      });
  },

  _constructFileMetadata(metadata) {
    const metadataArray = [
      `locusId`,
      `callStart`,
      `feedbackId`
    ].map((key) => {
      if (metadata[key]) {
        return {
          key,
          value: metadata[key]
        };
      }
      return null;
    })
    .filter((entry) => Boolean(entry));

    metadataArray.push({
      key: `trackingId`,
      value: this.spark.sessionId
    });

    return metadataArray;
  }
});

export default Support;
