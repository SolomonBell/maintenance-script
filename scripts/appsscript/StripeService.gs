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

  /**
   * Creates a Stripe Checkout Session for a one-time payment.
   *
   * Reads STRIPE_PRICE_ID, STRIPE_SUCCESS_URL, and STRIPE_CANCEL_URL from
   * Script Properties. All three must be set before calling this function.
   *
   * @param {string} email    - Customer email. Used for customer_email and client_reference_id.
   * @param {string} name     - Customer name. Informational only (stored in metadata).
   * @param {Object} metadata - Key/value pairs attached to the session for webhook reconciliation.
   * @returns {Object} Parsed Stripe CheckoutSession object. Access the URL via .url
   */
  function createCheckoutSession(email, name, metadata) {
    var props = PropertiesService.getScriptProperties();
    var priceId    = props.getProperty('STRIPE_PRICE_ID');
    var successUrl = props.getProperty('STRIPE_SUCCESS_URL');
    var cancelUrl  = props.getProperty('STRIPE_CANCEL_URL');

    if (!priceId)    throw new Error('StripeService.createCheckoutSession: STRIPE_PRICE_ID is not set');
    if (!successUrl) throw new Error('StripeService.createCheckoutSession: STRIPE_SUCCESS_URL is not set');
    if (!cancelUrl)  throw new Error('StripeService.createCheckoutSession: STRIPE_CANCEL_URL is not set');

    // Stripe's REST API uses form-encoding. Nested objects and arrays must be
    // expressed as bracket-notation string keys, not nested JS objects.
    var payload = {
      'mode':                    'payment',
      'line_items[0][price]':    priceId,
      'line_items[0][quantity]': '1',
      'customer_email':          email,
      'client_reference_id':     email,
      'success_url':             successUrl,
      'cancel_url':              cancelUrl,
    };

    // Flatten each metadata key into bracket-notation form.
    metadata = metadata || {};
    Object.keys(metadata).forEach(function (key) {
      payload['metadata[' + key + ']'] = String(metadata[key]);
    });

    return request('POST', '/checkout/sessions', payload);
  }

  return { getCustomer: getCustomer, createCustomer: createCustomer, createCheckoutSession: createCheckoutSession };
})();
