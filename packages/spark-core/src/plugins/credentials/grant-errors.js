/**!
 *
 * Copyright (c) 2015-2017 Cisco Systems, Inc. See LICENSE file.
 * @private
 */

/* eslint camelcase: [0] */

import {Exception} from '@ciscospark/common';

/**
 * Error thrown during oauth flow
 */
export class OAuthError extends Exception {
  /**
   * @param {HttpResponse} res
   * @returns {string}
   */
  parse(res) {
    Object.defineProperties(this, {
      error: {
        enumerable: true,
        value: res.body.error
      },
      errorDescription: {
        enumerable: true,
        value: res.body.error_description
      },
      errorUri: {
        enumerable: true,
        value: res.body.error_uri
      },
      res: {
        enumerable: false,
        value: res
      }
    });

    return this.errorDescription;
  }
}
/**
 * InvalidRequestError
 */
class InvalidRequestError extends OAuthError {}

/**
 * InvalidClientError
 */
class InvalidClientError extends OAuthError {}

/**
 * InvalidGrantError
 */
class InvalidGrantError extends OAuthError {}

/**
 * UnauthorizedClientError
 */
class UnauthorizedClientError extends OAuthError {}

/**
 * UnsupportGrantTypeError
 */
class UnsupportGrantTypeError extends OAuthError {}

/**
 * InvalidScopeError
 */
class InvalidScopeError extends OAuthError {}


const errors = {
  OAuthError,
  InvalidRequestError,
  InvalidClientError,
  InvalidGrantError,
  UnauthorizedClientError,
  UnsupportGrantTypeError,
  InvalidScopeError,
  invalid_request: InvalidRequestError,
  invalid_client: InvalidClientError,
  invalid_grant: InvalidGrantError,
  unauthorized_client: UnauthorizedClientError,
  unsupported_grant_type: UnsupportGrantTypeError,
  invalid_scope: InvalidScopeError,
  select(errorString) {
    return errors[errorString] || OAuthError;
  }
};

export default errors;
