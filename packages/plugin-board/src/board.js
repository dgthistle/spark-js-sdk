/**!
 *
 * Copyright (c) 2015-2017 Cisco Systems, Inc. See LICENSE file.
 * @private
 */

import {SparkPlugin, Page} from '@ciscospark/spark-core';
import Realtime from './realtime';
import {assign, defaults, chunk, pick} from 'lodash';
import promiseSeries from 'es6-promise-series';

const Board = SparkPlugin.extend({
  namespace: `Board`,

  children: {
    realtime: Realtime
  },

  /**
   * Adds Content to a Channel
   * If contents length is greater than config.board.numberContentsPerPageForAdd, this method
   * will break contents into chunks and make multiple GET request to the
   * board service
   * @memberof Board.BoardService
   * @param  {Board~Channel} channel
   * @param  {Array} contents - Array of {@link Board~Content} objects
   * @returns {Promise<Board~Content>}
   */
  addContent(channel, contents) {
    let chunks = [];
    chunks = chunk(contents, this.config.numberContentsPerPageForAdd);
    // we want the first promise to resolve before continuing with the next
    // chunk or else we'll have race conditions among patches
    return promiseSeries(chunks.map((part) => this._addContentChunk.bind(this, channel, part)));
  },

  /**
   * Adds Image to a Channel
   * Uploads image to spark files and adds SCR + downloadUrl to the persistence
   * service
   * @memberof Board.BoardService
   * @param  {Board~Channel} channel
   * @param  {File} image - image to be uploaded
   * @returns {Promise<Board~Content>}
   */
  addImage(channel, image) {
    return this.spark.board._uploadImage(channel, image)
      .then((scr) => this.spark.board.addContent(channel, [{
        type: `FILE`,
        displayName: image.name,
        file: {
          mimeType: image.type,
          scr,
          size: image.size,
          url: scr.loc
        }
      }]));
  },

  /**
   * Set a snapshot image for a board
   *
   * @param {Board~Channel} channel
   * @param {File} image
   * @returns {Promise<Board~Channel>}
   */
  setSnapshotImage(channel, image) {
    let imageScr;
    return this.spark.board._uploadImage(channel, image, {hiddenSpace: true})
      .then((scr) => {
        imageScr = scr;
        return this.spark.encryption.encryptScr(channel.defaultEncryptionKeyUrl, imageScr);
      })
      .then((encryptedScr) => {
        imageScr.encryptedScr = encryptedScr;
        return encryptedScr;
      })
      .then(() => {
        const imageBody = {
          image: {
            url: imageScr.loc,
            height: image.height || 900,
            width: image.width || 1600,
            mimeType: image.type || `image/png`,
            scr: imageScr.encryptedScr,
            encryptionKeyUrl: channel.defaultEncryptionKeyUrl,
            fileSize: image.size
          }
        };

        return this.spark.request({
          method: `PATCH`,
          api: `board`,
          resource: `/channels/${channel.channelId}`,
          body: imageBody
        });
      })
      .then((res) => res.body);
  },

  /**
   * Creates a Channel
   * @memberof Board.BoardService
   * @param  {Conversation~ConversationObject} conversation
   * @param  {Board~Channel} channel
   * @returns {Promise<Board~Channel>}
   */
  createChannel(conversation, channel) {
    return this.spark.request({
      method: `POST`,
      api: `board`,
      resource: `/channels`,
      body: this._prepareChannel(conversation, channel)
    })
      .then((res) => res.body);
  },

  _prepareChannel(conversation, channel) {
    return Object.assign({
      aclUrlLink: conversation.aclUrl,
      kmsMessage: {
        method: `create`,
        uri: `/resources`,
        userIds: [conversation.kmsResourceObjectUrl],
        keyUris: []
      }
    }, channel);
  },

  /**
   * Decrypts a collection of content objects
   *
   * @memberof Board.BoardService
   * @param  {Array} contents curves, text, and images
   * @returns {Promise<Array>} Resolves with an array of {@link Board~Content} objects.
   */
  decryptContents(contents) {
    return Promise.all(contents.items.map((content) => {
      let decryptPromise;

      if (content.type === `FILE`) {
        decryptPromise = this.decryptSingleFileContent(content.encryptionKeyUrl, content);
      }
      else {
        decryptPromise = this.decryptSingleContent(content.encryptionKeyUrl, content.payload);
      }

      return decryptPromise
        .then((res) => {
          Reflect.deleteProperty(content, `payload`);
          Reflect.deleteProperty(content, `encryptionKeyUrl`);
          return defaults(res, content);
        });
    }));
  },

  /**
   * Decryts a single STRING content object
   * @memberof Board.BoardService
   * @param  {string} encryptionKeyUrl
   * @param  {string} encryptedData
   * @returns {Promise<Board~Content>}
   */
  decryptSingleContent(encryptionKeyUrl, encryptedData) {
    return this.spark.encryption.decryptText(encryptionKeyUrl, encryptedData)
      .then((res) => JSON.parse(res));
  },

  /**
   * Decryts a single FILE content object
   * @memberof Board.BoardService
   * @param  {string} encryptionKeyUrl
   * @param  {object} encryptedContent {file, payload}
   * @returns {Promise<Board~Content>}
   */
  decryptSingleFileContent(encryptionKeyUrl, encryptedContent) {
    let metadata = {};

    if (encryptedContent.payload) {
      metadata = JSON.parse(encryptedContent.payload);
    }

    return this.spark.encryption.decryptScr(encryptionKeyUrl, encryptedContent.file.scr)
      .then((scr) => {
        encryptedContent.file.scr = scr;
        return this.spark.encryption.decryptText(encryptionKeyUrl, metadata.displayName);
      })
      .then((displayName) => {
        encryptedContent.displayName = displayName;
        return encryptedContent;
      });
  },

  /**
   * Deletes all Content from a Channel
   * @memberof Board.BoardService
   * @param  {Board~Channel} channel
   * @returns {Promise} Resolves with an content response
   */
  deleteAllContent(channel) {
    return this.spark.request({
      method: `DELETE`,
      uri: `${channel.channelUrl}/contents`
    })
      .then((res) => res.body);
  },

  /**
   * Encrypts a collection of content
   * @memberof Board.BoardService
   * @param  {string} encryptionKeyUrl channel.defaultEncryptionKeyUrl
   * @param  {Array} contents   Array of {@link Board~Content} objects. (curves, text, and images)
   * @returns {Promise<Array>} Resolves with an array of encrypted {@link Board~Content} objects.
   */
  encryptContents(encryptionKeyUrl, contents) {
    return Promise.all(contents.map((content) => {
      let encryptionPromise;
      let contentType = `STRING`;

      // the existence of an scr will determine if the content is a FILE.
      if (content.file) {
        contentType = `FILE`;
        encryptionPromise = this.encryptSingleFileContent(encryptionKeyUrl, content);
      }
      else {
        encryptionPromise = this.encryptSingleContent(encryptionKeyUrl, content);
      }

      return encryptionPromise
        .then((res) => assign({
          device: this.spark.device.deviceType,
          type: contentType,
          encryptionKeyUrl,
          payload: res.encryptedData
        },
          pick(res, `file`)
        ));
    }));
  },

  /**
   * Encrypts a single STRING content object
   * @memberof Board.BoardService
   * @param  {string} encryptionKeyUrl
   * @param  {Board~Content} content
   * @returns {Promise<Board~Content>}
   */
  encryptSingleContent(encryptionKeyUrl, content) {
    return this.spark.encryption.encryptText(encryptionKeyUrl, JSON.stringify(content))
      .then((res) => ({
        encryptedData: res,
        encryptionKeyUrl
      }));
  },

  /**
   * Encrypts a single FILE content object
   * @memberof Board.BoardService
   * @param  {string} encryptionKeyUrl
   * @param  {Board~Content} content
   * @returns {Promise<Board~Content>}
   */
  encryptSingleFileContent(encryptionKeyUrl, content) {
    return this.spark.encryption.encryptScr(encryptionKeyUrl, content.file.scr)
      .then((encryptedScr) => {
        content.file.scr = encryptedScr;
        return this.spark.encryption.encryptText(encryptionKeyUrl, content.displayName);
      })
      .then((encryptedDisplayName) => {
        const metadata = {
          displayName: encryptedDisplayName
        };

        return {
          file: content.file,
          encryptedData: JSON.stringify(metadata),
          encryptionKeyUrl
        };
      });
  },

  /**
   * Retrieves contents from a specified channel
   * @memberof Board.BoardService
   * @param  {Board~Channel} channel
   * @param  {Object} options
   * @param  {Object} options.qs
   * @returns {Promise<Page<Board~Channel>>} Resolves with an array of Content items
   */
  getContents(channel, options) {
    options = options || {};

    const params = {
      uri: `${channel.channelUrl}/contents`,
      qs: {
        contentsLimit: this.config.numberContentsPerPageForGet
      }
    };
    assign(params.qs, pick(options, `contentsLimit`));

    return this.request(params)
      .then((res) => new Page(res, this.spark));
  },

  /**
   * Gets a Channel
   * @memberof Board.BoardService
   * @param  {Board~Channel} channel
   * @returns {Promise<Board~Channel>}
   */
  getChannel(channel) {
    return this.spark.request({
      method: `GET`,
      uri: channel.channelUrl
    })
      .then((res) => res.body);
  },

  /**
   * Gets Channels
   * @memberof Board.BoardService
   * @param {Conversation~ConversationObject} conversation
   * @param {Object} options
   * @param {number} options.limit Max number of activities to return
   * @returns {Promise<Page<Board~Channel>>} Resolves with an array of Channel items
   */
  getChannels(conversation, options) {
    options = options || {};

    if (!conversation) {
      return Promise.reject(new Error(`\`conversation\` is required`));
    }

    const params = {
      api: `board`,
      resource: `/channels`,
      qs: {
        aclUrlLink: conversation.aclUrl
      }
    };
    assign(params.qs, pick(options, `channelsLimit`));

    return this.request(params)
      .then((res) => new Page(res, this.spark));
  },

  /**
   * Pings persistence
   * @memberof Board.BoardService
   * @returns {Promise<Object>} ping response body
   */
  ping() {
    return this.spark.request({
      method: `GET`,
      api: `board`,
      resource: `/ping`
    })
      .then((res) => res.body);
  },

  processActivityEvent(message) {
    let decryptionPromise;

    if (message.contentType === `FILE`) {
      decryptionPromise = this.decryptSingleFileContent(message.envelope.encryptionKeyUrl, message.payload);
    }
    else {
      decryptionPromise = this.decryptSingleContent(message.envelope.encryptionKeyUrl, message.payload);
    }

    return decryptionPromise
      .then((decryptedData) => {

        // call the event handlers
        message.payload = decryptedData;
        return message;
      });
  },

  /**
   * Registers with Mercury
   * @memberof Board.BoardService
   * @param  {Object} data - Mercury bindings
   * @returns {Promise<Board~Registration>}
   */
  register(data) {
    return this.spark.request({
      method: `POST`,
      api: `board`,
      resource: `/registrations`,
      body: data
    })
      .then((res) => res.body);
  },

  /**
   * Registers with Mercury for sharing web socket
   * @memberof Board.BoardService
   * @param  {Board~Channel} channel
   * @returns {Promise<Board~Registration>}
   */
  registerToShareMercury(channel) {
    return this.spark.feature.getFeature(`developer`, `web-shared-mercury`)
      .then((isSharingMercuryFeatureEnabled) => {
        if (!this.spark.mercury.localClusterServiceUrls) {
          return Promise.reject(new Error(`\`localClusterServiceUrls\` is not defined, make sure mercury is connected`));
        }
        else if (!isSharingMercuryFeatureEnabled) {
          return Promise.reject(new Error(`\`web-shared-mercury\` is not enabled`));
        }

        const webSocketUrl = this.spark.device.webSocketUrl;
        const mercuryConnectionServiceClusterUrl = this.spark.mercury.localClusterServiceUrls.mercuryConnectionServiceClusterUrl;

        const data = {
          mercuryConnectionServiceClusterUrl,
          webSocketUrl,
          action: `REPLACE`
        };

        return this.spark.request({
          method: `POST`,
          uri: `${channel.channelUrl}/register`,
          body: data
        });
      })
      .then((res) => res.body);
  },

  /**
   * Remove board binding from existing mercury connection
   * @memberof Board.BoardService
   * @param  {Board~Channel} channel
   * @param  {String} binding - the binding as provided in board registration
   * @returns {Promise<Board~Registration>}
   */
  unregisterFromSharedMercury(channel, binding) {
    const webSocketUrl = this.spark.device.webSocketUrl;
    const data = {
      binding,
      webSocketUrl,
      action: `REMOVE`
    };

    return this.spark.request({
      method: `POST`,
      uri: `${channel.channelUrl}/register`,
      body: data
    })
      .then((res) => res.body);
  },

  _addContentChunk(channel, contentChunk) {
    return this.spark.board.encryptContents(channel.defaultEncryptionKeyUrl, contentChunk)
      .then((res) => this.spark.request({
        method: `POST`,
        uri: `${channel.channelUrl}/contents`,
        body: res
      }))
      .then((res) => res.body);
  },

  /**
   * Encrypts and uploads image to SparkFiles
   * @memberof Board.BoardService
   * @param  {Board~Channel} channel
   * @param  {File} file - File to be uploaded
   * @param  {Object} options
   * @param  {Object} options.hiddenSpace - true for hidden, false for open space
   * @private
   * @returns {Object} Encrypted Scr and KeyUrl
   */
  _uploadImage(channel, file, options) {
    options = options || {};

    return this.spark.encryption.encryptBinary(file)
      .then(({scr, cdata}) => Promise.all([scr, this._uploadImageToSparkFiles(channel, cdata, options.hiddenSpace)]))
      .then(([scr, res]) => assign(scr, {loc: res.downloadUrl}));
  },

  _getSpaceUrl(channel, hiddenSpace) {
    let requestUri = `${channel.channelUrl}/spaces/open`;
    if (hiddenSpace) {
      requestUri = `${channel.channelUrl}/spaces/hidden`;
    }

    return this.spark.request({
      method: `PUT`,
      uri: requestUri
    })
      .then((res) => res.body.spaceUrl);
  },

  _uploadImageToSparkFiles(channel, file, hiddenSpace) {
    const fileSize = file.length || file.size || file.byteLength;

    return this._getSpaceUrl(channel, hiddenSpace)
      .then((spaceUrl) => this.spark.upload({
        uri: `${spaceUrl}/upload_sessions`,
        file,
        qs: {
          transcode: true
        },
        phases: {
          initialize: {fileSize},
          upload: {
            $url(session) {
              return session.uploadUrl;
            }
          },
          finalize: {
            $uri(session) {
              return session.finishUploadUrl;
            },
            body: {fileSize}
          }
        }
      }));
  }
});

export default Board;
