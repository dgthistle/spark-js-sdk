/**!
 *
 * Copyright (c) 2015-2017 Cisco Systems, Inc. See LICENSE file.
 * @private
 */

import storageConfig from './config-storage';

export default {
  hydraServiceUrl: process.env.HYDRA_SERVICE_URL || `https://api.ciscospark.com/v1`,
  credentials: {
    clientType: `confidential`
  },
  storage: storageConfig
};
