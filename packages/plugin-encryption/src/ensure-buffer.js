/**!
 *
 * Copyright (c) 2015-2017 Cisco Systems, Inc. See LICENSE file.
 * @private
 */

/**
* Ensures the provider Buffer is, indeed, a Buffer; sometimes, they seem to be
* byte-arrays instead of proper Buffer objects.
* @param {mixed} buffer
* @returns {Promise<Buffer>}
*/
export default function ensureBuffer(buffer) {
  /* istanbul ignore if */
  if (!Buffer.isBuffer(buffer)) {
    return Promise.reject(new Error(`\`buffer\` must be a buffer`));
  }

  return Promise.resolve(buffer);
}
