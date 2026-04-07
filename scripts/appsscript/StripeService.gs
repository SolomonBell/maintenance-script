/**
 * StripeService.gs
 * Thin wrapper around the Stripe REST API using UrlFetchApp.
 * API key is read from Script Properties via CONFIG.
 */

var StripeService = (function () {

  var BASE_URL = 'https://api.stripe.com/v1';

  /**
   * Makes an authenticated request to the Stripe API.
   * @param {string} method - HTTP method (GET, POST).
   * @param {string} path - API path, e.g. '/customers'.
   * @param {Object} [payload] - Form-encoded body for POST requests.
   * @returns {Object} Parsed JSON response.
   */
  function request(method, path, payload) {
    var options = {
      method: method,
      headers: {
        Authorization: 'Bearer ' + CONFIG.STRIPE_SECRET_KEY,
      },
      muteHttpExceptions: true,
    };
    if (payload) {
      options.payload = payload;
    }
    var response = UrlFetchApp.fetch(BASE_URL + path, options);
    var json = JSON.parse(response.getContentText());
    if (json.error) throw new Error('Stripe error: ' + json.error.message);
    return json;
  }

  /**
   * Retrieves a customer by ID.
   * @param {string} customerId
   * @returns {Object}
   */
  function getCustomer(customerId) {
    return request('GET', '/customers/' + customerId);
  }

  /**
   * Creates a new customer.
   * @param {string} email
   * @param {string} [name]
   * @returns {Object}
   */
  function createCustomer(email, name) {
    return request('POST', '/customers', { email: email, name: name || '' });
  }

  return { getCustomer: getCustomer, createCustomer: createCustomer };
})();
